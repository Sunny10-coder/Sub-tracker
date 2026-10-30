"""Regression tests for service identity, privacy-safe matching and money math."""
import pytest
from vault_intelligence import (
    account_identity, canonicalize_url, content_fingerprint,
    find_subscription_match, normalized_email, spend_by_currency,
)

def test_accounts_are_different_when_emails_differ():
    assert account_identity("OpenAI", "one@example.com") != account_identity("open ai", "two@example.com")

def test_exact_subscription_deduplication_requires_same_account():
    existing = [{"id": "a", "provider": "Netflix", "account_email": "one@example.com", "plan": "Premium",
                 "price": 20, "currency": "USD", "renewal_date": "2027-01-01"}]
    match, kind = find_subscription_match({"provider": "netflix", "account_email": "one@example.com", "plan": "premium"}, existing)
    assert match["id"] == "a" and kind == "exact"
    assert find_subscription_match({"provider": "Netflix", "account_email": "two@example.com", "plan": "Premium"}, existing) == (None, None)
    assert find_subscription_match({"provider": "Netflix", "account_email": "", "plan": "Premium"}, existing) == (None, None)

def test_legacy_match_is_only_possible_not_exact():
    old = [{"id": "legacy", "provider": "GitHub", "account_email": "", "plan": "Pro",
            "price": 4, "currency": "USD", "renewal_date": "2027-04-01"}]
    match, kind = find_subscription_match({"provider": "GitHub", "plan": "Pro", "price": 4,
                                         "currency": "USD", "renewal_date": "2027-04-01"}, old)
    assert match["id"] == "legacy" and kind == "possible"

def test_url_normalization_preserves_meaningful_params():
    a = canonicalize_url("https://EXAMPLE.COM/offer/?plan=pro&utm_source=email#top")
    assert a == "https://example.com/offer?plan=pro"
    with pytest.raises(ValueError):
        canonicalize_url("http://127.0.0.1/admin")

def test_exact_repeated_content_has_stable_fingerprint():
    assert content_fingerprint("gmail", "hello    world") == content_fingerprint("gmail", "HELLO world")

def test_currency_totals_stay_separate_and_trials_are_free_until_paid():
    totals = spend_by_currency([
        {"status": "Active", "price": 120, "currency": "USD", "billing_cycle": "yearly"},
        {"status": "Active", "price": 35, "currency": "AED", "billing_cycle": "monthly"},
        {"status": "Trial", "price": 100, "currency": "USD", "billing_cycle": "monthly"},
        {"status": "Expired", "price": 50, "currency": "USD", "billing_cycle": "monthly"},
    ])
    assert totals == {"USD": 10.0, "AED": 35.0}

def test_reminder_calendar_and_time_validation():
    from vault_intelligence import validate_reminder_schedule
    assert validate_reminder_schedule("2027-01-15", "08:30") == ("2027-01-15", "08:30")
    with pytest.raises(ValueError):
        validate_reminder_schedule("2027-02-30", "09:00")
    with pytest.raises(ValueError):
        validate_reminder_schedule("2027-01-15", "25:00")

def test_link_duplicates_ignore_tracking_params():
    assert canonicalize_url("https://example.com/a?utm_source=instagram&plan=pro") == canonicalize_url("https://example.com/a?plan=pro")
    assert canonicalize_url("https://example.com/a?plan=basic") != canonicalize_url("https://example.com/a?plan=pro")
