"""SubMind backend — FastAPI + MongoDB + Gemini (Emergent universal key)."""
import os
import re
import json
import uuid
import logging
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

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
  "content_type": one of ["subscription","trial","plan","link","reminder","payment","note","unknown"],
  "provider": string,
  "product": string,
  "plan": string,
  "price": number or null,
  "currency": string (ISO like "AED","USD"; default "AED" if unknown),
  "billing_cycle": one of ["monthly","yearly","weekly","custom",""],
  "renewal_date": "YYYY-MM-DD" or null,
  "trial_end": "YYYY-MM-DD" or null,
  "offer_expiry": "YYYY-MM-DD" or null,
  "category": string (e.g. "AI","Streaming","Music","Productivity","Cloud","Gaming","News","Fitness","Other"),
  "tags": array of short strings,
  "summary": string (one concise sentence),
  "source_type": string,
  "confidence": number between 0 and 1
}"""


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


async def ai_extract(text: str = "", image_base64: Optional[str] = None,
                     source_type: str = "manual") -> Dict[str, Any]:
    """Vision + text structured extraction. Falls back flash->pro on failure."""
    system = ("You are SubMind's extraction engine. Read the provided content "
              "(subscription screenshots, receipts, offers, links, notes) and "
              "extract structured data. Be accurate; if unsure, lower confidence. "
              + EXTRACTION_SCHEMA_HINT)
    safe_text = mask_sensitive(text)
    user_text = f"Source: {source_type}\nContent:\n{safe_text or '(image only)'}"
    file_contents = [ImageContent(image_base64=image_base64)] if image_base64 else None

    for model in ([PRO_MODEL] if image_base64 else [FAST_MODEL, PRO_MODEL]):
        try:
            chat = _new_chat(system, model, f"extract-{uuid.uuid4()}")
            msg = UserMessage(text=user_text, file_contents=file_contents) if file_contents \
                else UserMessage(text=user_text)
            raw = await _send(chat, msg)
            data = _extract_json(raw)
            if data:
                return _normalize_extraction(data, source_type)
        except Exception as e:
            logger.warning("ai_extract %s failed: %s", model, e)
            continue
    return _normalize_extraction({"content_type": "unknown", "summary": safe_text[:140],
                                  "confidence": 0.2}, source_type)


def _normalize_extraction(d: Dict[str, Any], source_type: str) -> Dict[str, Any]:
    def s(v):
        return str(v).strip() if v is not None else ""
    out = {
        "content_type": s(d.get("content_type") or "unknown").lower(),
        "provider": s(d.get("provider")),
        "product": s(d.get("product")),
        "plan": s(d.get("plan")),
        "price": d.get("price") if isinstance(d.get("price"), (int, float)) else None,
        "currency": (s(d.get("currency")) or "AED").upper(),
        "billing_cycle": s(d.get("billing_cycle")).lower(),
        "renewal_date": d.get("renewal_date") or None,
        "trial_end": d.get("trial_end") or None,
        "offer_expiry": d.get("offer_expiry") or None,
        "category": s(d.get("category")) or "Other",
        "tags": [s(t) for t in d.get("tags", []) if s(t)][:8],
        "summary": s(d.get("summary")),
        "source_type": source_type,
        "confidence": float(d.get("confidence")) if isinstance(d.get("confidence"), (int, float)) else 0.5,
    }
    out["confidence"] = max(0.0, min(1.0, out["confidence"]))
    return out


async def ai_chat_answer(question: str, context: str) -> str:
    system = ("You are SubMind AI, a friendly assistant that answers ONLY from the "
              "user's stored SubMind data provided below. Never invent subscriptions, "
              "prices or dates. If the data does not contain the answer, say so plainly. "
              "Keep answers concise, use the user's currency, and format money clearly.\n\n"
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
            "theme": "system",
            "created_at": now_iso(),
        }
        await db.settings.insert_one(dict(doc))
    return clean(doc)


# ---------------------------------------------------------------------------
# Ingest pipeline
# ---------------------------------------------------------------------------
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
    date = extraction.get("trial_end") or extraction.get("renewal_date") or extraction.get("offer_expiry")
    if not date:
        return None
    kind = "trial_ending" if extraction.get("trial_end") else (
        "offer_expiry" if extraction.get("offer_expiry") else "renewal")
    return {
        "id": str(uuid.uuid4()), "user_id": USER_ID, "deleted_at": None,
        "title": f"{kind.replace('_', ' ').title()}: {extraction.get('provider') or extraction.get('product') or 'Item'}",
        "kind": kind, "due_date": date, "ref_type": ref_type, "ref_id": ref_id,
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
    if ctype in ("subscription", "trial", "payment"):
        duplicate = await _find_duplicate(extraction)
        if duplicate:
            status = "duplicate"

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
        "extraction": extraction, "raw_text": raw_text[:2000], "url": url,
        "image_base64": image_kept, "summary": extraction.get("summary", ""),
        "confidence": conf, "duplicate_of": duplicate.get("id") if duplicate else None,
        "created_ref": created_ref, "created_type": created_type,
        "created_at": now_iso(),
    }
    await db.smart_inbox.insert_one(dict(inbox))
    return clean(inbox)


async def _create_subscription_from(ex: dict, source: str, url: str, image: Optional[str]) -> str:
    sid = str(uuid.uuid4())
    status = "Trial" if ex.get("content_type") == "trial" or ex.get("trial_end") else "Active"
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
        "payments": [], "price_history": [], "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.subscriptions.insert_one(dict(sub))
    rem = _reminder_from(ex, "subscription", sid)
    if rem:
        await db.reminders.insert_one(dict(rem))
    return sid


async def _create_link_from(ex: dict, source: str, url: str, raw: str) -> str:
    lid = str(uuid.uuid4())
    link = {
        "id": lid, "user_id": USER_ID, "deleted_at": None,
        "url": url, "canonical_url": url,
        "title": ex.get("product") or ex.get("provider") or (url[:60] if url else "Saved note"),
        "source": source, "thumbnail": None, "summary": ex.get("summary", ""),
        "category": ex.get("category", "Other"), "tags": ex.get("tags", []),
        "note": raw[:500] if not url else "", "reminder_id": None,
        "related_subscription": None, "archived": False,
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
        "price_history": [], "notes": ex.get("summary", ""), "status": "Watching",
        "tags": ex.get("tags", []), "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.plan_watchlist.insert_one(dict(plan))
    return wid


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class IngestText(BaseModel):
    text: str
    source: str = "manual"


class IngestImage(BaseModel):
    image_base64: str
    source: str = "screenshot"


class IngestLink(BaseModel):
    url: str
    source: str = "share"
    text: str = ""


class IngestNotification(BaseModel):
    title: str = ""
    text: str = ""
    app_package: str = ""


class ChatBody(BaseModel):
    question: str


class CompareBody(BaseModel):
    ids: List[str]


class InboxAction(BaseModel):
    action: str  # add / ignore / merge / remind / watchlist
    edits: Optional[Dict[str, Any]] = None
    merge_into: Optional[str] = None


# ---------------------------------------------------------------------------
# Ingest endpoints
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "SubMind", "status": "ok"}


@api.post("/ingest/text")
async def ingest_text(body: IngestText):
    ex = await ai_extract(text=body.text, source_type=body.source)
    return await run_pipeline(ex, body.source, raw_text=body.text)


@api.post("/ingest/image")
async def ingest_image(body: IngestImage):
    settings = await get_settings()
    ex = await ai_extract(image_base64=body.image_base64, source_type=body.source)
    kept = body.image_base64 if settings.get("keep_screenshots") else None
    return await run_pipeline(ex, body.source, image_kept=kept)


LINK_KEYWORDS = ["subscription", "trial", "plan", "pricing", "price", "offer", "premium", "pro"]


async def _fetch_metadata(url: str) -> dict:
    """Best-effort webpage metadata. Never fails the save."""
    import requests
    try:
        r = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0 SubMind"})
        html = r.text[:200000]
        title = ""
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        if m:
            title = re.sub(r"\s+", " ", m.group(1)).strip()[:200]
        og = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
        desc = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', html, re.I)
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text)[:3000]
        return {"title": title, "thumbnail": og.group(1) if og else None,
                "description": desc.group(1) if desc else "", "text": text}
    except Exception as e:
        logger.info("metadata fetch failed %s: %s", url, e)
        return {"title": "", "thumbnail": None, "description": "", "text": ""}


@api.post("/ingest/link")
async def ingest_link(body: IngestLink):
    # 1. Save link immediately (enrichment pending)
    lid = str(uuid.uuid4())
    domain = re.sub(r"^https?://(www\.)?", "", body.url).split("/")[0]
    base_link = {
        "id": lid, "user_id": USER_ID, "deleted_at": None,
        "url": body.url, "canonical_url": body.url,
        "title": domain or body.url[:60], "source": body.source, "thumbnail": None,
        "summary": "", "category": "Other", "tags": [], "note": body.text[:500],
        "reminder_id": None, "related_subscription": None, "archived": False,
        "enrichment": "pending", "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.saved_links.insert_one(dict(base_link))

    # 2. Enrich (best effort)
    meta = await _fetch_metadata(body.url)
    combined = f"URL: {body.url}\nTitle: {meta['title']}\n{meta['description']}\n{meta['text']}\n{body.text}"
    ex = await ai_extract(text=combined, source_type=f"link:{body.source}")

    update = {
        "title": meta["title"] or ex.get("product") or base_link["title"],
        "thumbnail": meta["thumbnail"],
        "summary": ex.get("summary", ""), "category": ex.get("category", "Other"),
        "tags": ex.get("tags", []), "enrichment": "done", "updated_at": now_iso(),
    }
    await db.saved_links.update_one({"id": lid}, {"$set": update})

    # 3. If it looks like a subscription/plan/offer, route to inbox too
    if ex.get("content_type") in ("subscription", "trial", "plan") and ex.get("provider"):
        ex["confidence"] = min(ex.get("confidence", 0.5), 0.9)  # links need review
        inbox = await run_pipeline(ex, f"link:{body.source}", raw_text=combined[:2000], url=body.url)
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


@api.post("/inbox/{item_id}/action")
async def inbox_action(item_id: str, body: InboxAction):
    item = await db.smart_inbox.find_one({"id": item_id, "user_id": USER_ID})
    if not item:
        raise HTTPException(404, "Inbox item not found")
    ex = dict(item.get("extraction", {}))
    if body.edits:
        ex.update(body.edits)

    if body.action == "ignore":
        await db.smart_inbox.update_one({"id": item_id}, {"$set": {"status": "ignored", "deleted_at": now_iso()}})
        return {"ok": True, "status": "ignored"}

    if body.action == "merge" and body.merge_into:
        upd = {k: v for k, v in {
            "price": ex.get("price"), "renewal_date": ex.get("renewal_date"),
            "trial_end": ex.get("trial_end"), "plan": ex.get("plan"),
        }.items() if v}
        upd["updated_at"] = now_iso()
        await db.subscriptions.update_one({"id": body.merge_into, "user_id": USER_ID}, {"$set": upd})
        await db.smart_inbox.update_one({"id": item_id}, {"$set": {"status": "merged"}})
        return {"ok": True, "status": "merged", "subscription_id": body.merge_into}

    if body.action == "watchlist":
        wid = await _create_watchlist_from(ex, item.get("source", "manual"), item.get("url", ""))
        await db.smart_inbox.update_one({"id": item_id}, {"$set": {"status": "saved", "created_ref": wid, "created_type": "plan"}})
        return {"ok": True, "status": "saved", "plan_id": wid}

    # default: add
    ctype = ex.get("content_type", "unknown")
    if ctype == "plan":
        ref = await _create_watchlist_from(ex, item.get("source", "manual"), item.get("url", ""))
        rtype = "plan"
    elif ctype == "link" or (item.get("url") and ctype not in ("subscription", "trial")):
        ref = await _create_link_from(ex, item.get("source", "manual"), item.get("url", ""), item.get("raw_text", ""))
        rtype = "link"
    else:
        ref = await _create_subscription_from(ex, item.get("source", "manual"), item.get("url", ""), item.get("image_base64"))
        rtype = "subscription"
    await db.smart_inbox.update_one({"id": item_id}, {"$set": {"status": "added", "created_ref": ref, "created_type": rtype}})
    return {"ok": True, "status": "added", "ref": ref, "type": rtype}


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
    doc = await db.subscriptions.find_one({"id": sid, "user_id": USER_ID})
    if not doc:
        raise HTTPException(404, "Not found")
    payments = doc.get("payments", [])
    payments.append({"amount": body.get("amount", doc.get("price")),
                     "currency": doc.get("currency", "AED"), "date": body.get("date", now_iso())})
    await db.subscriptions.update_one({"id": sid}, {"$set": {"payments": payments, "updated_at": now_iso()}})
    return {"ok": True, "payments": payments}


@api.delete("/subscriptions/{sid}")
async def delete_subscription(sid: str):
    await db.subscriptions.update_one({"id": sid, "user_id": USER_ID}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Links (Link Vault)
# ---------------------------------------------------------------------------
@api.get("/links")
async def list_links(source: Optional[str] = None, archived: bool = False):
    extra = {"archived": archived}
    if source and source != "All":
        extra["source"] = source
    links = await db.saved_links.find(await base_query(extra)).sort("created_at", -1).to_list(500)
    return [clean(l) for l in links]


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
    body["updated_at"] = now_iso()
    await db.saved_links.update_one({"id": lid, "user_id": USER_ID}, {"$set": body})
    doc = await db.saved_links.find_one({"id": lid})
    return clean(doc)


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
        "due_date": body.get("due_date"), "ref_type": body.get("ref_type", "custom"),
        "ref_id": body.get("ref_id"), "recurring": body.get("recurring"),
        "completed": False, "created_at": now_iso(),
    }
    await db.reminders.insert_one(dict(doc))
    return clean(doc)


@api.patch("/reminders/{rid}")
async def update_reminder(rid: str, body: Dict[str, Any]):
    body.pop("id", None); body.pop("_id", None)
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
        "subscriptions": await find(db.subscriptions, ["provider", "product", "plan", "category", "notes"]),
        "links": await find(db.saved_links, ["title", "summary", "url", "category", "note"]),
        "plans": await find(db.plan_watchlist, ["provider", "plan", "notes"]),
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
# AI: chat / extract / compare
# ---------------------------------------------------------------------------
async def _build_context() -> str:
    base = await base_query()
    subs = [clean(s) for s in await db.subscriptions.find(base).to_list(300)]
    links = [clean(l) for l in await db.saved_links.find(base).to_list(300)]
    plans = [clean(p) for p in await db.plan_watchlist.find(base).to_list(200)]
    rems = [clean(r) for r in await db.reminders.find(base).to_list(200)]
    ins = await insights()

    def slim_sub(s):
        return {k: s.get(k) for k in ("provider", "product", "plan", "category", "status",
                                      "price", "currency", "billing_cycle", "renewal_date", "trial_end", "tags")}

    def slim_link(l):
        return {k: l.get(k) for k in ("title", "url", "source", "category", "summary", "tags")}

    def slim_plan(p):
        return {k: p.get(k) for k in ("provider", "plan", "price", "currency", "status", "offer_expiry", "url")}

    def slim_rem(r):
        return {k: r.get(k) for k in ("title", "kind", "due_date", "completed")}

    ctx = {
        "spend": {"monthly": ins["monthly_spend"], "yearly": ins["yearly_spend"], "currency": ins["currency"]},
        "subscriptions": [slim_sub(s) for s in subs],
        "saved_links": [slim_link(l) for l in links],
        "plan_watchlist": [slim_plan(p) for p in plans],
        "reminders": [slim_rem(r) for r in rems],
    }
    return json.dumps(ctx, default=str)[:24000]


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
