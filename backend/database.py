"""SQLite persistence for campaigns, delivery logs and Whapi trial usage stats."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator
from zoneinfo import ZoneInfo

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("APP_DB_PATH", str(BASE_DIR / "app.db")))
IST = ZoneInfo("Asia/Kolkata")

TRIAL_UNIQUE_CHAT_LIMIT = 5
TRIAL_MESSAGE_LIMIT = 150

STATUS_SCHEDULED = "Scheduled"
STATUS_RUNNING = "Running"
STATUS_COMPLETED = "Completed"
STATUS_CANCELLED = "Cancelled"

SCHEMA = """
CREATE TABLE IF NOT EXISTS campaigns (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    message_template TEXT    NOT NULL,
    selected_areas   TEXT    NOT NULL,          -- JSON array
    leads            TEXT    NOT NULL,          -- JSON array of {name, phone, area}
    mode             TEXT    NOT NULL CHECK (mode IN ('live', 'demo')),
    schedule_type    TEXT    NOT NULL CHECK (schedule_type IN ('now', 'delay', 'datetime')),
    scheduled_at     TEXT    NOT NULL,          -- ISO-8601, Asia/Kolkata offset
    status           TEXT    NOT NULL DEFAULT 'Scheduled'
                     CHECK (status IN ('Scheduled', 'Running', 'Completed', 'Cancelled')),
    total_count      INTEGER NOT NULL DEFAULT 0,
    sent_count       INTEGER NOT NULL DEFAULT 0,
    failed_count     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    started_at       TEXT,
    completed_at     TEXT,
    error            TEXT
);

