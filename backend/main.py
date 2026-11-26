"""FastAPI app: lead parsing, campaign scheduling and delivery monitoring over Whapi.Cloud."""

from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

import database as db
import scheduler_manager
import whatsapp_client as wa

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("api")

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_LEAD_ROWS = 5000
REQUIRED_COLUMNS = ("Name", "Phone", "Area")
ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
MAX_DELAY = {"minutes": 60 * 24 * 30, "hours": 24 * 30}  # 30 days


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    scheduler_manager.start()
    try:
        yield
    finally:
        scheduler_manager.shutdown()


app = FastAPI(title="Realty WhatsApp Campaigns API", version="1.0.0", lifespan=lifespan)

_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class Lead(BaseModel):
    name: str = Field(default="", max_length=200)
    phone: str = Field(min_length=1, max_length=40)
    area: str = Field(default="", max_length=200)


class CampaignCreate(BaseModel):
    leads: list[Lead] = Field(min_length=1, max_length=MAX_LEAD_ROWS)
    selected_areas: list[str] = Field(min_length=1)
    message_template: str = Field(min_length=1, max_length=4096)
    schedule_type: Literal["now", "delay", "datetime"]
    delay_value: int | None = Field(default=None, ge=1)
    delay_unit: Literal["minutes", "hours"] | None = "minutes"
    scheduled_datetime: str | None = None
    mode: Literal["live", "demo"] = "demo"
    whapi_token_override: str | None = Field(default=None, max_length=512)

    @field_validator("message_template")
    @classmethod
    def _template_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message template cannot be empty")
        return v


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _area_key(area: str) -> str:
    return " ".join(area.split()).casefold()


def _clean_cell(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return " ".join(str(value).split())


def _read_upload(filename: str, content: bytes) -> pd.DataFrame:
    ext = Path(filename).suffix.lower()
    if ext == ".xlsx":
        return pd.read_excel(io.BytesIO(content), dtype=str, engine="openpyxl")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False, encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode CSV file; please save it as UTF-8")


def _resolve_run_time(payload: CampaignCreate) -> datetime:
    now = db.now_ist()
    if payload.schedule_type == "now":
        return now
    if payload.schedule_type == "delay":
        unit = payload.delay_unit or "minutes"
        if payload.delay_value is None:
            raise HTTPException(422, "delay_value is required for schedule_type 'delay'")
        if payload.delay_value > MAX_DELAY[unit]:
            raise HTTPException(422, f"Delay cannot exceed {MAX_DELAY[unit]} {unit} (30 days)")
        return now + timedelta(**{unit: payload.delay_value})

    if not payload.scheduled_datetime:
        raise HTTPException(422, "scheduled_datetime is required for schedule_type 'datetime'")
    try:
        run_at = datetime.fromisoformat(payload.scheduled_datetime)
    except ValueError:
        raise HTTPException(422, "scheduled_datetime must be ISO format, e.g. 2026-11-26T10:00")
    run_at = run_at.replace(tzinfo=db.IST) if run_at.tzinfo is None else run_at.astimezone(db.IST)
    if run_at <= now + timedelta(seconds=30):
        raise HTTPException(422, "Scheduled date & time must be in the future (IST)")
    if run_at > now + timedelta(days=365):
        raise HTTPException(422, "Scheduled date & time cannot be more than a year ahead")
    return run_at


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "scheduler_running": scheduler_manager.scheduler.running}


@app.get("/api/config/status")
def config_status() -> dict:
    return {
        "token_loaded": wa.get_env_token() is not None,
        "api_url": wa.get_api_url(),
        "channel_id": wa.get_channel_id(),
        "sender_number": wa.get_sender_number(),
        "timezone": scheduler_manager.TIMEZONE,
        "server_time_ist": db.now_iso(),
        "trial": db.get_trial_usage(),
    }


