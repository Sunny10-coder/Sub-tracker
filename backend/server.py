"""SubMind backend — FastAPI + MongoDB + Gemini (Emergent universal key)."""
import os
import re
import math
import json
import uuid
import logging
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

import parsing
import linkintel

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("submind")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
FAST_MODEL = "gemini-3-flash-preview"
PRO_MODEL = "gemini-3.1-pro-preview"

USER_ID = "local"  # single-user app

app = FastAPI(title="SubMind API")
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# AI Router (Gemini via emergentintegrations)
# ---------------------------------------------------------------------------
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

EXTRACTION_SCHEMA_HINT = """Return ONLY a strict JSON object (no markdown, no prose) with keys:
{
  "content_type": one of ["subscription","trial","plan","link","reminder","payment","cancelled","note","unknown"]
      - "subscription": the user is ALREADY paying (receipt, renewal notice, welcome/confirmation)
      - "trial": a free trial the user has started
      - "plan": a plan, offer, promotion or marketing mail the user has NOT bought yet
      - "cancelled": confirmation that a subscription was cancelled/ended,
  "provider": string (the service, e.g. "Netflix"; from the sender name/domain/brand),
  "product": string,
  "plan": string (tier name, e.g. "Standard", "Pro", "Premium Individual"),
  "price": number or null (the RECURRING amount actually charged / to be charged; NEVER a discount or saving),
  "currency": string (ISO like "AED","USD"; default "AED" only if no currency appears),
  "billing_cycle": one of ["monthly","yearly","weekly","custom",""],
  "renewal_date": "YYYY-MM-DD" or null (next billing / renewal date),
  "trial_end": "YYYY-MM-DD" or null,
  "offer_expiry": "YYYY-MM-DD" or null (when a promo/offer stops being valid),
  "promo_code": string ("" if none; copy EXACTLY as written, same letters/digits),
  "discount": string (e.g. "50% off for 3 months", "first month free"; copy the wording, "" if none),
  "offer_description": string (one line describing the offer, "" if none),
  "is_promotional": boolean (marketing / deal / offer rather than a bill),
  "account_email": string (the mail id the account is registered to, usually the To: address; "" if not in the text),
  "cancel_url": string (a URL from the text to cancel/manage the subscription; "" if none),
  "cancel_steps": string (short steps to cancel if the text says how; "" otherwise),
  "category": string (e.g. "AI","Streaming","Music","Productivity","Cloud","Gaming","News","Fitness","Shopping","Other"),
  "tags": array of short strings,
  "summary": string (one concise sentence),
  "source_type": string,
  "suggested_destination": one of ["account","plan","link","ignore"] (account = already subscribed; plan = an offer/plan to consider; link = reference only),
  "doubts": array of short strings (anything you are unsure about; [] if sure),
  "confidence": number between 0 and 1
}
STRICT RULES: copy numbers, codes, dates and e-mail addresses exactly from the content. If a value is not
written in the content use null / "" — never guess, never invent a promo code, never use a discount amount
as the price. Resolve dates to YYYY-MM-DD using today's date given below."""


def mask_sensitive(text: str) -> str:
    """Mask long digit runs (card/account numbers) before sending to AI."""
    if not text:
        return text
    text = re.sub(r"\b(?:\d[ -]?){13,19}\b", "[REDACTED_CARD]", text)
    text = re.sub(r"\bCVV[:\s]*\d{3,4}\b", "[REDACTED_CVV]", text, flags=re.I)
    return text