CREATE TABLE IF NOT EXISTS delivery_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    name        TEXT,
    phone       TEXT    NOT NULL,
    area        TEXT,
    message     TEXT,
    mode        TEXT    NOT NULL CHECK (mode IN ('live', 'demo')),
    status      TEXT    NOT NULL CHECK (status IN ('Delivered', 'Failed')),
    response    TEXT,
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_campaign ON delivery_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_logs_live ON delivery_logs (mode, status, phone);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
"""


def now_ist() -> datetime:
    return datetime.now(IST)


def now_iso() -> str:
    return now_ist().isoformat(timespec="seconds")


def format_ist(value: str | None) -> str | None:
    """Human-readable IST string, e.g. '26 Nov 2026, 10:00 AM IST'."""
    if not value:
        return None
    dt = datetime.fromisoformat(value).astimezone(IST)
    return dt.strftime("%d %b %Y, %I:%M %p IST")


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)


# --------------------------------------------------------------------------- #
# Campaigns
# --------------------------------------------------------------------------- #
def _campaign_row_to_dict(row: sqlite3.Row, include_leads: bool = False) -> dict[str, Any]:
    data = dict(row)
    data["target_areas"] = json.loads(data.pop("selected_areas"))
    leads_json = data.pop("leads")
    if include_leads:
        data["leads"] = json.loads(leads_json)
    data["scheduled_at_ist"] = format_ist(data["scheduled_at"])
    data["created_at_ist"] = format_ist(data["created_at"])
    data["started_at_ist"] = format_ist(data["started_at"])
    data["completed_at_ist"] = format_ist(data["completed_at"])
    return data


def create_campaign(
    *,
    leads: list[dict[str, str]],
    selected_areas: list[str],
    message_template: str,
    mode: str,
    schedule_type: str,
    scheduled_at: datetime,
) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO campaigns (message_template, selected_areas, leads, mode, schedule_type,
                                   scheduled_at, status, total_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_template,
                json.dumps(selected_areas, ensure_ascii=False),
                json.dumps(leads, ensure_ascii=False),
                mode,
                schedule_type,
                scheduled_at.astimezone(IST).isoformat(timespec="seconds"),
                STATUS_SCHEDULED,
                len(leads),
                now_iso(),
            ),
        )
        return int(cur.lastrowid)


def get_campaign(campaign_id: int, include_leads: bool = False) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    return _campaign_row_to_dict(row, include_leads) if row else None


def list_campaigns() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM campaigns ORDER BY id DESC").fetchall()
    return [_campaign_row_to_dict(r) for r in rows]


def list_campaign_ids_by_status(*statuses: str) -> list[int]:
    placeholders = ",".join("?" for _ in statuses)
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT id FROM campaigns WHERE status IN ({placeholders})", statuses
        ).fetchall()
    return [r["id"] for r in rows]


def mark_running(campaign_id: int) -> bool:
    """Atomically move a campaign to Running. Returns False if it was cancelled/completed."""
    with get_conn() as conn:
        cur = conn.execute(
            """
            UPDATE campaigns
               SET status = ?, started_at = COALESCE(started_at, ?)
             WHERE id = ? AND status IN (?, ?)
            """,
            (STATUS_RUNNING, now_iso(), campaign_id, STATUS_SCHEDULED, STATUS_RUNNING),
        )
        return cur.rowcount == 1


def mark_completed(campaign_id: int, error: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE campaigns SET status = ?, completed_at = ?, error = ? WHERE id = ? AND status = ?",
            (STATUS_COMPLETED, now_iso(), error, campaign_id, STATUS_RUNNING),
        )


def mark_cancelled(campaign_id: int) -> bool:
    """Atomically cancel a campaign that has not started yet."""
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE campaigns SET status = ?, completed_at = ? WHERE id = ? AND status = ?",
            (STATUS_CANCELLED, now_iso(), campaign_id, STATUS_SCHEDULED),
        )
        return cur.rowcount == 1


def get_campaign_status(campaign_id: int) -> str | None:
    with get_conn() as conn:
        row = conn.execute("SELECT status FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    return row["status"] if row else None


# --------------------------------------------------------------------------- #
# Delivery logs
# --------------------------------------------------------------------------- #
def add_delivery_log(
    *,
    campaign_id: int,
    name: str,
    phone: str,
    area: str,
    message: str,
    mode: str,
    delivered: bool,
    response: str,
) -> None:
    status = "Delivered" if delivered else "Failed"
    counter = "sent_count" if delivered else "failed_count"
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO delivery_logs (campaign_id, name, phone, area, message, mode, status,
                                       response, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (campaign_id, name, phone, area, message, mode, status, response, now_iso()),
        )
        conn.execute(f"UPDATE campaigns SET {counter} = {counter} + 1 WHERE id = ?", (campaign_id,))


def get_delivery_logs(campaign_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM delivery_logs WHERE campaign_id = ? ORDER BY id", (campaign_id,)
        ).fetchall()
    logs = []
    for r in rows:
        item = dict(r)
        item["created_at_ist"] = format_ist(item["created_at"])
        logs.append(item)
    return logs


def get_logged_phones(campaign_id: int) -> set[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT phone FROM delivery_logs WHERE campaign_id = ?", (campaign_id,)
        ).fetchall()
    return {r["phone"] for r in rows}


# --------------------------------------------------------------------------- #
# Trial usage (computed from successful live deliveries)
# --------------------------------------------------------------------------- #
def get_live_chat_phones() -> set[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT phone FROM delivery_logs WHERE mode = 'live' AND status = 'Delivered'"
        ).fetchall()
    return {r["phone"] for r in rows}


def get_trial_usage() -> dict[str, int]:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(DISTINCT phone) AS unique_chats, COUNT(*) AS messages
              FROM delivery_logs
             WHERE mode = 'live' AND status = 'Delivered'
            """
        ).fetchone()
    return {
        "unique_chats_used": row["unique_chats"] or 0,
        "unique_chats_limit": TRIAL_UNIQUE_CHAT_LIMIT,
        "live_messages_sent": row["messages"] or 0,
        "live_messages_limit": TRIAL_MESSAGE_LIMIT,
    }
