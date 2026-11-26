"""Whapi.Cloud text sender, demo-mode simulator and Indian phone number normalizer."""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DEFAULT_API_URL = "https://gate.whapi.cloud"
DEFAULT_CHANNEL_ID = "PUNISH-E8UJ3"
DEFAULT_SENDER_NUMBER = "+91 90820 63239"
TOKEN_PLACEHOLDER = "your_whapi_token_here"

REQUEST_TIMEOUT_SECONDS = 30
TYPING_TIME_SECONDS = 2
MAX_RESPONSE_CHARS = 2000

_INDIAN_MOBILE = re.compile(r"^91[6-9]\d{9}$")
_SCIENTIFIC = re.compile(r"^\d+(\.\d+)?[eE]\+?\d+$")


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
def get_api_url() -> str:
    return (os.getenv("WHAPI_API_URL") or DEFAULT_API_URL).strip().rstrip("/")


def get_channel_id() -> str:
    return (os.getenv("WHAPI_CHANNEL_ID") or DEFAULT_CHANNEL_ID).strip()


def get_sender_number() -> str:
    return (os.getenv("WHAPI_SENDER_NUMBER") or DEFAULT_SENDER_NUMBER).strip()


def get_env_token() -> str | None:
    token = (os.getenv("WHAPI_TOKEN") or "").strip()
    if not token or token == TOKEN_PLACEHOLDER:
        return None
    return token


# --------------------------------------------------------------------------- #
# Phone numbers & templating
# --------------------------------------------------------------------------- #
def normalize_indian_phone(raw: object) -> str | None:
    """Return digits-only international format (e.g. '919876543210') or None if invalid.

    Handles '+91 98765 43210', '098765-43210', '9876543210', '919876543210',
    and spreadsheet artefacts such as '9876543210.0' or '9.87654321E+9'.
    """
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    if _SCIENTIFIC.match(text):
        try:
            text = str(int(Decimal(text)))
        except (InvalidOperation, ValueError):
            return None
    elif re.fullmatch(r"\d+\.0+", text):
        text = text.split(".", 1)[0]

    digits = re.sub(r"\D", "", text)

    if digits.startswith("00"):  # international dialling prefix, e.g. 0091...
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):  # trunk prefix, e.g. 09876543210
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits

    return digits if _INDIAN_MOBILE.match(digits) else None


_PLACEHOLDER_NAME = re.compile(r"\{\s*name\s*\}", re.IGNORECASE)
_PLACEHOLDER_AREA = re.compile(r"\{\s*area\s*\}", re.IGNORECASE)


def render_message(template: str, name: str, area: str) -> str:
    rendered = _PLACEHOLDER_NAME.sub(lambda _: (name or "").strip() or "there", template)
    rendered = _PLACEHOLDER_AREA.sub(lambda _: (area or "").strip(), rendered)
    return rendered.strip()


# --------------------------------------------------------------------------- #
# Sending
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class SendResult:
    ok: bool
    response: str
    status_code: int | None = None


def _truncate(text: str) -> str:
    return text if len(text) <= MAX_RESPONSE_CHARS else text[: MAX_RESPONSE_CHARS - 3] + "..."


def send_text_live(to: str, body: str, token: str) -> SendResult:
    """POST {WHAPI_API_URL}/messages/text."""
    url = f"{get_api_url()}/messages/text"
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {token}",
    }
    payload = {"to": to, "body": body, "typing_time": TYPING_TIME_SECONDS}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        return SendResult(ok=False, response=_truncate(f"Network error: {exc}"))

    text = resp.text or ""
    ok = resp.ok
    try:
        data = resp.json()
        # Whapi returns {"sent": true, "message": {...}} on success.
        if isinstance(data, dict) and data.get("sent") is False:
            ok = False
        text = json.dumps(data, ensure_ascii=False)
    except ValueError:
        pass

    if not ok and not text:
        text = f"HTTP {resp.status_code} {resp.reason}"
    return SendResult(ok=ok, response=_truncate(text), status_code=resp.status_code)


def send_text_demo(to: str, body: str) -> SendResult:
    """Simulate a successful Whapi response without any network call."""
    time.sleep(0.2)  # small latency so the monitor shows realistic progress
    fake = {
        "sent": True,
        "simulated": True,
        "message": {
            "id": f"demo-{uuid.uuid4().hex[:16]}",
            "to": f"{to}@s.whatsapp.net",
            "type": "text",
            "status": "sent",
            "timestamp": int(time.time()),
            "chars": len(body),
        },
    }
    return SendResult(ok=True, response=json.dumps(fake), status_code=200)


def send_message(to: str, body: str, mode: str, token: str | None = None) -> SendResult:
    if mode == "demo":
        return send_text_demo(to, body)
    if not token:
        return SendResult(ok=False, response="WHAPI_TOKEN is not configured (set it in backend/.env)")
    return send_text_live(to, body, token)
