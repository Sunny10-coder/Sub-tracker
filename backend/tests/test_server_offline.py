"""Offline end-to-end tests of the new SubMind flows.

No network, no MongoDB, no LLM: motor is replaced by mongomock-motor and the
`emergentintegrations` package by a tiny stub whose "AI" is scripted per test.
Run:  pytest tests/test_server_offline.py
"""
import json
import os
import sys
import types
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

pytest.importorskip("mongomock_motor")
pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

# ---- stub emergentintegrations -------------------------------------------------
AI = {"mode": "down", "link_json": {}, "extract_json": {}}


class _Chat:
    def __init__(self, api_key=None, session_id=None, system_message=""):
        self.system = system_message

    def with_model(self, *_a, **_k):
        return self

    async def send_message(self, _msg):
        if AI["mode"] == "down":
            raise RuntimeError("AI unreachable (test)")
        if "link analyst" in self.system:
            return json.dumps(AI["link_json"])
        if "extraction engine" in self.system:
            return json.dumps(AI["extract_json"])
        return "stub answer"


_llm = types.ModuleType("emergentintegrations.llm.chat")
_llm.LlmChat = _Chat
_llm.UserMessage = lambda text="", file_contents=None: types.SimpleNamespace(text=text, file_contents=file_contents)
_llm.ImageContent = lambda image_base64=None: types.SimpleNamespace(image_base64=image_base64)
_oa = types.ModuleType("emergentintegrations.llm.openai")
_oa.OpenAISpeechToText = lambda key: None
for name, mod in {
    "emergentintegrations": types.ModuleType("emergentintegrations"),
    "emergentintegrations.llm": types.ModuleType("emergentintegrations.llm"),
    "emergentintegrations.llm.chat": _llm,
    "emergentintegrations.llm.openai": _oa,
}.items():
    sys.modules[name] = mod

os.environ["MONGO_URL"] = "mongodb://mock"
os.environ["DB_NAME"] = "submind_test"
import motor.motor_asyncio as _motor  # noqa: E402

_motor.AsyncIOMotorClient = AsyncMongoMockClient

import server  # noqa: E402
import linkintel  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    server.db = AsyncMongoMockClient()["submind_test"]
    AI.update(mode="down", link_json={}, extract_json={})
    with TestClient(server.app) as c:
        yield c


NETFLIX = """From: Netflix <info@mailer.netflix.com>
To: sabith@example.com
Subject: Your Netflix payment receipt

Thanks for your payment. We charged AED 56.00 for your Standard plan.
Your membership renews on {renew}.
Manage or cancel anytime: https://www.netflix.com/cancelplan
"""

PROMO = """From: Spotify <no-reply@spotify.com>
To: sabith@example.com
Subject: 50% off Premium - limited time

Get 3 months free of Premium Individual. Use code SPOT3FREE at checkout.
Offer expires {expiry}. After that it's $11.99/month.
"""


def _iso(days):
    return (date.today() + timedelta(days=days)).isoformat()


def test_email_receipt_exact_fields_even_when_ai_is_down(client):
    text = NETFLIX.format(renew=_iso(10))
    r = client.post("/api/ingest/text", json={"text": text, "source": "manual"})
    assert r.status_code == 200, r.text
    item = r.json()
    ex = item["extraction"]
    assert item["source"] == "email"                         # auto-detected
    assert ex["provider"] == "Netflix" and ex["price"] == 56.0 and ex["currency"] == "AED"
    assert ex["renewal_date"] == _iso(10)
    assert ex["account_email"] == "sabith@example.com"
    assert ex["cancel_url"] == "https://www.netflix.com/cancelplan"
    assert item["status"] in ("needs_review", "needs_confirmation")
    assert item["doubts"], "AI-down fallback should say why it is unsure"


def test_review_item_can_be_added_as_account_and_feeds_memory(client):
    item = client.post("/api/ingest/text", json={"text": NETFLIX.format(renew=_iso(10))}).json()
    r = client.post(f"/api/inbox/{item['id']}/action", json={"action": "account"})
    assert r.status_code == 200 and r.json()["type"] == "subscription"

    subs = client.get("/api/subscriptions").json()
    assert len(subs) == 1 and subs[0]["account_email"] == "sabith@example.com"

    mem = client.get("/api/memory/dashboard").json()
    c = mem["cancel_radar"][0]
    assert c["provider"] == "Netflix"
    assert c["cancel_by"] == _iso(9) and c["days_left"] == 9 and c["urgency"] == "later"
    assert c["account_email"] == "sabith@example.com"
    assert c["where"]["url"] == "https://www.netflix.com/cancelplan"
    assert mem["accounts_by_email"][0]["email"] == "sabith@example.com"
    assert "sabith@example.com" in c["message"]

    rems = client.get("/api/reminders").json()
    assert any(rm["due_date"] == _iso(9) for rm in rems), "reminder must fire the day before renewal"


