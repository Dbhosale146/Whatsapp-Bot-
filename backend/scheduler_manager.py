"""APScheduler (Asia/Kolkata, SQLite job store) and the campaign execution worker."""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from pathlib import Path

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.base import JobLookupError
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler

import database as db
import whatsapp_client as wa

logger = logging.getLogger("scheduler")

BASE_DIR = Path(__file__).resolve().parent
JOBS_DB_URL = f"sqlite:///{(BASE_DIR / 'scheduler_jobs.db').as_posix()}"
TIMEZONE = "Asia/Kolkata"
DELAY_BETWEEN_MESSAGES_SECONDS = 1.0

scheduler = BackgroundScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=JOBS_DB_URL)},
    executors={"default": ThreadPoolExecutor(max_workers=4)},
    job_defaults={
        "coalesce": True,
        "max_instances": 1,
        # None = run late jobs whenever the server comes back instead of silently dropping them.
        "misfire_grace_time": None,
    },
    timezone=TIMEZONE,
)

# Per-campaign token overrides are kept in memory only (never persisted to disk).
# If the server restarts before the job runs, the .env token is used instead.
_token_overrides: dict[int, str] = {}
# Serialises live sends so concurrent campaigns cannot overshoot the trial limits.
_live_send_lock = threading.Lock()


def _job_id(campaign_id: int) -> str:
    return f"campaign-{campaign_id}"


def start() -> None:
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started (%s)", TIMEZONE)
    _recover_orphaned_campaigns()


def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


def _recover_orphaned_campaigns() -> None:
    """Re-queue campaigns that are Scheduled/Running but have no job (e.g. crash mid-run)."""
    for campaign_id in db.list_campaign_ids_by_status(db.STATUS_SCHEDULED, db.STATUS_RUNNING):
        if scheduler.get_job(_job_id(campaign_id)) is None:
            campaign = db.get_campaign(campaign_id)
            run_at = max(datetime.fromisoformat(campaign["scheduled_at"]), db.now_ist())
            logger.warning("Recovering campaign %s, re-scheduled for %s", campaign_id, run_at)
            schedule_campaign(campaign_id, run_at)


def schedule_campaign(campaign_id: int, run_at: datetime, token_override: str | None = None) -> None:
    if token_override:
        _token_overrides[campaign_id] = token_override
    scheduler.add_job(
        run_campaign,
        trigger="date",
        run_date=run_at,
        args=[campaign_id],
        id=_job_id(campaign_id),
        name=f"WhatsApp campaign #{campaign_id}",
        replace_existing=True,
    )


def cancel_campaign_job(campaign_id: int) -> None:
    _token_overrides.pop(campaign_id, None)
    try:
        scheduler.remove_job(_job_id(campaign_id))
    except JobLookupError:
        pass


def _check_trial_limits(phone: str) -> str | None:
    """Return an error message if sending a live message to `phone` would exceed the trial."""
    usage = db.get_trial_usage()
    if usage["live_messages_sent"] >= usage["live_messages_limit"]:
        return f"Trial limit reached: {usage['live_messages_limit']} live messages already sent"
    if phone not in db.get_live_chat_phones() and usage["unique_chats_used"] >= usage["unique_chats_limit"]:
        return f"Trial limit reached: {usage['unique_chats_limit']} unique chats already used"
    return None


def run_campaign(campaign_id: int) -> None:
    """Executed by APScheduler. Idempotent: leads already logged for this campaign are skipped."""
    if not db.mark_running(campaign_id):
        logger.info("Campaign %s is not runnable (cancelled or finished); skipping", campaign_id)
        return

    campaign = db.get_campaign(campaign_id, include_leads=True)
    mode = campaign["mode"]
    token = _token_overrides.get(campaign_id) or wa.get_env_token()
    already_logged = db.get_logged_phones(campaign_id)
    error: str | None = None
    first = True

    logger.info("Campaign %s started (%s mode, %d leads)", campaign_id, mode, len(campaign["leads"]))
    try:
        for lead in campaign["leads"]:
            phone = lead["phone"]
            if phone in already_logged:
                continue

            name, area = lead.get("name", ""), lead.get("area", "")
            body = wa.render_message(campaign["message_template"], name, area)
            log = dict(campaign_id=campaign_id, name=name, phone=phone, area=area, message=body, mode=mode)

            normalized = wa.normalize_indian_phone(phone)
            if not normalized:
                db.add_delivery_log(**log, delivered=False, response="Invalid Indian mobile number")
                continue

            if not first:
                time.sleep(DELAY_BETWEEN_MESSAGES_SECONDS)
            first = False

            if mode == "live":
                with _live_send_lock:
                    limit_error = _check_trial_limits(normalized)
                    if limit_error:
                        db.add_delivery_log(**log, delivered=False, response=limit_error)
                        continue
                    result = wa.send_message(normalized, body, mode, token)
                    db.add_delivery_log(**log, delivered=result.ok, response=result.response)
            else:
                result = wa.send_message(normalized, body, mode)
                db.add_delivery_log(**log, delivered=result.ok, response=result.response)

            already_logged.add(phone)
    except Exception as exc:  # keep the campaign from being stuck in "Running"
        logger.exception("Campaign %s crashed", campaign_id)
        error = f"Unexpected error: {exc}"
    finally:
        _token_overrides.pop(campaign_id, None)
        db.mark_completed(campaign_id, error)
        logger.info("Campaign %s completed", campaign_id)