def _extract_json(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?", "", raw).strip()
    raw = re.sub(r"```$", "", raw).strip()
    # find first {...} block
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except Exception:
        return None


def _new_chat(system: str, model: str, session: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session,
        system_message=system,
    ).with_model("gemini", model)


async def _send(chat: LlmChat, message: UserMessage) -> str:
    resp = await chat.send_message(message)
    if isinstance(resp, str):
        return resp
    return getattr(resp, "content", None) or getattr(resp, "text", None) or str(resp)


def _str_list(v) -> List[str]:
    return [str(x).strip() for x in (v or []) if str(x).strip()] if isinstance(v, list) else []


async def ai_extract(text: str = "", image_base64: Optional[str] = None,
                     source_type: str = "manual") -> Dict[str, Any]:
    """Vision + text structured extraction, then merged with and verified against
    a deterministic parse of the source text (exact promo codes, prices, dates,
    mail ids). Falls back flash->pro on failure, and to the deterministic parse
    alone if the AI is unreachable."""
    today = date.today().isoformat()
    system = ("You are SubMind's extraction engine. Read the provided content "
              "(emails, subscription screenshots, receipts, offers, links, notes) and "
              "extract structured data. Be accurate; if unsure, lower confidence and "
              f"list the doubt. Today's date is {today}. " + EXTRACTION_SCHEMA_HINT)
    safe_text = mask_sensitive(text)
    user_text = f"Source: {source_type}\nContent:\n{safe_text or '(image only)'}"
    file_contents = [ImageContent(image_base64=image_base64)] if image_base64 else None

    det = parsing.deterministic_extract(text) if text else {}
    ai_result: Optional[Dict[str, Any]] = None
    for model in ([PRO_MODEL] if image_base64 else [FAST_MODEL, PRO_MODEL]):
        try:
            chat = _new_chat(system, model, f"extract-{uuid.uuid4()}")
            msg = UserMessage(text=user_text, file_contents=file_contents) if file_contents \
                else UserMessage(text=user_text)
            raw = await _send(chat, msg)
            data = _extract_json(raw)
            if data:
                ai_result = _normalize_extraction(data, source_type)
                break
        except Exception as e:
            logger.warning("ai_extract %s failed: %s", model, e)
            continue

    if ai_result is None:
        # AI unreachable: build the best answer we can from the text alone.
        hint = (det.get("hint") or {}).get("kind", "unknown")
        ctype = {"subscription": "subscription", "trial": "trial", "promo": "plan", "cancelled": "cancelled"}.get(hint, "unknown")
        ai_result = _normalize_extraction({
            "content_type": ctype, "provider": det.get("provider", ""), "summary": safe_text[:140],
            "confidence": 0.5 if ctype != "unknown" else 0.2,
            "doubts": ["AI was unreachable — filled from the text only"],
        }, source_type)

    if text:
        merged = parsing.merge_and_verify(ai_result, det, text)
        return _normalize_extraction(merged, source_type)
    return ai_result


def _normalize_extraction(d: Dict[str, Any], source_type: str) -> Dict[str, Any]:
    def s(v):
        return str(v).strip() if v is not None else ""
    out = {
        "content_type": s(d.get("content_type") or "unknown").lower(),
        "provider": s(d.get("provider")),
        "product": s(d.get("product")),
        "plan": s(d.get("plan")),
        "price": d.get("price") if isinstance(d.get("price"), (int, float)) and not isinstance(d.get("price"), bool) else None,
        "currency": (s(d.get("currency")) or "AED").upper(),
        "billing_cycle": s(d.get("billing_cycle")).lower(),
        "renewal_date": d.get("renewal_date") or None,
        "trial_end": d.get("trial_end") or None,
        "offer_expiry": d.get("offer_expiry") or None,
        "promo_code": s(d.get("promo_code")).upper(),
        "promo_codes": [c.upper() for c in _str_list(d.get("promo_codes"))][:5],
        "discount": s(d.get("discount")),
        "discounts": _str_list(d.get("discounts"))[:6],
        "offer_description": s(d.get("offer_description")),
        "is_promotional": bool(d.get("is_promotional")),
        "account_email": s(d.get("account_email")).lower(),
        "sender_email": s(d.get("sender_email")).lower(),
        "email_subject": s(d.get("email_subject")),
        "cancel_url": s(d.get("cancel_url")),
        "cancel_steps": s(d.get("cancel_steps")),
        "category": s(d.get("category")) or "Other",
        "tags": [s(t) for t in d.get("tags", []) if s(t)][:8],
        "summary": s(d.get("summary")),
        "source_type": source_type,
        "suggested_destination": s(d.get("suggested_destination")).lower(),
        "doubts": _str_list(d.get("doubts"))[:5],
        "verified": d.get("verified") if isinstance(d.get("verified"), dict) else {},
        "confidence": float(d.get("confidence")) if isinstance(d.get("confidence"), (int, float)) else 0.5,
    }
    if out["promo_code"] and out["promo_code"] not in out["promo_codes"]:
        out["promo_codes"].insert(0, out["promo_code"])
    out["confidence"] = max(0.0, min(1.0, out["confidence"]))
    return out


async def ai_chat_answer(question: str, context: str) -> str:
    system = ("You are SubMind AI, the user's personal memory for subscriptions, plans, promo codes and "
              "saved links. Answer ONLY from the stored SubMind data below. Never invent subscriptions, "
              "prices, dates, codes or e-mail addresses. If the data does not contain the answer, say so "
              "plainly and say what is missing (e.g. 'no mail id saved for Netflix'). "
              "For 'when/where do I cancel' questions use memory.cancel_radar: give the cancel-by date, "
              "the amount avoided, where to cancel (URL/steps) and which account e-mail. "
              "Today's date is in the data. Keep answers short, scannable and in the user's currency.\n\n"
              f"USER DATA:\n{context}")
    try:
        chat = _new_chat(system, PRO_MODEL, f"chat-{uuid.uuid4()}")
        return await _send(chat, UserMessage(text=question))
    except Exception as e:
        logger.warning("ai_chat pro failed: %s", e)
        try:
            chat = _new_chat(system, FAST_MODEL, f"chat-{uuid.uuid4()}")
            return await _send(chat, UserMessage(text=question))
        except Exception as e2:
            logger.error("ai_chat failed: %s", e2)
            return "I couldn't reach the AI service right now. Please try again."


async def ai_compare(items: List[Dict[str, Any]]) -> str:
    system = ("You compare subscription plans objectively. Give a short markdown-free "
              "comparison highlighting price, value and differences. End with one neutral, "
              "informational observation. Do NOT give financial advice.")
    try:
        chat = _new_chat(system, PRO_MODEL, f"cmp-{uuid.uuid4()}")
        return await _send(chat, UserMessage(text="Compare these plans:\n" + json.dumps(items, default=str)))
    except Exception as e:
        logger.warning("ai_compare failed: %s", e)
        return "Comparison unavailable right now."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def base_query(extra: dict = None) -> dict:
    q = {"user_id": USER_ID, "deleted_at": None}
    if extra:
        q.update(extra)
    return q


async def get_settings() -> dict:
    doc = await db.settings.find_one({"user_id": USER_ID})
    if not doc:
        doc = {
            "user_id": USER_ID,
            "currency": "AED",
            "ai_enabled": True,
            "auto_add_threshold": 0.95,
            "confirm_threshold": 0.75,
            "keep_screenshots": False,
            "price_monitoring": True,
            "watchlist_frequency": "daily",
            "default_reminder_days": 3,
            "cancel_notice_days": 1,
            "theme": "system",
            "created_at": now_iso(),
        }
        await db.settings.insert_one(dict(doc))
    return clean(doc)


# ---------------------------------------------------------------------------
# Ingest pipeline
# ---------------------------------------------------------------------------
def _minus_days(iso: Optional[str], n: int) -> Optional[str]:
    try:
        return (datetime.fromisoformat(str(iso)[:10]).date() - timedelta(days=n)).isoformat()
    except Exception:
        return iso


async def _find_duplicate(extraction: dict) -> Optional[dict]:
    prov = extraction.get("provider", "").strip().lower()
    prod = extraction.get("product", "").strip().lower()
    if not prov and not prod:
        return None
    subs = await db.subscriptions.find(await base_query()).to_list(500)
    for sub in subs:
        sp = (sub.get("provider") or "").strip().lower()
        spr = (sub.get("product") or "").strip().lower()
        if prov and sp and prov == sp:
            return clean(sub)
        if prod and spr and prod == spr:
            return clean(sub)
    return None


def _reminder_from(extraction: dict, ref_type: str, ref_id: str) -> Optional[dict]:
    """A reminder the day BEFORE the money moves / the offer ends, so there is
    still time to act (cancel, or use the code)."""
    who = extraction.get("provider") or extraction.get("product") or "Item"
    price = extraction.get("price")
    cur = extraction.get("currency") or ""
    amt = f" ({cur} {price:g})" if isinstance(price, (int, float)) else ""
    if extraction.get("trial_end"):
        kind, date_, due = "trial_ending", extraction["trial_end"], _minus_days(extraction["trial_end"], 1)
        title = f"Trial ends {date_} — cancel {who} now if you don't want it{amt}"
    elif extraction.get("renewal_date"):
        kind, date_, due = "renewal", extraction["renewal_date"], _minus_days(extraction["renewal_date"], 1)
        title = f"{who} renews {date_}{amt} — cancel today to stop it"
    elif extraction.get("offer_expiry"):
        kind, date_, due = "offer_expiry", extraction["offer_expiry"], _minus_days(extraction["offer_expiry"], 1)
        code = extraction.get("promo_code")
        title = f"{who} offer ends {date_}" + (f" — code {code}" if code else "")
    else:
        return None
    return {
        "id": str(uuid.uuid4()), "user_id": USER_ID, "deleted_at": None,
        "title": title, "kind": kind, "due_date": due, "ref_type": ref_type, "ref_id": ref_id,
        "completed": False, "created_at": now_iso(),
    }


async def run_pipeline(extraction: dict, source: str, raw_text: str = "",
                       url: str = "", image_kept: Optional[str] = None) -> dict:
    """Route an extraction to a destination and store it. Returns the inbox item."""
    settings = await get_settings()
    conf = extraction.get("confidence", 0.5)
    ctype = extraction.get("content_type", "unknown")

    duplicate = None
    created_ref = None
    created_type = None

    if conf >= settings["auto_add_threshold"]:
        status = "auto_added"
    elif conf >= settings["confirm_threshold"]:
        status = "needs_confirmation"
    else:
        status = "needs_review"

    # Duplicate check for subscription-like items
    if ctype in ("subscription", "trial", "payment", "cancelled"):
        duplicate = await _find_duplicate(extraction)
        if duplicate:
            status = "duplicate"
        elif ctype == "cancelled":
            status = "needs_review"

    # Auto-create record when confident enough and not a duplicate
    if status == "auto_added" and not duplicate:
        if ctype in ("subscription", "trial"):
            created_ref = await _create_subscription_from(extraction, source, url, image_kept)
            created_type = "subscription"
        elif ctype == "link" or url:
            created_ref = await _create_link_from(extraction, source, url, raw_text)
            created_type = "link"
        elif ctype == "plan":
            created_ref = await _create_watchlist_from(extraction, source, url)
            created_type = "plan"

    inbox = {
        "id": str(uuid.uuid4()), "user_id": USER_ID, "deleted_at": None,
        "source": source, "content_type": ctype, "status": status,
        "extraction": extraction, "raw_text": raw_text[:6000], "url": url,
        "image_base64": image_kept, "summary": extraction.get("summary", ""),
        "confidence": conf, "duplicate_of": duplicate.get("id") if duplicate else None,
        "doubts": extraction.get("doubts", []),
        "suggested_destination": extraction.get("suggested_destination", ""),
        "created_ref": created_ref, "created_type": created_type,
        "created_at": now_iso(),
    }
    await db.smart_inbox.insert_one(dict(inbox))
    return clean(inbox)


async def _create_subscription_from(ex: dict, source: str, url: str, image: Optional[str]) -> str:
    sid = str(uuid.uuid4())
    status = "Trial" if ex.get("content_type") == "trial" or ex.get("trial_end") else "Active"
    cancel = parsing.cancel_info(ex.get("provider") or ex.get("product", ""), ex.get("cancel_url", ""), ex.get("cancel_steps", ""))
    sub = {
        "id": sid, "user_id": USER_ID, "deleted_at": None,
        "provider": ex.get("provider") or ex.get("product") or "Unknown",
        "product": ex.get("product") or ex.get("provider") or "Unknown",
        "plan": ex.get("plan", ""), "category": ex.get("category", "Other"),
        "status": status, "price": ex.get("price"), "currency": ex.get("currency", "AED"),
        "billing_cycle": ex.get("billing_cycle") or "monthly",
        "renewal_date": ex.get("renewal_date"), "start_date": ex.get("renewal_date"),
        "trial_end": ex.get("trial_end"), "auto_renew": True,
        "cancellation_date": None, "notes": "", "source": source, "source_url": url,
        "source_image": image, "related_links": [], "tags": ex.get("tags", []),
        # personal-memory fields: which mail id, where/how to cancel, promo used
        "account_email": ex.get("account_email", ""),
        "cancel_url": ex.get("cancel_url") or (cancel["url"] if cancel["source"] == "directory" else ""),
        "cancel_steps": ex.get("cancel_steps") or cancel.get("steps", ""),
        "promo_code": ex.get("promo_code", ""), "discount": ex.get("discount", ""),
        "payments": [], "price_history": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.subscriptions.insert_one(dict(sub))
    rem = _reminder_from(ex, "subscription", sid)
    if rem:
        await db.reminders.insert_one(dict(rem))
    return sid


async def _create_link_from(ex: dict, source: str, url: str, raw: str) -> str:
    lid = str(uuid.uuid4())
    kind = linkintel.classify_url(url) if url else "note"
    link = {
        "id": lid, "user_id": USER_ID, "deleted_at": None,
        "url": url, "canonical_url": url,
        "title": ex.get("product") or ex.get("provider") or (url[:60] if url else "Saved note"),
        "source": source, "kind": kind, "collection": linkintel.KINDS.get(kind, ("", "Notes"))[1],
        "thumbnail": None, "summary": ex.get("summary", ""),
        "category": ex.get("category", "Other"), "tags": ex.get("tags", []), "use_cases": [], "key_points": [],
        "note": raw[:500] if not url else "", "reminder_id": None,
        "related_subscription": None, "archived": False, "opened_count": 0,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.saved_links.insert_one(dict(link))
    return lid


async def _create_watchlist_from(ex: dict, source: str, url: str) -> str:
    wid = str(uuid.uuid4())
    plan = {
        "id": wid, "user_id": USER_ID, "deleted_at": None,
        "provider": ex.get("provider") or ex.get("product") or "Unknown",
        "plan": ex.get("plan") or ex.get("product", ""),
        "price": ex.get("price"), "currency": ex.get("currency", "AED"),
        "billing_cycle": ex.get("billing_cycle") or "monthly", "url": url, "source": source,
        "features": [], "offer_expiry": ex.get("offer_expiry"), "last_checked": now_iso(),
        "price_history": [], "notes": ex.get("offer_description") or ex.get("summary", ""), "status": "Watching",
        "promo_code": ex.get("promo_code", ""), "discount": ex.get("discount", ""),
        "account_email": ex.get("account_email", ""),
        "tags": ex.get("tags", []), "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.plan_watchlist.insert_one(dict(plan))
    rem = _reminder_from({**ex, "trial_end": None, "renewal_date": None}, "plan", wid) if ex.get("offer_expiry") else None
    if rem:
        await db.reminders.insert_one(dict(rem))
    return wid


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class IngestText(BaseModel):
    text: str
    source: str = "manual"


class IngestEmail(BaseModel):
    subject: str = ""
    sender: str = ""          # "Netflix <info@netflix.com>" or just the address
    to: str = ""              # the mail id the email was received on
    body: str
    date: str = ""
    source: str = "email"


class IngestImage(BaseModel):
    image_base64: str
    source: str = "screenshot"


class IngestLink(BaseModel):
    url: str
    source: str = "share"
    text: str = ""
    tags: List[str] = []
    remind_in_days: Optional[int] = None
    remind_at: Optional[str] = None


class IngestNotification(BaseModel):
    title: str = ""
    text: str = ""
    app_package: str = ""


class ChatBody(BaseModel):
    question: str


class CompareBody(BaseModel):
    ids: List[str]


class InboxAction(BaseModel):
    # add (auto) | account | plan | link | watchlist (= plan) | merge | ignore
    action: str
    edits: Optional[Dict[str, Any]] = None
    merge_into: Optional[str] = None


class LinkRemind(BaseModel):
    days: Optional[int] = None
    date: Optional[str] = None
    title: Optional[str] = None


# ---------------------------------------------------------------------------
# Ingest endpoints
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "SubMind", "status": "ok"}


@api.post("/ingest/text")
async def ingest_text(body: IngestText):
    # Pasted emails (with From:/To:/Subject: headers) are recognised automatically.
    source = body.source
    if parsing.parse_email(body.text)["is_email"] and source in ("manual", "note"):
        source = "email"
    ex = await ai_extract(text=body.text, source_type=source)
    return await run_pipeline(ex, source, raw_text=body.text)


@api.post("/ingest/email")
async def ingest_email(body: IngestEmail):
    parts = []
    if body.sender:
        parts.append(f"From: {body.sender}")
    if body.to:
        parts.append(f"To: {body.to}")
    if body.subject:
        parts.append(f"Subject: {body.subject}")
    if body.date:
        parts.append(f"Date: {body.date}")
    text = "\n".join(parts) + ("\n\n" if parts else "") + body.body
    ex = await ai_extract(text=text, source_type=body.source)
    return await run_pipeline(ex, body.source, raw_text=text)


@api.post("/ingest/image")
async def ingest_image(body: IngestImage):
    settings = await get_settings()
    ex = await ai_extract(image_base64=body.image_base64, source_type=body.source)
    kept = body.image_base64 if settings.get("keep_screenshots") else None
    return await run_pipeline(ex, body.source, image_kept=kept)


LINK_KEYWORDS = ["subscription", "trial", "plan", "pricing", "price", "offer", "premium", "pro"]

LINK_SYSTEM = (
    "You are SubMind's link analyst. The user saves links so they never forget them. From the facts "
    "provided, produce a compact, honest analysis. Use ONLY the facts given; if they are thin say so in "
    "'summary' and keep other fields short. Never claim you watched a video — you only have its caption/"
    "metadata. Return ONLY strict JSON: {"
    '"title": short clear title, '
    '"summary": 1-2 sentences, '
    '"category": one of ["AI","Dev Tools","Design","Learning","Productivity","Business","Finance","Health","Food","Travel","Entertainment","Shopping","News","Other"], '
    '"tags": 3-8 lowercase single-word or hyphenated tags, '
    '"use_cases": up to 4 SHORT practical use cases starting with a verb (e.g. "Add auth to a FastAPI app"), '
    '"key_points": up to 4 short takeaways (for videos: what the post says/teaches), '
    '"worth_remembering": one line on why the user might have saved it}'
)


async def ai_link_analysis(kind: str, url: str, facts: str, note: str) -> Optional[Dict[str, Any]]:
    prompt = f"Kind: {kind}\nURL: {url}\nUser note: {note or '(none)'}\n\nFACTS:\n{mask_sensitive(facts)[:5000]}"
    for model in (FAST_MODEL, PRO_MODEL):
        try:
            chat = _new_chat(LINK_SYSTEM, model, f"link-{uuid.uuid4()}")
            data = _extract_json(await _send(chat, UserMessage(text=prompt)))
            if data:
                return data
        except Exception as e:
            logger.warning("ai_link_analysis %s failed: %s", model, e)
    return None


def _fetch_link_facts(kind: str, url: str) -> Dict[str, Any]:
    """Blocking network work — run in a thread. Returns facts + extras for the link doc."""
    facts: Dict[str, Any] = {"text": "", "title": "", "thumbnail": None, "extra": {}, "basis": "url_only", "tags": []}
    if kind == "github":
        gh = linkintel.parse_github(url)
        if gh:
            info = linkintel.fetch_github(gh["owner"], gh["repo"])
            if info.get("ok"):
                facts["title"] = info["full_name"] or f'{gh["owner"]}/{gh["repo"]}'
                facts["thumbnail"] = info.get("avatar")
                facts["text"] = (f"Repository: {info['full_name']}\nDescription: {info['description']}\n"
                                 f"Language: {info.get('language')}\nTopics: {', '.join(info['topics'])}\n"
                                 f"Stars: {info.get('stars')}\nREADME excerpt: {info.get('readme', '')}")
                facts["extra"] = {"repo": {k: info.get(k) for k in ("full_name", "description", "stars", "forks", "language", "topics", "license", "updated_at", "homepage", "archived")}}
                facts["tags"] = info["topics"] + ([info["language"]] if info.get("language") else [])
                facts["basis"] = "readme" if info.get("readme") else "repo_metadata"
                return facts
            facts["title"] = f'{gh["owner"]}/{gh["repo"]}'
            facts["text"] = f'GitHub repository {gh["owner"]}/{gh["repo"]} (metadata unavailable).'
            facts["basis"] = "url_only"
            return facts
    if kind == "instagram":
        ig = linkintel.fetch_instagram(url)
        code = linkintel.instagram_shortcode(url) or {}
        facts["title"] = (f"Instagram {code.get('type', 'post')} by @{ig['author']}" if ig.get("author") else f"Instagram {code.get('type', 'post')}")
        facts["thumbnail"] = ig.get("thumbnail")
        facts["tags"] = ig.get("hashtags", [])
        facts["extra"] = {"author": ig.get("author", ""), "ig_type": code.get("type", "post"), "login_wall": ig.get("login_wall", False)}
        if ig.get("ok"):
            facts["text"] = f"Instagram {code.get('type', 'post')} by @{ig.get('author', '?')}. Caption: {ig['caption']}"
            facts["basis"] = "caption"
        else:
            facts["text"] = "Instagram post; the caption could not be read (login required)."
            facts["basis"] = "url_only"
        return facts
    if kind in ("youtube", "tiktok", "x"):
        oe = linkintel.fetch_oembed(url, kind)
        pm = linkintel.fetch_page_meta(url)
        facts["title"] = oe.get("title") or pm.get("title", "")
        facts["thumbnail"] = oe.get("thumbnail") or pm.get("thumbnail")
        facts["extra"] = {"author": oe.get("author", "")}
        facts["text"] = f"Title: {facts['title']}\nChannel/author: {oe.get('author', '')}\nDescription: {pm.get('description', '')}"
        facts["basis"] = "metadata" if (facts["title"] or pm.get("description")) else "url_only"
        facts["tags"] = linkintel.hashtags(pm.get("description", ""))
        return facts
    pm = linkintel.fetch_page_meta(url)
    facts["title"] = pm.get("title", "")
    facts["thumbnail"] = pm.get("thumbnail")
    facts["text"] = f"Title: {pm.get('title', '')}\nDescription: {pm.get('description', '')}\n{pm.get('text', '')}"
    facts["basis"] = "page_text" if pm.get("ok") else "url_only"
    return facts


def _remind_date(days: Optional[int], at: Optional[str]) -> Optional[str]:
    if at:
        try:
            return datetime.fromisoformat(str(at)[:10]).date().isoformat()
        except Exception:
            return None
    if days is not None:
        return (date.today() + timedelta(days=max(0, days))).isoformat()
    return None


async def _add_link_reminder(lid: str, title: str, due: str) -> str:
    rid = str(uuid.uuid4())
    await db.reminders.insert_one({
        "id": rid, "user_id": USER_ID, "deleted_at": None, "title": f"Revisit: {title[:80]}",
        "kind": "link", "due_date": due, "ref_type": "link", "ref_id": lid,
        "recurring": None, "completed": False, "created_at": now_iso(),
    })
    await db.saved_links.update_one({"id": lid}, {"$set": {"reminder_id": rid, "reminder_due": due}})
    return rid


@api.post("/ingest/link")
async def ingest_link(body: IngestLink):
    import asyncio
    url = linkintel.normalize_url(body.url)
    kind = linkintel.classify_url(url)
    source = linkintel.KINDS[kind][0] if kind != "article" else (body.source if body.source not in ("share", "manual", "") else "Website")
    lid = str(uuid.uuid4())
    domain = re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
    user_tags = linkintel.build_tags(body.tags, linkintel.hashtags(body.text))
    base_link = {
        "id": lid, "user_id": USER_ID, "deleted_at": None,
        "url": url, "canonical_url": url,
        "title": domain or url[:60], "source": source, "kind": kind,
        "collection": linkintel.KINDS[kind][1], "thumbnail": None,
        "summary": "", "category": "Other", "tags": user_tags, "use_cases": [], "key_points": [],
        "note": body.text[:500],
        "reminder_id": None, "related_subscription": None, "archived": False, "opened_count": 0,
        "enrichment": "pending", "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.saved_links.insert_one(dict(base_link))

    # Reminder is created up-front so it exists even if enrichment fails.
    due = _remind_date(body.remind_in_days, body.remind_at)
    if due:
        await _add_link_reminder(lid, base_link["title"], due)

    # Enrich (best effort — runs the blocking HTTP calls off the event loop)
    facts = await asyncio.to_thread(_fetch_link_facts, kind, url)
    combined = f"{facts['text']}\nUser note: {body.text}".strip()
    analysis = await ai_link_analysis(kind, url, combined, body.text) or {}

    # Subscription/offer detection only for ordinary web pages
    ex: Dict[str, Any] = {}
    if kind == "article" and any(k in combined.lower() for k in LINK_KEYWORDS):
        ex = await ai_extract(text=f"URL: {url}\n{combined}", source_type=f"link:{source}")

    gh_repo = (facts["extra"] or {}).get("repo") or {}
    fallback_summary = gh_repo.get("description") or facts.get("title") or ""
    tags = linkintel.build_tags(
        user_tags, _str_list(analysis.get("tags")), facts.get("tags", []), [kind if kind != "article" else ""],
        _str_list(ex.get("tags")) if ex else [],
    )
    update = {
        "title": (analysis.get("title") or facts.get("title") or base_link["title"])[:200],
        "thumbnail": facts.get("thumbnail"),
        "summary": analysis.get("summary") or ex.get("summary") or fallback_summary,
        "category": analysis.get("category") or ex.get("category") or ("Dev Tools" if kind == "github" else "Other"),
        "tags": tags,
        "use_cases": _str_list(analysis.get("use_cases"))[:4],
        "key_points": _str_list(analysis.get("key_points"))[:4],
        "worth_remembering": str(analysis.get("worth_remembering") or ""),
        "analysis_basis": facts["basis"],          # what the analysis was actually based on
        "analysis_ai": bool(analysis),
        **(facts["extra"] or {}),
        "enrichment": "done", "updated_at": now_iso(),
    }
    await db.saved_links.update_one({"id": lid}, {"$set": update})
    if due:  # the reminder was created before the real title was known
        await db.reminders.update_one({"user_id": USER_ID, "ref_type": "link", "ref_id": lid},
                                      {"$set": {"title": f"Revisit: {update['title'][:80]}"}})

    # If it looks like a subscription/plan/offer, route to inbox too
    if ex.get("content_type") in ("subscription", "trial", "plan") and ex.get("provider"):
        ex["confidence"] = min(ex.get("confidence", 0.5), 0.9)  # links need review
        inbox = await run_pipeline(ex, f"link:{source}", raw_text=combined[:2000], url=url)
        return {"link_id": lid, "inbox": inbox, "extraction": ex}

    doc = await db.saved_links.find_one({"id": lid})
    return {"link_id": lid, "link": clean(doc), "extraction": ex}


NOTIF_KEYWORDS = ["subscription", "payment", "charged", "renewal", "invoice", "trial",
                  "membership", "plan", "billing", "auto-renew", "expires", "cancelled",
                  "price changed", "renew", "receipt"]


@api.post("/ingest/notification")
async def ingest_notification(body: IngestNotification):
    blob = f"{body.title} {body.text}".lower()
    if not any(k in blob for k in NOTIF_KEYWORDS):
        return {"skipped": True, "reason": "not subscription-related"}
    ex = await ai_extract(text=f"{body.title}\n{body.text}", source_type=f"notification:{body.app_package}")
    return await run_pipeline(ex, f"notification:{body.app_package}", raw_text=f"{body.title} {body.text}")


# ---------------------------------------------------------------------------
# Smart Inbox
# ---------------------------------------------------------------------------
@api.get("/inbox")
async def list_inbox(tab: str = "all"):
    q = await base_query()
    if tab == "needs_review":
        q["status"] = {"$in": ["needs_review", "needs_confirmation"]}
    elif tab == "auto_added":
        q["status"] = "auto_added"
    elif tab == "duplicates":
        q["status"] = "duplicate"
    items = await db.smart_inbox.find(q).sort("created_at", -1).to_list(200)
    return [clean(i) for i in items]


@api.get("/inbox/{item_id}")
async def get_inbox_item(item_id: str):
    item = await db.smart_inbox.find_one({"id": item_id, "user_id": USER_ID})
    if not item:
        raise HTTPException(404, "Inbox item not found")
    return clean(item)


@api.post("/inbox/{item_id}/reanalyze")
async def inbox_reanalyze(item_id: str):
    """Run the (improved) extraction again on the stored text of an item."""
    item = await db.smart_inbox.find_one({"id": item_id, "user_id": USER_ID})
    if not item:
        raise HTTPException(404, "Inbox item not found")
    text = item.get("raw_text") or ""
    if not text.strip():
        raise HTTPException(400, "Nothing to re-analyze (screenshots can't be re-read)")
    ex = await ai_extract(text=text, source_type=item.get("source", "manual"))
    await db.smart_inbox.update_one({"id": item_id}, {"$set": {
        "extraction": ex, "content_type": ex.get("content_type"), "confidence": ex.get("confidence", 0.5),
        "summary": ex.get("summary", ""), "doubts": ex.get("doubts", []),
        "suggested_destination": ex.get("suggested_destination", ""),
    }})
    return clean(await db.smart_inbox.find_one({"id": item_id}))


@api.post("/inbox/{item_id}/action")
async def inbox_action(item_id: str, body: InboxAction):
    item = await db.smart_inbox.find_one({"id": item_id, "user_id": USER_ID})
    if not item:
        raise HTTPException(404, "Inbox item not found")
    ex = dict(item.get("extraction", {}))
    if body.edits:
        ex.update({k: v for k, v in body.edits.items() if v is not None})
        for f in ("price",):
            if f in ex and isinstance(ex[f], str):
                try:
                    ex[f] = float(ex[f].replace(",", "")) if ex[f].strip() else None
                except ValueError:
                    ex[f] = None
        for f in ("promo_code", "account_email"):
            if isinstance(ex.get(f), str):
                ex[f] = ex[f].strip().upper() if f == "promo_code" else ex[f].strip().lower()

    if body.action == "ignore":
        await db.smart_inbox.update_one({"id": item_id}, {"$set": {"status": "ignored", "deleted_at": now_iso()}})
        return {"ok": True, "status": "ignored"}

    if body.action == "merge" and body.merge_into:
        upd = {k: v for k, v in {
            "price": ex.get("price"), "renewal_date": ex.get("renewal_date"),
            "trial_end": ex.get("trial_end"), "plan": ex.get("plan"),
            "account_email": ex.get("account_email"), "cancel_url": ex.get("cancel_url"),
            "promo_code": ex.get("promo_code"),
        }.items() if v}
        if ex.get("content_type") == "cancelled":
            upd["status"] = "Cancelled"
            upd["cancellation_date"] = date.today().isoformat()
        upd["updated_at"] = now_iso()
        await db.subscriptions.update_one({"id": body.merge_into, "user_id": USER_ID}, {"$set": upd})
        await db.smart_inbox.update_one({"id": item_id}, {"$set": {"status": "merged"}})
        return {"ok": True, "status": "merged", "subscription_id": body.merge_into}

    src, url = item.get("source", "manual"), item.get("url", "")
    action = {"watchlist": "plan", "add": "auto"}.get(body.action, body.action)

    if action == "auto":
        ctype = ex.get("content_type", "unknown")
        if ctype == "plan" or ex.get("is_promotional"):
            action = "plan"
        elif ctype == "link" or (url and ctype not in ("subscription", "trial")):
            action = "link"
        else:
            action = "account"

    # When the user is in doubt they pick the destination themselves.
    if action == "plan":
        ref = await _create_watchlist_from(ex, src, url)
        rtype = "plan"
    elif action == "link":
        ref = await _create_link_from(ex, src, url, item.get("raw_text", ""))
        rtype = "link"
    elif action == "account":
        if ex.get("content_type") not in ("subscription", "trial"):
            ex["content_type"] = "trial" if ex.get("trial_end") and not ex.get("renewal_date") else "subscription"
        ref = await _create_subscription_from(ex, src, url, item.get("image_base64"))
        rtype = "subscription"
    else:
        raise HTTPException(400, f"Unknown action '{body.action}'")
    await db.smart_inbox.update_one({"id": item_id}, {"$set": {
        "status": "added" if body.action != "watchlist" else "saved", "created_ref": ref, "created_type": rtype,
        "extraction": ex}})
    return {"ok": True, "status": "added", "ref": ref, "type": rtype, "plan_id": ref if rtype == "plan" else None}


# ---------------------------------------------------------------------------
# Subscriptions CRUD
# ---------------------------------------------------------------------------
@api.get("/subscriptions")
async def list_subscriptions(status: Optional[str] = None, category: Optional[str] = None):
    extra = {}
    if status and status != "All":
        extra["status"] = status
    if category and category != "All":
        extra["category"] = category
    subs = await db.subscriptions.find(await base_query(extra)).sort("created_at", -1).to_list(500)
    return [clean(s) for s in subs]


@api.get("/subscriptions/{sid}")
async def get_subscription(sid: str):
    doc = await db.subscriptions.find_one({"id": sid, "user_id": USER_ID, "deleted_at": None})
    if not doc:
        raise HTTPException(404, "Not found")
    return clean(doc)


@api.post("/subscriptions")
async def create_subscription(body: Dict[str, Any]):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid, "user_id": USER_ID, "deleted_at": None,
        "provider": body.get("provider", "Unknown"), "product": body.get("product") or body.get("provider", "Unknown"),
        "plan": body.get("plan", ""), "category": body.get("category", "Other"),
        "status": body.get("status", "Active"), "price": body.get("price"),
        "currency": body.get("currency", "AED"), "billing_cycle": body.get("billing_cycle", "monthly"),
        "renewal_date": body.get("renewal_date"), "start_date": body.get("start_date"),
        "trial_end": body.get("trial_end"), "auto_renew": body.get("auto_renew", True),
        "cancellation_date": body.get("cancellation_date"), "notes": body.get("notes", ""),
        "source": body.get("source", "manual"), "source_url": body.get("source_url", ""),
        "source_image": None, "related_links": [], "tags": body.get("tags", []),
        "account_email": str(body.get("account_email") or "").strip().lower(),
        "cancel_url": str(body.get("cancel_url") or "").strip(),
        "cancel_steps": str(body.get("cancel_steps") or "").strip(),
        "promo_code": str(body.get("promo_code") or "").strip().upper(),
        "discount": str(body.get("discount") or "").strip(),
        "payments": [], "price_history": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.subscriptions.insert_one(dict(doc))
    if body.get("create_reminder") and (doc["renewal_date"] or doc["trial_end"]):
        rem = _reminder_from(doc, "subscription", sid)
        if rem:
            await db.reminders.insert_one(dict(rem))
    return clean(doc)


@api.patch("/subscriptions/{sid}")
async def update_subscription(sid: str, body: Dict[str, Any]):
    doc = await db.subscriptions.find_one({"id": sid, "user_id": USER_ID})
    if not doc:
        raise HTTPException(404, "Not found")
    body.pop("id", None); body.pop("_id", None); body.pop("user_id", None)
    if "price" in body and body["price"] != doc.get("price"):
        hist = doc.get("price_history", [])
        hist.append({"price": doc.get("price"), "date": now_iso()})
        body["price_history"] = hist
    body["updated_at"] = now_iso()
    await db.subscriptions.update_one({"id": sid}, {"$set": body})
    updated = await db.subscriptions.find_one({"id": sid})
    return clean(updated)


@api.post("/subscriptions/{sid}/payment")
async def record_payment(sid: str, body: Dict[str, Any]):
    """Record only a user-confirmed payment; reject duplicates and unknown charges."""
    doc = await db.subscriptions.find_one({"id": sid, "user_id": USER_ID})
    if not doc:
        raise HTTPException(404, "Not found")
    raw_amount = body.get("amount")
    if isinstance(raw_amount, bool) or raw_amount is None:
        raise HTTPException(422, "Confirm the actual charged amount.")
    try:
        amount = float(raw_amount)
    except (TypeError, ValueError):
        raise HTTPException(422, "Invalid payment amount.")
    if not math.isfinite(amount) or amount < 0:
        raise HTTPException(422, "Payment amount must be finite and non-negative.")
    currency = str(body.get("currency") or doc.get("currency") or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{3,5}", currency):
        raise HTTPException(422, "Confirm payment currency.")
    paid_on = str(body.get("date") or "").strip()
    try:
        datetime.strptime(paid_on, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, "Confirm payment date in YYYY-MM-DD format.")
    payments = doc.get("payments") or []
    prior = next((p for p in payments
                  if str(p.get("date", ""))[:10] == paid_on and
                  str(p.get("currency", "")).upper() == currency and
                  isinstance(p.get("amount"), (int, float)) and
                  float(p["amount"]) == amount), None)
    if prior:
        return {"ok": True, "duplicate": True, "payments": payments}
    payments.append({"amount": amount, "currency": currency,
                     "date": paid_on, "source": "manual-confirmed"})
    await db.subscriptions.update_one({"id": sid, "user_id": USER_ID},
                                      {"$set": {"payments": payments, "updated_at": now_iso()}})
    return {"ok": True, "duplicate": False, "payments": payments}


@api.delete("/subscriptions/{sid}")
async def delete_subscription(sid: str):
    await db.subscriptions.update_one({"id": sid, "user_id": USER_ID}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Links (Link Vault)
# ---------------------------------------------------------------------------
@api.get("/links")
async def list_links(source: Optional[str] = None, archived: bool = False,
                     kind: Optional[str] = None, tag: Optional[str] = None):
    extra = {"archived": archived}
    if source and source != "All":
        extra["source"] = source
    if kind and kind != "all":
        extra["kind"] = kind
    if tag:
        extra["tags"] = tag.lower()
    links = await db.saved_links.find(await base_query(extra)).sort("created_at", -1).to_list(500)
    return [clean(l) for l in links]


@api.get("/links/tags")
async def link_tags():
    """Every tag in use with counts — for the tag filter."""
    links = await db.saved_links.find(await base_query({"archived": False})).to_list(1000)
    counts: Dict[str, int] = {}
    for l in links:
        for t in l.get("tags", []):
            counts[t] = counts.get(t, 0) + 1
    return [{"tag": t, "count": c} for t, c in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]


@api.get("/links/{lid}")
async def get_link(lid: str):
    doc = await db.saved_links.find_one({"id": lid, "user_id": USER_ID, "deleted_at": None})
    if not doc:
        raise HTTPException(404, "Not found")
    return clean(doc)


@api.post("/links")
async def create_link(body: IngestLink):
    return await ingest_link(body)


@api.patch("/links/{lid}")
async def update_link(lid: str, body: Dict[str, Any]):
    body.pop("id", None); body.pop("_id", None)
    if isinstance(body.get("tags"), list):
        body["tags"] = linkintel.build_tags(body["tags"])
    body["updated_at"] = now_iso()
    await db.saved_links.update_one({"id": lid, "user_id": USER_ID}, {"$set": body})
    doc = await db.saved_links.find_one({"id": lid})
    return clean(doc)


@api.post("/links/{lid}/opened")
async def link_opened(lid: str):
    await db.saved_links.update_one({"id": lid, "user_id": USER_ID}, {
        "$inc": {"opened_count": 1}, "$set": {"last_opened_at": now_iso()}})
    return {"ok": True}


@api.post("/links/{lid}/remind")
async def link_remind(lid: str, body: LinkRemind):
    doc = await db.saved_links.find_one({"id": lid, "user_id": USER_ID, "deleted_at": None})
    if not doc:
        raise HTTPException(404, "Not found")
    due = _remind_date(body.days, body.date)
    if not due:
        raise HTTPException(400, "Give a number of days or a date (YYYY-MM-DD)")
    if doc.get("reminder_id"):  # one live reminder per link: replace the old one
        await db.reminders.update_one({"id": doc["reminder_id"]}, {"$set": {"deleted_at": now_iso()}})
    rid = await _add_link_reminder(lid, body.title or doc.get("title", "link"), due)
    return {"ok": True, "reminder_id": rid, "due_date": due}


@api.delete("/links/{lid}")
async def delete_link(lid: str):
    await db.saved_links.update_one({"id": lid, "user_id": USER_ID}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Plan Watchlist
# ---------------------------------------------------------------------------
@api.get("/watchlist")
async def list_watchlist():
    plans = await db.plan_watchlist.find(await base_query()).sort("created_at", -1).to_list(500)
    return [clean(p) for p in plans]


@api.get("/watchlist/{wid}")
async def get_plan(wid: str):
    doc = await db.plan_watchlist.find_one({"id": wid, "user_id": USER_ID, "deleted_at": None})
    if not doc:
        raise HTTPException(404, "Not found")
    return clean(doc)


@api.post("/watchlist")
async def create_plan(body: Dict[str, Any]):
    ex = {
        "provider": body.get("provider", "Unknown"), "plan": body.get("plan", ""),
        "price": body.get("price"), "currency": body.get("currency", "AED"),
        "billing_cycle": body.get("billing_cycle", "monthly"),
        "offer_expiry": body.get("offer_expiry"), "summary": body.get("notes", ""),
        "promo_code": str(body.get("promo_code") or "").strip().upper(),
        "discount": str(body.get("discount") or "").strip(),
        "account_email": str(body.get("account_email") or "").strip().lower(),
        "tags": body.get("tags", []),
    }
    wid = await _create_watchlist_from(ex, body.get("source", "manual"), body.get("url", ""))
    doc = await db.plan_watchlist.find_one({"id": wid})
    return clean(doc)


@api.patch("/watchlist/{wid}")
async def update_plan(wid: str, body: Dict[str, Any]):
    body.pop("id", None); body.pop("_id", None)
    body["updated_at"] = now_iso()
    await db.plan_watchlist.update_one({"id": wid, "user_id": USER_ID}, {"$set": body})
    doc = await db.plan_watchlist.find_one({"id": wid})
    return clean(doc)


@api.delete("/watchlist/{wid}")
async def delete_plan(wid: str):
    await db.plan_watchlist.update_one({"id": wid, "user_id": USER_ID}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api.post("/watchlist/{wid}/convert")
async def convert_plan(wid: str):
    doc = await db.plan_watchlist.find_one({"id": wid, "user_id": USER_ID})
    if not doc:
        raise HTTPException(404, "Not found")
    ex = {"content_type": "subscription", "provider": doc["provider"], "product": doc["provider"],
          "plan": doc.get("plan", ""), "price": doc.get("price"), "currency": doc.get("currency", "AED"),
          "billing_cycle": doc.get("billing_cycle", "monthly"), "category": "Other", "tags": doc.get("tags", [])}
    sid = await _create_subscription_from(ex, "watchlist", doc.get("url", ""), None)
    await db.plan_watchlist.update_one({"id": wid}, {"$set": {"status": "Subscribed", "updated_at": now_iso()}})
    return {"ok": True, "subscription_id": sid}


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------
@api.get("/reminders")
async def list_reminders():
    rems = await db.reminders.find(await base_query()).sort("due_date", 1).to_list(500)
    return [clean(r) for r in rems]


@api.post("/reminders")
async def create_reminder(body: Dict[str, Any]):
    rid = str(uuid.uuid4())
    doc = {
        "id": rid, "user_id": USER_ID, "deleted_at": None,
        "title": body.get("title", "Reminder"), "kind": body.get("kind", "custom"),
        "due_date": body.get("due_date"), "remind_time": body.get("remind_time", "09:00"), "ref_type": body.get("ref_type", "custom"),
        "ref_id": body.get("ref_id"), "recurring": body.get("recurring"),
        "completed": False, "created_at": now_iso(),
    }
    await db.reminders.insert_one(dict(doc))
    return clean(doc)


@api.patch("/reminders/{rid}")
async def update_reminder(rid: str, body: Dict[str, Any]):
    body.pop("id", None); body.pop("_id", None)
    if "remind_time" in body and not re.fullmatch(r"(?:[01]\\d|2[0-3]):[0-5]\\d",str(body["remind_time"])):
        raise HTTPException(422,"Time must use HH:MM")
    await db.reminders.update_one({"id": rid, "user_id": USER_ID}, {"$set": body})
    doc = await db.reminders.find_one({"id": rid})
    return clean(doc)


@api.delete("/reminders/{rid}")
async def delete_reminder(rid: str):
    await db.reminders.update_one({"id": rid, "user_id": USER_ID}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------
def _monthly_cost(sub: dict) -> float:
    price = sub.get("price") or 0
    cycle = (sub.get("billing_cycle") or "monthly").lower()
    if sub.get("status") in ("Cancelled", "Expired"):
        return 0.0
    if cycle == "yearly":
        return price / 12.0
    if cycle == "weekly":
        return price * 4.33
    return float(price)


@api.get("/insights")
async def insights():
    settings = await get_settings()
    subs = await db.subscriptions.find(await base_query()).to_list(500)
    subs = [clean(s) for s in subs]
    active = [s for s in subs if s.get("status") in ("Active", "Trial")]
    monthly = round(sum(_monthly_cost(s) for s in active), 2)
    yearly = round(monthly * 12, 2)

    today = datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=30)

    def parse(d):
        try:
            return datetime.fromisoformat(str(d)[:10]).date()
        except Exception:
            return None

    renewals = []
    trials = []
    for s in active:
        rd = parse(s.get("renewal_date"))
        if rd and today <= rd <= horizon:
            renewals.append({"id": s["id"], "provider": s["provider"], "date": s["renewal_date"],
                             "price": s.get("price"), "currency": s.get("currency")})
        td = parse(s.get("trial_end"))
        if td and today <= td <= horizon:
            trials.append({"id": s["id"], "provider": s["provider"], "date": s["trial_end"]})
    renewals.sort(key=lambda x: x["date"])
    trials.sort(key=lambda x: x["date"])

    # category breakdown & overlaps
    cats: Dict[str, float] = {}
    cat_count: Dict[str, list] = {}
    for s in active:
        c = s.get("category", "Other")
        cats[c] = cats.get(c, 0) + _monthly_cost(s)
        cat_count.setdefault(c, []).append(s.get("provider"))
    top_category = max(cats, key=cats.get) if cats else None
    overlaps = [{"category": c, "providers": p} for c, p in cat_count.items() if len(p) > 1]

    # price increases
    increases = []
    for s in subs:
        for h in s.get("price_history", []):
            if h.get("price") and s.get("price") and s["price"] > h["price"]:
                increases.append({"provider": s["provider"], "from": h["price"], "to": s["price"]})
                break

    watch = await db.plan_watchlist.find(await base_query()).to_list(200)
    return {
        "currency": settings["currency"],
        "monthly_spend": monthly, "yearly_spend": yearly,
        "active_count": len(active), "total_count": len(subs),
        "renewals_30d": renewals, "trials_ending": trials,
        "category_breakdown": [{"category": k, "amount": round(v, 2)} for k, v in
                               sorted(cats.items(), key=lambda x: -x[1])],
        "top_category": top_category, "overlaps": overlaps,
        "price_increases": increases, "watchlist_count": len(watch),
    }


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
@api.get("/search")
async def search(q: str = ""):
    q = q.strip()
    if not q:
        return {"subscriptions": [], "links": [], "plans": [], "reminders": []}
    rx = {"$regex": re.escape(q), "$options": "i"}
    base = await base_query()

    async def find(coll, fields):
        query = dict(base)
        query["$or"] = [{f: rx} for f in fields]
        docs = await coll.find(query).to_list(50)
        return [clean(d) for d in docs]

    return {
        "subscriptions": await find(db.subscriptions, ["provider", "product", "plan", "category", "notes", "account_email", "promo_code"]),
        "links": await find(db.saved_links, ["title", "summary", "url", "category", "note", "tags", "collection", "use_cases"]),
        "plans": await find(db.plan_watchlist, ["provider", "plan", "notes", "promo_code", "discount"]),
        "reminders": await find(db.reminders, ["title"]),
    }


# ---------------------------------------------------------------------------
# Knowledge Graph
# ---------------------------------------------------------------------------
@api.get("/graph")
async def graph():
    base = await base_query()
    subs = [clean(s) for s in await db.subscriptions.find(base).to_list(300)]
    links = [clean(l) for l in await db.saved_links.find(base).to_list(300)]
    plans = [clean(p) for p in await db.plan_watchlist.find(base).to_list(300)]

    nodes = []
    edges = []
    tag_nodes = {}
    cat_nodes = {}

    def tag_id(t):
        key = t.lower().strip()
        if key not in tag_nodes:
            tid = f"tag:{key}"
            tag_nodes[key] = tid
            nodes.append({"id": tid, "label": t, "type": "tag"})
        return tag_nodes[key]

    def cat_id(c):
        key = c.lower().strip()
        if key not in cat_nodes:
            cid = f"cat:{key}"
            cat_nodes[key] = cid
            nodes.append({"id": cid, "label": c, "type": "category"})
        return cat_nodes[key]

    for s in subs:
        nid = f"sub:{s['id']}"
        nodes.append({"id": nid, "label": s.get("provider", "Sub"), "type": "subscription",
                      "meta": {"price": s.get("price"), "currency": s.get("currency"), "status": s.get("status")}})
        if s.get("category"):
            edges.append({"source": nid, "target": cat_id(s["category"])})
        for t in s.get("tags", []):
            edges.append({"source": nid, "target": tag_id(t)})
    for l in links:
        nid = f"link:{l['id']}"
        nodes.append({"id": nid, "label": l.get("title", "Link")[:20], "type": "link",
                      "meta": {"source": l.get("source")}})
        if l.get("category"):
            edges.append({"source": nid, "target": cat_id(l["category"])})
        for t in l.get("tags", []):
            edges.append({"source": nid, "target": tag_id(t)})
    for p in plans:
        nid = f"plan:{p['id']}"
        nodes.append({"id": nid, "label": p.get("provider", "Plan"), "type": "plan"})
        for t in p.get("tags", []):
            edges.append({"source": nid, "target": tag_id(t)})
    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Personal memory dashboard — when / where to cancel, which mail id, what not to forget
# ---------------------------------------------------------------------------
async def build_memory() -> Dict[str, Any]:
    settings = await get_settings()
    notice = int(settings.get("cancel_notice_days", 1) or 1)
    today = date.today()
    base = await base_query()
    subs = [clean(x) for x in await db.subscriptions.find(base).to_list(500)]
    plans = [clean(x) for x in await db.plan_watchlist.find(base).to_list(300)]
    links = [clean(x) for x in await db.saved_links.find({**base, "archived": False}).to_list(500)]
    rems = [clean(x) for x in await db.reminders.find({**base, "completed": False}).to_list(500)]

    radar = [c for c in (parsing.cancel_plan(x, today, notice) for x in subs) if c]
    radar.sort(key=lambda c: c["cancel_by"])
    for c in radar:
        amt = f'{c["currency"] or ""} {c["price"]:g}'.strip() if isinstance(c["price"], (int, float)) else "the next charge"
        when = {"overdue": f'was {-c["days_left"]}d ago (charge date {c["charge_date"]})',
                "today": "TODAY", }.get(c["urgency"], f'by {c["cancel_by"]} ({c["days_left"]}d left)')
        c["message"] = (f'Cancel {c["provider"]} {when} to avoid {amt}. '
                        f'Where: {c["where"]["url"] or c["where"]["steps"]}. '
                        f'Account: {c["account_email"] or "mail id not saved"}.')

    # group active/trial subscriptions by the mail id they were bought with
    by_email: Dict[str, Dict[str, Any]] = {}
    for x in subs:
        if x.get("status") in ("Cancelled", "Expired"):
            continue
        em = (x.get("account_email") or "").lower() or "unknown"
        g = by_email.setdefault(em, {"email": em, "subscriptions": [], "monthly_total": 0.0})
        g["subscriptions"].append({"id": x["id"], "provider": x.get("provider"), "plan": x.get("plan", ""),
                                   "price": x.get("price"), "currency": x.get("currency"), "status": x.get("status")})
        g["monthly_total"] = round(g["monthly_total"] + _monthly_cost(x), 2)
    accounts = sorted(by_email.values(), key=lambda g: (g["email"] == "unknown", g["email"]))

    missing = []
    for x in subs:
        if x.get("status") in ("Cancelled", "Expired"):
            continue
        miss = [f for f, label in (("account_email", "mail id"), ("renewal_date", "renewal date")) if not x.get(f) and not (f == "renewal_date" and x.get("trial_end"))]
        if miss:
            missing.append({"id": x["id"], "provider": x.get("provider"), "missing": miss})

    promo_src = [{**x, "_ref_type": "subscription"} for x in subs if x.get("status") not in ("Cancelled", "Expired")] + \
                [{**x, "_ref_type": "plan"} for x in plans if x.get("status") != "Subscribed"]
    promos = parsing.active_promos(promo_src, today)

    # links: ones with a reminder coming up, and ones saved a while ago and never reopened
    link_rem = {r["ref_id"]: r for r in rems if r.get("ref_type") == "link" and r.get("ref_id")}
    forget: List[Dict[str, Any]] = []
    for l in links:
        r = link_rem.get(l["id"])
        age = 0
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(l["created_at"])).days
        except Exception:
            pass
        if r:
            forget.append({"id": l["id"], "title": l.get("title"), "kind": l.get("kind", "article"), "collection": l.get("collection", ""),
                           "reason": "reminder", "due_date": r.get("due_date"), "days_left": (parsing._d(r.get("due_date")) - today).days if parsing._d(r.get("due_date")) else None})
        elif not l.get("opened_count") and age >= 7:
            forget.append({"id": l["id"], "title": l.get("title"), "kind": l.get("kind", "article"), "collection": l.get("collection", ""),
                           "reason": "never_opened", "due_date": None, "days_left": None, "age_days": age})
    forget.sort(key=lambda f: (f["reason"] != "reminder", f["days_left"] if f["days_left"] is not None else 9999))

    upcoming = []
    for r in sorted(rems, key=lambda r: r.get("due_date") or "9999"):
        d = parsing._d(r.get("due_date"))
        if d and (d - today).days <= 14:
            upcoming.append({"id": r["id"], "title": r.get("title"), "due_date": r.get("due_date"), "days_left": (d - today).days, "kind": r.get("kind")})

    urgent = [c for c in radar if c["urgency"] in ("overdue", "today", "soon")]
    return {
        "today": today.isoformat(), "currency": settings["currency"], "notice_days": notice,
        "cancel_radar": radar, "urgent_count": len(urgent),
        "accounts_by_email": accounts, "missing_info": missing,
        "promos": promos, "dont_forget": forget[:30], "reminders_upcoming": upcoming[:20],
        "github_count": sum(1 for l in links if l.get("kind") == "github"),
        "link_count": len(links),
    }


@api.get("/memory/dashboard")
async def memory_dashboard():
    return await build_memory()


# ---------------------------------------------------------------------------
# AI: chat / extract / compare
# ---------------------------------------------------------------------------
async def _build_context() -> str:
    base = await base_query()
    subs = [clean(s) for s in await db.subscriptions.find(base).to_list(300)]
    links = [clean(l) for l in await db.saved_links.find(base).to_list(300)]
    plans = [clean(p) for p in await db.plan_watchlist.find(base).to_list(200)]
    rems = [clean(r) for r in await db.reminders.find(base).to_list(200)]
    ins = await insights()
    mem = await build_memory()

    def slim_sub(s):
        return {k: s.get(k) for k in ("provider", "product", "plan", "category", "status", "price", "currency",
                                      "billing_cycle", "renewal_date", "trial_end", "account_email",
                                      "cancel_url", "promo_code", "tags")}

    def slim_link(l):
        return {k: l.get(k) for k in ("title", "url", "kind", "category", "summary", "tags", "use_cases", "reminder_due")}

    def slim_plan(p):
        return {k: p.get(k) for k in ("provider", "plan", "price", "currency", "status", "offer_expiry", "promo_code", "discount", "url")}

    def slim_rem(r):
        return {k: r.get(k) for k in ("title", "kind", "due_date", "completed")}

    ctx = {
        "today": mem["today"],
        "spend": {"monthly": ins["monthly_spend"], "yearly": ins["yearly_spend"], "currency": ins["currency"]},
        "memory": {
            "cancel_radar": [{k: c.get(k) for k in ("provider", "plan", "status", "price", "currency", "charge_date",
                                                     "cancel_by", "days_left", "account_email", "where")} for c in mem["cancel_radar"]],
            "accounts_by_email": mem["accounts_by_email"],
            "promo_codes": mem["promos"],
        },
        "subscriptions": [slim_sub(s) for s in subs],
        "saved_links": [slim_link(l) for l in links],
        "plan_watchlist": [slim_plan(p) for p in plans],
        "reminders": [slim_rem(r) for r in rems],
    }
    return json.dumps(ctx, default=str)[:30000]


@api.post("/ai/chat")
async def ai_chat(body: ChatBody):
    ctx = await _build_context()
    answer = await ai_chat_answer(body.question, ctx)
    await db.chat_history.insert_one({"id": str(uuid.uuid4()), "user_id": USER_ID,
                                      "question": body.question, "answer": answer, "created_at": now_iso()})
    return {"answer": answer}


@api.get("/ai/chat/history")
async def chat_history():
    docs = await db.chat_history.find({"user_id": USER_ID}).sort("created_at", 1).to_list(100)
    return [clean(d) for d in docs]


@api.post("/ai/extract")
async def ai_extract_endpoint(body: IngestText):
    return await ai_extract(text=body.text, source_type=body.source)


@api.post("/ai/compare")
async def ai_compare_endpoint(body: CompareBody):
    plans = []
    for wid in body.ids:
        doc = await db.plan_watchlist.find_one({"id": wid, "user_id": USER_ID})
        if doc:
            plans.append({k: doc.get(k) for k in ("provider", "plan", "price", "currency", "billing_cycle", "notes")})
        else:
            sub = await db.subscriptions.find_one({"id": wid, "user_id": USER_ID})
            if sub:
                plans.append({k: sub.get(k) for k in ("provider", "product", "plan", "price", "currency", "billing_cycle")})
    if len(plans) < 2:
        raise HTTPException(400, "Need at least 2 items to compare")
    result = await ai_compare(plans)
    return {"comparison": result, "items": plans}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
@api.get("/settings")
async def read_settings():
    return await get_settings()


@api.patch("/settings")
async def patch_settings(body: Dict[str, Any]):
    body.pop("user_id", None); body.pop("_id", None)
    await get_settings()
    await db.settings.update_one({"user_id": USER_ID}, {"$set": body})
    return await get_settings()


# ---------------------------------------------------------------------------
# Speech to text
# ---------------------------------------------------------------------------
from emergentintegrations.llm.openai import OpenAISpeechToText

_stt = OpenAISpeechToText(EMERGENT_LLM_KEY) if EMERGENT_LLM_KEY else None


@api.post("/stt/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not _stt:
        raise HTTPException(503, "STT not configured")
    suffix = Path(file.filename or "audio.m4a").suffix.lower() or ".m4a"
    data = await file.read()
    if not data:
        raise HTTPException(413, "Empty audio")
    tmp_name = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_name = tmp.name
        result = _stt.transcribe(tmp_name)
        if isinstance(result, str):
            text = result
        elif isinstance(result, dict):
            text = result.get("text", "")
        else:
            text = getattr(result, "text", str(result))
        return {"text": (text or "").strip()}
    except Exception as e:
        logger.error("STT failed: %s", e)
        raise HTTPException(502, "Transcription failed")
    finally:
        if tmp_name:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
        await file.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
