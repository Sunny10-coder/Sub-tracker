"""SubMind Deals Intelligence: source-grounded prices and coupons.

No fabricated price, no automatic redemption, and no secret exposed to clients.
"""
import asyncio
import html
import ipaddress
import re
import socket
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx

from vault_intelligence import canonicalize_url

BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search"
CURRENCY = {"USD": "USD", "AED": "AED", "EUR": "EUR", "GBP": "GBP", "INR": "INR",
            "$": "$", "€": "EUR", "£": "GBP", "₹": "INR"}
PRICE_PATTERN = re.compile(
    r"(?<![\w])(?P<currency>USD|AED|EUR|GBP|INR|[$€£₹])\s*"
    r"(?P<amount>\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)"
    r"(?P<suffix>\s*(?:\/\s*(?:mo(?:nth)?|yr|year|week|day|month)|per\s+(?:month|year|week|day))?)",
    re.I,
)
COUPON_PATTERN = re.compile(
    r"(?:promo(?:tional)?\s+code|discount\s+code|coupon\s+code|"
    r"(?:use|apply|enter)\s+(?:the\s+)?code|voucher\s+code|code\s*:)"
    r"\s*(?:is|:|=|-)?\s*[\"'“]?(?P<code>[A-Z0-9][A-Z0-9_-]{3,24})\b",
    re.I,
)
DISCOUNT_PATTERN = re.compile(r"(?<!\w)(?:up\s+to\s+)?(?:\d{1,3}\s*%\s*off|"
                              r"(?:USD|AED|[$€£])\s*\d+(?:\.\d+)?\s*off|free\s+trial)", re.I)
BAD_CODES = {"PROMO", "CODE", "CLICK", "OFFER", "APPLY", "HERE", "DISCOUNT",
             "COUPON", "TODAY", "FREE", "THIS", "SAVE", "ENTER", "VALID"}
STRIP_HTML = re.compile(r"<[^>]*>", re.S)
SCRIPT = re.compile(r"<(?:script|style|noscript)\b[^>]*>[\s\S]*?</(?:script|style|noscript)>", re.I)
SPACE = re.compile(r"\s+")


def clean_text(text: str, limit: int = 12000) -> str:
    return SPACE.sub(" ", html.unescape(STRIP_HTML.sub(" ", SCRIPT.sub(" ", str(text or ""))))).strip()[:limit]


def find_prices(text: str, limit: int = 5) -> list:
    cleaned = clean_text(text)
    out = []
    used = set()
    for match in PRICE_PATTERN.finditer(cleaned):
        try:
            amount = float(match.group("amount").replace(",", ""))
        except ValueError:
            continue
        if amount <= 0 or amount > 1_000_000:
            continue
        cur = CURRENCY[match.group("currency").upper()] if match.group("currency").upper() in CURRENCY else CURRENCY.get(match.group("currency"), "")
        suffix = match.group("suffix").strip().lower()
        period = "monthly" if re.search(r"mo\b|month", suffix) else "yearly" if re.search(r"yr\b|year", suffix) else "weekly" if "week" in suffix else "daily" if "day" in suffix else "unknown"
        key = (amount, cur, period)
        if key in used:
            continue
        used.add(key)
        begin = max(0, match.start() - 36)
        end = min(len(cleaned), match.end() + 62)
        out.append({"amount": amount, "currency": cur, "period": period,
                    "evidence": cleaned[begin:end].strip(), "source_verified": False})
        if len(out) >= limit:
            break
    return out


def find_codes(text: str, limit: int = 5) -> list:
    cleaned = clean_text(text)
    results = []
    seen = set()
    for match in COUPON_PATTERN.finditer(cleaned):
        code = match.group("code").upper()
        if code in BAD_CODES or code in seen or code.isdigit():
            continue
        seen.add(code)
        context = cleaned[max(0, match.start() - 75):min(len(cleaned), match.end() + 95)]
        discount = DISCOUNT_PATTERN.search(context)
        results.append({"code": code, "discount_text": discount.group(0) if discount else "",
                        "evidence": context, "verified": False})
        if len(results) >= limit:
            break
    return results