@app.post("/api/leads/parse")
async def parse_leads(file: UploadFile = File(...)) -> dict:
    filename = file.filename or ""
    if Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Unsupported file type. Upload a .csv or .xlsx file.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is too large (max 5 MB).")
    if not content.strip():
        raise HTTPException(400, "The uploaded file is empty.")

    try:
        df = _read_upload(filename, content)
    except Exception as exc:
        logger.info("Failed to parse upload %s: %s", filename, exc)
        raise HTTPException(400, f"Could not read file: {exc}")

    column_map = {str(c).strip().casefold(): c for c in df.columns}
    missing = [col for col in REQUIRED_COLUMNS if col.casefold() not in column_map]
    if missing:
        found = ", ".join(str(c) for c in df.columns) or "none"
        raise HTTPException(
            400, f"Missing required column(s): {', '.join(missing)}. Found columns: {found}."
        )

    name_col, phone_col, area_col = (column_map[c.casefold()] for c in REQUIRED_COLUMNS)
    df = df[[name_col, phone_col, area_col]]
    if len(df) > MAX_LEAD_ROWS:
        raise HTTPException(400, f"Too many rows ({len(df)}). Maximum is {MAX_LEAD_ROWS}.")

    leads: list[dict] = []
    seen_phones: dict[str, int] = {}
    area_display: dict[str, str] = {}
    area_counts: dict[str, int] = {}

    for idx, (raw_name, raw_phone, raw_area) in enumerate(df.itertuples(index=False, name=None)):
        name, phone_raw, area = _clean_cell(raw_name), _clean_cell(raw_phone), _clean_cell(raw_area)
        if not (name or phone_raw or area):
            continue  # skip blank rows

        row_number = idx + 2  # header is row 1
        area = area_display.setdefault(_area_key(area or "Unspecified"), area or "Unspecified")

        phone = wa.normalize_indian_phone(phone_raw)
        error = None
        if not phone:
            error = "Invalid Indian mobile number"
        elif phone in seen_phones:
            error = f"Duplicate of row {seen_phones[phone]}"
        else:
            seen_phones[phone] = row_number

        valid = error is None
        if valid:
            area_counts[area] = area_counts.get(area, 0) + 1
        else:
            area_counts.setdefault(area, 0)

        leads.append(
            {
                "row": row_number,
                "name": name,
                "phone_raw": phone_raw,
                "phone": phone,
                "area": area,
                "valid": valid,
                "error": error,
            }
        )

    if not leads:
        raise HTTPException(400, "No lead rows found in the file.")

    valid_count = sum(1 for lead in leads if lead["valid"])
    return {
        "filename": filename,
        "total_rows": len(leads),
        "valid_count": valid_count,
        "invalid_count": len(leads) - valid_count,
        "leads": leads,
        "area_counts": [
            {"area": a, "count": c}
            for a, c in sorted(area_counts.items(), key=lambda kv: (-kv[1], kv[0].casefold()))
        ],
    }


@app.post("/api/campaigns", status_code=201)
def create_campaign(
    payload: CampaignCreate,
    x_whapi_token: str | None = Header(default=None, alias="X-Whapi-Token"),
) -> dict:
    selected_keys = {_area_key(a) for a in payload.selected_areas if a.strip()}
    if not selected_keys:
        raise HTTPException(422, "Select at least one property area")

    # Filter by area, normalise phones and de-duplicate.
    targets: list[dict] = []
    seen: set[str] = set()
    for lead in payload.leads:
        if _area_key(lead.area) not in selected_keys:
            continue
        phone = wa.normalize_indian_phone(lead.phone) or lead.phone.strip()
        if phone in seen:
            continue
        seen.add(phone)
        targets.append({"name": lead.name.strip(), "phone": phone, "area": lead.area.strip()})

    if not targets:
        raise HTTPException(422, "No leads match the selected areas")

    token_override = (payload.whapi_token_override or x_whapi_token or "").strip() or None

    if payload.mode == "live":
        if not (token_override or wa.get_env_token()):
            raise HTTPException(400, "Live mode requires WHAPI_TOKEN in backend/.env or a token override")
        valid_phones = {t["phone"] for t in targets if wa.normalize_indian_phone(t["phone"])}
        usage = db.get_trial_usage()
        new_chats = valid_phones - db.get_live_chat_phones()
        chats_left = usage["unique_chats_limit"] - usage["unique_chats_used"]
        msgs_left = usage["live_messages_limit"] - usage["live_messages_sent"]
        if len(new_chats) > chats_left:
            raise HTTPException(
                400,
                f"Live sandbox allows {usage['unique_chats_limit']} unique chats; this campaign needs "
                f"{len(new_chats)} new chat(s) but only {max(chats_left, 0)} remain. "
                "Narrow the area filter or use Demo Simulation mode.",
            )
        if len(valid_phones) > msgs_left:
            raise HTTPException(
                400,
                f"Live sandbox has {max(msgs_left, 0)} message(s) left; this campaign needs "
                f"{len(valid_phones)}. Use Demo Simulation mode for bulk demos.",
            )

    run_at = _resolve_run_time(payload)
    campaign_id = db.create_campaign(
        leads=targets,
        selected_areas=sorted({t["area"] for t in targets}, key=str.casefold),
        message_template=payload.message_template.strip(),
        mode=payload.mode,
        schedule_type=payload.schedule_type,
        scheduled_at=run_at,
    )
    scheduler_manager.schedule_campaign(campaign_id, run_at, token_override)
    logger.info("Campaign %s created: %d leads, %s mode, runs at %s",
                campaign_id, len(targets), payload.mode, run_at.isoformat())
    return db.get_campaign(campaign_id)


@app.get("/api/campaigns")
def list_campaigns() -> list[dict]:
    return db.list_campaigns()


@app.get("/api/campaigns/{campaign_id}/logs")
def campaign_logs(campaign_id: int) -> dict:
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    return {"campaign": campaign, "logs": db.get_delivery_logs(campaign_id)}


@app.post("/api/campaigns/{campaign_id}/cancel")
def cancel_campaign(campaign_id: int) -> dict:
    campaign = db.get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if not db.mark_cancelled(campaign_id):
        raise HTTPException(409, f"Only scheduled campaigns can be cancelled (current status: "
                                 f"{db.get_campaign_status(campaign_id)})")
    scheduler_manager.cancel_campaign_job(campaign_id)
    logger.info("Campaign %s cancelled", campaign_id)
    return db.get_campaign(campaign_id)
