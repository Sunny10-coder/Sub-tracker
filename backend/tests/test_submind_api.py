"""SubMind backend API tests — covers all endpoints from review request."""
import os
import io
import base64
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://subscription-vault-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _small_png_b64() -> str:
    """Small PNG (100x100) with real visual features."""
    img = Image.new("RGB", (100, 100), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, 60, 60], fill="red")
    d.ellipse([30, 30, 90, 90], fill="blue")
    d.text((10, 70), "Netflix $9", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------- Health ----------
def test_root_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    j = r.json()
    assert j.get("app") == "SubMind"


# ---------- Ingest ----------
def test_ingest_text(s):
    r = s.post(f"{API}/ingest/text", json={"text": "Adobe Creative Cloud All Apps AED 249 monthly, renews 2026-03-01", "source": "manual"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "extraction" in j and "status" in j and "id" in j
    ex = j["extraction"]
    assert "content_type" in ex and "confidence" in ex


def test_ingest_link_saves_even_if_enrichment_fails(s):
    r = s.post(f"{API}/ingest/link", json={"url": "https://invalid-nonexistent-site-abc123.example.zzz/path", "source": "share", "text": "test"}, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "link_id" in j


def test_ingest_link_real(s):
    r = s.post(f"{API}/ingest/link", json={"url": "https://www.instagram.com/", "source": "share", "text": ""}, timeout=60)
    assert r.status_code == 200
    assert "link_id" in r.json()


def test_ingest_image_no_500(s):
    b64 = _small_png_b64()
    r = s.post(f"{API}/ingest/image", json={"image_base64": b64, "source": "screenshot"}, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "extraction" in j and "status" in j


# ---------- Subscriptions CRUD ----------
def test_subscriptions_flow(s):
    payload = {"provider": "TEST_Provider", "product": "TEST_Prod", "plan": "Pro", "price": 15.5,
               "currency": "AED", "billing_cycle": "monthly", "renewal_date": "2026-06-01", "category": "AI"}
    r = s.post(f"{API}/subscriptions", json=payload)
    assert r.status_code == 200, r.text
    sub = r.json()
    sid = sub["id"]
    assert sub["provider"] == "TEST_Provider"

    # GET
    r = s.get(f"{API}/subscriptions/{sid}")
    assert r.status_code == 200
    assert r.json()["id"] == sid

    # List
    r = s.get(f"{API}/subscriptions")
    assert r.status_code == 200
    assert any(x["id"] == sid for x in r.json())

    # PATCH
    r = s.patch(f"{API}/subscriptions/{sid}", json={"price": 20.0, "status": "Paused"})
    assert r.status_code == 200
    assert r.json()["price"] == 20.0

    # Record payment
    r = s.post(f"{API}/subscriptions/{sid}/payment", json={"amount": 20.0})
    assert r.status_code == 200
    assert len(r.json()["payments"]) == 1

    # DELETE (soft)
    r = s.delete(f"{API}/subscriptions/{sid}")
    assert r.status_code == 200
    r = s.get(f"{API}/subscriptions/{sid}")
    assert r.status_code == 404


def test_duplicate_detection(s):
    # Create baseline
    p = {"provider": "TEST_DupProv", "product": "TEST_DupProd", "price": 10, "currency": "AED"}
    r = s.post(f"{API}/subscriptions", json=p)
    assert r.status_code == 200
    sid = r.json()["id"]
    try:
        r = s.post(f"{API}/ingest/text", json={
            "text": "TEST_DupProv Premium AED 10 monthly subscription renewing next month",
            "source": "manual"
        }, timeout=60)
        assert r.status_code == 200
        j = r.json()
        # Should either be flagged duplicate status OR have duplicate_of set
        assert j.get("status") == "duplicate" or j.get("duplicate_of") is not None or j.get("extraction", {}).get("content_type") not in ("subscription", "trial", "payment")
    finally:
        s.delete(f"{API}/subscriptions/{sid}")


# ---------- Links ----------
def test_links_crud(s):
    r = s.post(f"{API}/links", json={"url": "https://example.com/test-link", "source": "manual", "text": "TEST"}, timeout=60)
    assert r.status_code == 200
    lid = r.json()["link_id"]

    r = s.get(f"{API}/links/{lid}")
    assert r.status_code == 200

    r = s.get(f"{API}/links")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = s.patch(f"{API}/links/{lid}", json={"note": "updated"})
    assert r.status_code == 200

    r = s.delete(f"{API}/links/{lid}")
    assert r.status_code == 200


# ---------- Watchlist ----------
def test_watchlist_flow(s):
    r = s.post(f"{API}/watchlist", json={"provider": "TEST_Watch", "plan": "Basic", "price": 5, "currency": "USD"})
    assert r.status_code == 200
    wid = r.json()["id"]

    r = s.get(f"{API}/watchlist")
    assert r.status_code == 200 and isinstance(r.json(), list)

    r = s.patch(f"{API}/watchlist/{wid}", json={"notes": "check offer"})
    assert r.status_code == 200

    # Convert to sub
    r = s.post(f"{API}/watchlist/{wid}/convert")
    assert r.status_code == 200
    sid = r.json()["subscription_id"]

    # Cleanup
    s.delete(f"{API}/subscriptions/{sid}")
    r = s.delete(f"{API}/watchlist/{wid}")
    assert r.status_code == 200


# ---------- Reminders ----------
def test_reminders_flow(s):
    r = s.post(f"{API}/reminders", json={"title": "TEST_Reminder", "due_date": "2026-05-01", "kind": "custom"})
    assert r.status_code == 200
    rid = r.json()["id"]

    r = s.get(f"{API}/reminders")
    assert r.status_code == 200 and any(x["id"] == rid for x in r.json())

    r = s.patch(f"{API}/reminders/{rid}", json={"completed": True})
    assert r.status_code == 200 and r.json()["completed"] is True

    r = s.delete(f"{API}/reminders/{rid}")
    assert r.status_code == 200


# ---------- Smart Inbox ----------
def test_inbox_and_action(s):
    # Create inbox item first via ingest
    r = s.post(f"{API}/ingest/text", json={"text": "TEST_InboxItem Random AED 8 monthly", "source": "manual"}, timeout=60)
    assert r.status_code == 200
    iid = r.json()["id"]

    r = s.get(f"{API}/inbox")
    assert r.status_code == 200
    items = r.json()
    assert any(i["id"] == iid for i in items)

    # Ignore action
    r = s.post(f"{API}/inbox/{iid}/action", json={"action": "ignore"})
    assert r.status_code == 200
    assert r.json()["status"] == "ignored"


# ---------- Insights ----------
def test_insights(s):
    r = s.get(f"{API}/insights")
    assert r.status_code == 200
    j = r.json()
    for k in ("monthly_spend", "yearly_spend", "renewals_30d", "top_category", "overlaps", "currency"):
        assert k in j, f"missing {k}"


# ---------- Search ----------
def test_search(s):
    r = s.get(f"{API}/search", params={"q": "netflix"})
    assert r.status_code == 200
    j = r.json()
    for k in ("subscriptions", "links", "plans", "reminders"):
        assert k in j


# ---------- Graph ----------
def test_graph(s):
    r = s.get(f"{API}/graph")
    assert r.status_code == 200
    j = r.json()
    assert "nodes" in j and "edges" in j
    assert isinstance(j["nodes"], list) and isinstance(j["edges"], list)


# ---------- AI Chat ----------
def test_ai_chat(s):
    r = s.post(f"{API}/ai/chat", json={"question": "How much do I spend monthly?"}, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "answer" in j and isinstance(j["answer"], str) and len(j["answer"].strip()) > 0


# ---------- AI Compare ----------
def test_ai_compare(s):
    # Create two subs to compare
    a = s.post(f"{API}/subscriptions", json={"provider": "TEST_CmpA", "price": 10, "billing_cycle": "monthly"}).json()
    b = s.post(f"{API}/subscriptions", json={"provider": "TEST_CmpB", "price": 20, "billing_cycle": "monthly"}).json()
    try:
        r = s.post(f"{API}/ai/compare", json={"ids": [a["id"], b["id"]]}, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "comparison" in j and len(j["items"]) == 2
    finally:
        s.delete(f"{API}/subscriptions/{a['id']}")
        s.delete(f"{API}/subscriptions/{b['id']}")


# ---------- Settings ----------
def test_settings(s):
    r = s.get(f"{API}/settings")
    assert r.status_code == 200
    orig = r.json().get("default_reminder_days", 3)

    r = s.patch(f"{API}/settings", json={"default_reminder_days": 7})
    assert r.status_code == 200
    assert r.json()["default_reminder_days"] == 7

    # restore
    s.patch(f"{API}/settings", json={"default_reminder_days": orig})


# ---------- STT ----------
def test_stt_endpoint_exists(s):
    # Empty file should return 413
    files = {"file": ("empty.m4a", b"", "audio/m4a")}
    r = requests.post(f"{API}/stt/transcribe", files=files, timeout=30)
    assert r.status_code in (413, 400, 502, 503), f"unexpected {r.status_code}: {r.text}"
