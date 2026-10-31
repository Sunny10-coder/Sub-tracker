"""Offline unit tests for backend/parsing.py (no network, no LLM)."""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import parsing as P  # noqa: E402

TODAY = date(2026, 10, 31)

NETFLIX_RECEIPT = """From: Netflix <info@mailer.netflix.com>
To: sabith@example.com
Subject: Your Netflix payment receipt
Date: Thu, 29 Oct 2026

Hi Sabith,
Thanks for your payment. We charged AED 56.00 for your Standard plan.
Your membership renews on 29 Nov 2026.
Manage or cancel anytime: https://www.netflix.com/cancelplan
Unsubscribe: https://mailer.netflix.com/unsubscribe?x=1
"""

PROMO_EMAIL = """From: Spotify <no-reply@spotify.com>
To: me@gmail.com
Subject: 50% off Premium - limited time

Get 3 months free of Premium Individual. Use code SPOT3FREE at checkout.
Offer expires Nov 15, 2026. After that it's $11.99/month. Save $12 on your first bill.
"""

TRIAL_EMAIL = """From: Canva <hello@canva.com>
To: me@work.io
Subject: Your free trial of Canva Pro started

Your 30-day free trial ends on 2026-11-20. After that you'll be charged USD 12.99 per month.
Manage your subscription: https://www.canva.com/settings/billing-and-plans
"""


def test_parse_email_headers():
    e = P.parse_email(NETFLIX_RECEIPT)
    assert e["is_email"]
    assert e["subject"] == "Your Netflix payment receipt"
    assert e["from_email"] == "info@mailer.netflix.com"
    assert e["to_email"] == "sabith@example.com"
    assert "We charged AED 56.00" in e["body"]


def test_plain_text_is_not_email():
    e = P.parse_email("Notion Plus AED 40/mo renews Nov 3")
    assert not e["is_email"]


def test_netflix_receipt_exact_data():
    d = P.deterministic_extract(NETFLIX_RECEIPT, TODAY)
    assert d["provider"] == "Netflix"
    assert d["price"] == 56.0 and d["currency"] == "AED"
    assert d["renewal_date"] == "2026-11-29"
    assert d["account_email"] == "sabith@example.com"
    assert d["cancel_url"] == "https://www.netflix.com/cancelplan"
    assert d["hint"]["kind"] == "subscription"


def test_promo_code_and_discount_not_confused_with_price():
    d = P.deterministic_extract(PROMO_EMAIL, TODAY)
    assert d["promo_codes"] == ["SPOT3FREE"]
    assert d["offer_expiry"] == "2026-11-15"
    # $12 is a saving, so the charge must be the $11.99 monthly price
    assert d["price"] == 11.99 and d["currency"] == "USD" and d["billing_cycle"] == "monthly"
    assert any("50%" in x for x in d["discounts"])
    assert any("3 months free" in x.lower() for x in d["discounts"])
    assert d["hint"]["kind"] == "promo"


def test_trial_dates_and_price():
    d = P.deterministic_extract(TRIAL_EMAIL, TODAY)
    assert d["trial_end"] == "2026-11-20"
    assert d["price"] == 12.99 and d["currency"] == "USD" and d["billing_cycle"] == "monthly"
    assert d["hint"]["trial"]


def test_ordinary_words_are_not_promo_codes():
    assert P.find_promo_codes("Enter the code below to continue. Use your account.") == []
    assert P.find_promo_codes("your code is here")[:1] == []


def test_promo_code_needs_digit_or_uppercase():
    codes = [c["code"] for c in P.find_promo_codes("Promo code: Welcome\nUse code SAVE20 today")]
    assert codes == ["SAVE20"]


def test_relative_year_rollover_for_no_year_dates():
    ds = P.find_dates("Renews on 3 Jan", date(2026, 12, 20))
    assert ds[0]["date"] == "2027-01-03" and ds[0]["kind"] == "renewal_date"