def test_doubtful_item_can_be_forced_to_plan_with_edits(client):
    item = client.post("/api/ingest/text", json={"text": NETFLIX.format(renew=_iso(10))}).json()
    r = client.post(f"/api/inbox/{item['id']}/action", json={
        "action": "plan", "edits": {"price": "49.5", "promo_code": " keep10 "}})
    assert r.status_code == 200 and r.json()["type"] == "plan"
    plans = client.get("/api/watchlist").json()
    assert plans[0]["price"] == 49.5 and plans[0]["promo_code"] == "KEEP10"
    assert client.get("/api/subscriptions").json() == []


def test_promo_email_routes_to_plan_and_shows_in_promos(client):
    text = PROMO.format(expiry=_iso(5))
    item = client.post("/api/ingest/text", json={"text": text}).json()
    ex = item["extraction"]
    assert ex["content_type"] == "plan" and ex["promo_code"] == "SPOT3FREE"
    assert ex["offer_expiry"] == _iso(5)
    assert item["suggested_destination"] == "plan"
    client.post(f"/api/inbox/{item['id']}/action", json={"action": "plan"})
    promos = client.get("/api/memory/dashboard").json()["promos"]
    assert promos[0]["code"] == "SPOT3FREE" and promos[0]["days_left"] == 5


def test_ai_hallucinated_code_and_price_are_dropped(client):
    AI.update(mode="up", extract_json={"content_type": "subscription", "provider": "Netflix", "price": 99,
                                       "currency": "USD", "promo_code": "FAKE123", "confidence": 0.99})
    item = client.post("/api/ingest/text", json={"text": NETFLIX.format(renew=_iso(3))}).json()
    ex = item["extraction"]
    assert ex["price"] == 56.0 and ex["currency"] == "AED" and ex["promo_code"] == ""
    assert item["status"] != "duplicate"


def test_reanalyze_reruns_extraction(client):
    item = client.post("/api/ingest/text", json={"text": NETFLIX.format(renew=_iso(10))}).json()
    r = client.post(f"/api/inbox/{item['id']}/reanalyze")
    assert r.status_code == 200 and r.json()["extraction"]["price"] == 56.0


def test_cancelled_email_merges_to_cancelled_status(client):
    sub = client.post("/api/subscriptions", json={"provider": "Netflix", "price": 56, "renewal_date": _iso(5)}).json()
    text = ("From: Netflix <info@netflix.com>\nTo: a@b.co\nSubject: Cancellation confirmed\n\n"
            "Your membership cancellation is confirmed. We're sorry to see you go.")
    item = client.post("/api/ingest/text", json={"text": text}).json()
    assert item["status"] == "duplicate" and item["duplicate_of"] == sub["id"]
    client.post(f"/api/inbox/{item['id']}/action", json={"action": "merge", "merge_into": sub["id"]})
    assert client.get(f"/api/subscriptions/{sub['id']}").json()["status"] == "Cancelled"
    assert client.get("/api/memory/dashboard").json()["cancel_radar"] == []


def test_ingest_email_endpoint(client):
    r = client.post("/api/ingest/email", json={
        "sender": "Canva <hello@canva.com>", "to": "me@work.io", "subject": "Your free trial started",
        "body": f"Your free trial ends on {_iso(14)}. After that you'll be charged USD 12.99 per month."})
    ex = r.json()["extraction"]
    assert ex["provider"] == "Canva" and ex["trial_end"] == _iso(14) and ex["price"] == 12.99
    assert ex["account_email"] == "me@work.io"