def normalize_result(item: dict, kind: str, term: str, checked_at: str) -> dict | None:
    raw_url = str(item.get("url") or "")
    try:
        canonical = canonicalize_url(raw_url)
    except (ValueError, OverflowError):
        return None
    url = urlsplit(canonical)
    title = clean_text(item.get("title") or "", 200)
    description = clean_text(item.get("description") or "", 1100)
    if not title and not description:
        return None
    text = title + " " + description
    query_tokens = [w for w in re.findall(r"[a-z0-9]{3,}", term.lower()) if w not in ("video", "offer", "price", "plan")]
    relevance = sum(1 for token in query_tokens if token in text.lower() or token in url.hostname.lower())
    return {"url": raw_url, "canonical_url": canonical, "site": url.hostname,
            "title": title, "description": description, "kind": kind, "score": relevance,
            "prices": find_prices(text), "codes": find_codes(text),
            "checked_at": checked_at, "source": "Brave Search index", "verification": "unverified"}


async def search_brave(api_key: str, query: str, kind: str, term: str, count: int = 8,
                       country: str = "AE") -> list:
    headers = {"Accept": "application/json", "X-Subscription-Token": api_key}
    params = {"q": query, "count": min(12, max(1, count)),
              "country": country, "search_lang": "en", "safesearch": "moderate"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0),
                                 trust_env=False, follow_redirects=False) as client:
        response = await client.get(BRAVE_ENDPOINT, headers=headers, params=params)
    response.raise_for_status()
    body = response.json()
    web = body.get("web") or {}
    checked_at = datetime.now(timezone.utc).isoformat()
    results = [normalize_result(row, kind, term, checked_at)
               for row in (web.get("results") or [])[:count]]
    return [row for row in results if row]


async def search_deals(api_key: str, term: str, mode: str = "all") -> list:
    term = SPACE.sub(" ", term).strip()
    jobs = []
    if mode in ("all", "plans"):
        jobs.append(search_brave(api_key, f"{term} official pricing subscription plan monthly annual credits",
                                 "plan", term, count=8))
    if mode in ("all", "offers"):
        jobs.append(search_brave(api_key, f"{term} promo code offers discount trial pricing",
                                 "offer", term, count=8))
    gathered = await asyncio.gather(*jobs, return_exceptions=True)
    merged = {}
    failures = []
    for result in gathered:
        if isinstance(result, BaseException):
            failures.append(type(result).__name__)
            continue
        for row in result:
            key = row["canonical_url"]
            if key in merged:
                current = merged[key]
                current["kind"] = "both"
                current["codes"] = list({c["code"]: c for c in current["codes"] + row["codes"]}.values())[:5]
                current["prices"] = (current["prices"] + [p for p in row["prices"] if p not in current["prices"]])[:6]
            else:
                merged[key] = row
    if failures and not merged:
        raise RuntimeError("Search provider is temporarily unavailable")
    return sorted(merged.values(), key=lambda r: (r["score"], bool(r["prices"]), bool(r["codes"])), reverse=True)[:18]


async def safe_fetch_page(url: str, max_bytes: int = 160_000) -> tuple[str, str]:
    """Bounded public HTTPS fetch; no redirects, credentials, private addresses or binaries."""
    try:
        canonical = canonicalize_url(url)
    except (ValueError, OverflowError) as exc:
        raise ValueError("Invalid public link") from exc
    parts = urlsplit(canonical)
    if parts.scheme != "https":
        raise ValueError("Only public HTTPS offer pages can be inspected")
    if any(parts.hostname.endswith(x) for x in (".local", ".internal", ".localhost")):
        raise ValueError("Private hosts are not supported")
    try:
        ipaddress.ip_address(parts.hostname)
    except ValueError:
        pass
    else:
        raise ValueError("Direct IP address links are not supported")
    # DNS guard; disables redirects and proxy use. Server operators should additionally
    # restrict egress to public addresses to mitigate DNS rebinding.
    try:
        loop = asyncio.get_running_loop()
        addresses = await asyncio.wait_for(loop.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM), timeout=3)
    except Exception as exc:
        raise ValueError("Could not resolve the offer page") from exc
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("Private network destinations are not allowed")
    chunks = []
    total = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0),
                                 trust_env=False, follow_redirects=False) as client:
        async with client.stream("GET", canonical, headers={"User-Agent": "SubMindOffers/1.0", "Accept": "text/html,text/plain"}) as response:
            if response.is_redirect:
                raise ValueError("Redirected pages must be pasted as their final destination")
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            if not ("text/html" in content_type or "text/plain" in content_type):
                raise ValueError("Offer URL is not a text page")
            if int(response.headers.get("content-length") or 0) > max_bytes:
                raise ValueError("Page is too large to inspect")
            async for part in response.aiter_bytes():
                total += len(part)
                if total > max_bytes:
                    raise ValueError("Page is too large to inspect")
                chunks.append(part)
    return canonical, clean_text(b"".join(chunks).decode("utf-8", "replace"), 18000)