def test_numeric_dates_are_day_first():
    ds = P.find_dates("Next billing date: 05/11/2026", TODAY)
    assert ds[0]["date"] == "2026-11-05"


def test_merge_drops_hallucinated_price_and_code():
    det = P.deterministic_extract(NETFLIX_RECEIPT, TODAY)
    ai = {"content_type": "subscription", "provider": "Netflix", "price": 99, "currency": "USD",
          "promo_code": "FAKE123", "renewal_date": "2026-12-01", "confidence": 0.9}
    out = P.merge_and_verify(ai, det, NETFLIX_RECEIPT)
    assert out["price"] == 56.0 and out["currency"] == "AED"
    assert out["promo_code"] == ""
    assert out["renewal_date"] == "2026-11-29"
    assert out["doubts"], "should explain the corrections"
    assert out["suggested_destination"] == "account"


def test_merge_promo_becomes_plan_not_subscription():
    det = P.deterministic_extract(PROMO_EMAIL, TODAY)
    ai = {"content_type": "subscription", "provider": "Spotify", "confidence": 0.9}
    out = P.merge_and_verify(ai, det, PROMO_EMAIL)
    assert out["content_type"] == "plan"
    assert out["is_promotional"] is True
    assert out["promo_code"] == "SPOT3FREE"
    assert out["suggested_destination"] == "plan"


def test_merge_unknown_provider_lowers_confidence():
    det = P.deterministic_extract("some random text AED 10", TODAY)
    out = P.merge_and_verify({"content_type": "subscription", "confidence": 0.99}, det, "some random text AED 10")
    assert out["confidence"] <= 0.45
    assert any("which service" in d for d in out["doubts"])


def test_cancel_info_directory_and_override():
    assert P.cancel_info("Netflix")["url"].endswith("netflix.com/cancelplan")
    assert P.cancel_info("Spotify Premium")["source"] == "directory"
    assert P.cancel_info("Netflix", cancel_url="https://x.test/c")["source"] == "email"
    assert P.cancel_info("Some Tiny App")["source"] == "unknown"


def test_cancel_plan_dates_and_urgency():
    sub = {"id": "1", "provider": "Netflix", "status": "Active", "price": 56, "currency": "AED",
           "billing_cycle": "monthly", "renewal_date": "2026-11-03", "account_email": "a@b.co"}
    cp = P.cancel_plan(sub, TODAY, notice_days=1)
    assert cp["charge_date"] == "2026-11-03" and cp["cancel_by"] == "2026-11-02"
    assert cp["days_left"] == 2 and cp["urgency"] == "soon"
    assert cp["account_email"] == "a@b.co"


def test_stale_renewal_rolls_forward():
    sub = {"status": "Active", "billing_cycle": "monthly", "renewal_date": "2026-08-15"}
    assert P.next_charge(sub, TODAY).isoformat() == "2026-11-15"


def test_trial_uses_trial_end_and_cancelled_is_skipped():
    trial = {"status": "Trial", "trial_end": "2026-11-05", "renewal_date": "2026-12-05", "billing_cycle": "monthly"}
    assert P.next_charge(trial, TODAY).isoformat() == "2026-11-05"
    assert P.cancel_plan({"status": "Cancelled", "renewal_date": "2026-11-05"}, TODAY) is None


def test_active_promos_filters_expired_and_sorts():
    items = [
        {"id": "a", "provider": "X", "promo_code": "OLD10", "offer_expiry": "2026-10-01"},
        {"id": "b", "provider": "Y", "promo_code": "NEW20", "offer_expiry": "2026-11-10"},
        {"id": "c", "provider": "Z", "promo_code": "EVER5"},
        {"id": "d", "provider": "W", "promo_code": ""},
    ]
    got = P.active_promos(items, TODAY)
    assert [p["code"] for p in got] == ["NEW20", "EVER5"]
    assert got[0]["days_left"] == 10
