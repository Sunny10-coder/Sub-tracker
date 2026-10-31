"""Pure, testable identity and deduplication helpers for SubMind.

A company/service is NOT an account, and an account is NOT a subscription.
Never infer that two services are the same solely from their display name.
"""
import hashlib
import ipaddress
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TRACKING_KEYS = {"fbclid", "gclid", "dclid", "igshid", "mc_cid", "mc_eid", "ref_src", "si"}


def normalized_name(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def normalized_email(value):
    email = str(value or "").strip().casefold()
    if not email or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return ""
    return email


def account_identity(provider, email):
    p, e = normalized_name(provider), normalized_email(email)
    return f"{p}|{e}" if p and e else ""


def subscription_identity(provider, email, plan):
    account = account_identity(provider, email)
    return f"{account}|{normalized_name(plan)}" if account else ""


def same_money(a, b):
    try:
        return abs(float(a) - float(b)) < 0.001
    except (ValueError, TypeError):
        return False


def find_subscription_match(candidate, subscriptions):
    """Return (record, kind) where kind is 'exact' or 'possible'.

    Exact: same provider + same known account email + same tier.
    Possible: matching provider/tier/price/currency/next date but email absent.
    Different confirmed emails are always separate accounts.
    """
    provider = normalized_name(candidate.get("provider"))
    if not provider:
        return None, None
    email = normalized_email(candidate.get("account_email") or candidate.get("email"))
    plan = normalized_name(candidate.get("plan"))
    for sub in subscriptions:
        if normalized_name(sub.get("provider")) != provider:
            continue
        sub_email = normalized_email(sub.get("account_email") or sub.get("email"))
        sub_plan = normalized_name(sub.get("plan"))
        if email and sub_email:
            if email != sub_email:
                continue
            if plan and sub_plan and plan != sub_plan:
                continue
            return sub, "exact"
        if email != sub_email and (email or sub_email):
            # One missing email means there is not enough evidence to merge.
            continue
        # Strong corroboration is necessary when account email is unknown.
        if (plan and plan == sub_plan and candidate.get("renewal_date")
                and candidate.get("renewal_date") == sub.get("renewal_date")
                and str(candidate.get("currency") or "AED").upper() == str(sub.get("currency") or "AED").upper()
                and same_money(candidate.get("price"), sub.get("price"))):
            return sub, "possible"
    return None, None


def canonicalize_url(url):
    """Strip common tracking parameters without deleting meaningful query data."""
    raw = str(url or "").strip()
    parts = urlsplit(raw)
    if parts.scheme.lower() not in ("https", "http") or not parts.hostname or parts.username or parts.password:
        raise ValueError("Expected a public http(s) URL")
    hostname = parts.hostname.casefold().strip(".")
    if hostname in ("localhost",) or hostname.endswith((".local", ".internal")):
        raise ValueError("Local addresses are not supported")
    try:
        ip = ipaddress.ip_address(hostname)
        if not ip.is_global:
            raise ValueError("Private network URLs are not supported")
    except ValueError as exc:
        if "not supported" in str(exc):
            raise
    netloc = hostname + (f":{parts.port}" if parts.port else "")
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if k.casefold() not in TRACKING_KEYS and not k.casefold().startswith("utm_")]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), netloc, path, urlencode(query), ""))


def content_fingerprint(source, content):
    cleaned = re.sub(r"\s+", " ", str(content or "").strip()).casefold()
    return hashlib.sha256(f"{source}|{cleaned}".encode("utf-8")).hexdigest()


def spend_by_currency(subscriptions):
    """No currency conversion without an explicit trusted FX rate."""
    totals = {}
    for sub in subscriptions:
        if sub.get("status") not in ("Active", "Trial"):
            continue
        if sub.get("status") == "Trial" and not sub.get("trial_paid", False):
            continue
        try:
            amount = float(sub.get("price"))
        except (TypeError, ValueError):
            continue
        if amount < 0:
            continue
        cycle = str(sub.get("billing_cycle") or "monthly").lower()
        if cycle == "yearly":
            amount /= 12
        elif cycle == "weekly":
            amount *= 52 / 12
        elif cycle == "custom":
            continue  # A custom billing period cannot safely be normalized.
        currency = str(sub.get("currency") or "AED").upper()
        totals[currency] = round(totals.get(currency, 0) + amount, 2)
    return totals


def validate_reminder_schedule(due_date, remind_time="09:00"):
    """Validate a calendar date and device-local HH:MM time without assuming UTC."""
    from datetime import datetime
    if not isinstance(due_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", due_date):
        raise ValueError("Use YYYY-MM-DD for the reminder date")
    if not isinstance(remind_time, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", remind_time):
        raise ValueError("Use 24-hour HH:MM for the reminder time")
    try:
        datetime.strptime(due_date, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Invalid reminder calendar date") from exc
    return due_date, remind_time