# ------------------------------- links ------------------------------------------
def test_github_link_gets_section_tags_and_use_cases(client, monkeypatch):
    monkeypatch.setattr(linkintel, "fetch_github", lambda o, r, timeout=8: {
        "ok": True, "full_name": f"{o}/{r}", "description": "Fast web framework", "stars": 70000, "forks": 6000,
        "language": "Python", "topics": ["api", "async"], "license": "MIT", "updated_at": "2026-10-01",
        "homepage": "", "archived": False, "avatar": None, "readme": "FastAPI is a modern web framework"})
    AI.update(mode="up", link_json={
        "title": "FastAPI", "summary": "Modern async Python web framework.", "category": "Dev Tools",
        "tags": ["python", "web"], "use_cases": ["Build a REST API", "Serve an ML model"], "key_points": []})
    r = client.post("/api/ingest/link", json={
        "url": "https://github.com/tiangolo/fastapi", "tags": ["Backend"], "remind_in_days": 3})
    assert r.status_code == 200, r.text
    link = r.json()["link"]
    assert link["kind"] == "github" and link["collection"] == "GitHub" and link["source"] == "GitHub"
    assert link["use_cases"] == ["Build a REST API", "Serve an ML model"]
    assert link["tags"][0] == "backend" and {"python", "api", "async", "github"} <= set(link["tags"])
    assert link["repo"]["stars"] == 70000 and link["analysis_basis"] == "readme"
    assert link["reminder_due"] == _iso(3)

    assert client.get("/api/links", params={"kind": "github"}).json()[0]["id"] == link["id"]
    assert client.get("/api/links", params={"tag": "python"}).json()[0]["id"] == link["id"]
    assert any(t["tag"] == "python" for t in client.get("/api/links/tags").json())

    rem = [r for r in client.get("/api/reminders").json() if r["ref_id"] == link["id"]][0]
    assert rem["title"] == "Revisit: FastAPI", "reminder should carry the analysed title, not the bare domain"
    mem = client.get("/api/memory/dashboard").json()
    assert mem["dont_forget"][0]["reason"] == "reminder" and mem["dont_forget"][0]["days_left"] == 3
    assert mem["github_count"] == 1


def test_instagram_link_is_honest_about_basis(client, monkeypatch):
    monkeypatch.setattr(linkintel, "fetch_instagram", lambda u: {
        "ok": True, "caption": "5 Notion templates that save hours #productivity #notion", "author": "someone",
        "title": "", "thumbnail": None, "login_wall": False, "hashtags": ["productivity", "notion"]})
    AI.update(mode="up", link_json={"title": "Notion templates", "summary": "Five templates.", "category": "Productivity",
                                    "tags": ["notion"], "use_cases": [], "key_points": ["5 templates"]})
    link = client.post("/api/ingest/link", json={"url": "https://www.instagram.com/reel/ABC123/"}).json()["link"]
    assert link["kind"] == "instagram" and link["analysis_basis"] == "caption"
    assert {"productivity", "notion", "instagram"} <= set(link["tags"])

    # login wall: only the URL is known -> must say so, still saved
    monkeypatch.setattr(linkintel, "fetch_instagram", lambda u: {
        "ok": False, "caption": "", "author": "", "title": "", "thumbnail": None, "login_wall": True, "hashtags": []})
    AI.update(mode="down")
    l2 = client.post("/api/ingest/link", json={"url": "https://www.instagram.com/p/XYZ/", "text": "gym idea #fitness"}).json()["link"]
    assert l2["analysis_basis"] == "url_only" and l2["analysis_ai"] is False
    assert "fitness" in l2["tags"]


def test_link_remind_replaces_old_and_opened_counter(client, monkeypatch):
    monkeypatch.setattr(linkintel, "fetch_page_meta", lambda u, timeout=8: {
        "title": "Cool article", "description": "d", "thumbnail": None, "text": "t", "ok": True})
    lid = client.post("/api/ingest/link", json={"url": "example.com/a"}).json()["link_id"]
    assert client.get(f"/api/links/{lid}").json()["url"] == "https://example.com/a"
    r1 = client.post(f"/api/links/{lid}/remind", json={"days": 2}).json()
    r2 = client.post(f"/api/links/{lid}/remind", json={"date": _iso(9), "title": "x"}).json()
    live = [r for r in client.get("/api/reminders").json() if r["ref_id"] == lid]
    assert [r["id"] for r in live] == [r2["reminder_id"]] and r1["reminder_id"] != r2["reminder_id"]
    assert client.post(f"/api/links/{lid}/remind", json={}).status_code == 400
    client.post(f"/api/links/{lid}/opened")
    assert client.get(f"/api/links/{lid}").json()["opened_count"] == 1


def test_chat_context_carries_memory(client):
    sid = client.post("/api/subscriptions", json={
        "provider": "Netflix", "price": 56, "renewal_date": _iso(4), "account_email": "me@x.io"}).json()["id"]
    ctx = json.loads(server_ctx())
    assert ctx["today"] == date.today().isoformat()
    assert ctx["memory"]["cancel_radar"][0]["account_email"] == "me@x.io"
    assert ctx["memory"]["cancel_radar"][0]["where"]["url"].endswith("netflix.com/cancelplan")
    assert sid


def server_ctx():
    import asyncio
    return asyncio.new_event_loop().run_until_complete(server._build_context())
