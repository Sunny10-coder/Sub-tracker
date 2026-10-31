"""Pure-unit coverage for extracted prices and coupons; live Brave API requires credentials."""
import pytest
from deals_engine import clean_text, find_codes, find_prices, normalize_result
def test_coupon_extraction_is_conservative():
    codes = find_codes("Save 20% off. Use code SEEDANCE20 at checkout. Coupon code FREE2026 applies to eligible plans.")
    assert {c["code"] for c in codes} == {"SEEDANCE20", "FREE2026"}
    assert all(c["verified"] is False for c in codes)
def test_prices_are_evidence_not_verified_rates():
    p = find_prices("Premium USD 19.99/month, annual EUR 100/year, AED 48.")
    assert len(p) == 3
    assert p[0]["period"] == "monthly"
    assert p[1]["period"] == "yearly"
    assert all(p["source_verified"] is False for p in p)
def test_no_fake_price_generated_from_unrelated_text():
    assert find_prices("Seedance offers premium quality. See official pricing.") == []
def test_result_sanitizes_html_and_stores_source():
    r = normalize_result({"url": "https://example.com/seedance?utm_source=x", "title": "<b>Seedance</b>", "description": "USD 29/month"},
                         "plan", "Seedance", "2026-10-30T00:00:00Z")
    assert r["title"] == "Seedance"
    assert r["canonical_url"] == "https://example.com/seedance"
    assert r["prices"][0]["amount"] == 29
    assert r["verification"] == "unverified"
def test_unsafe_results_are_ignored():
    assert normalize_result({"url": "http://localhost/admin", "title": "Local", "description": "USD 100"}, "plan", "a", "now") is None
def test_prices_not_all_made_equal():
    prices = find_prices("Cost $20/month or $180/year.")
    assert {p["period"] for p in prices} == {"monthly", "yearly"}
