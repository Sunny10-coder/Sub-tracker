"""Deterministic email / text parsing for SubMind.

No network or LLM dependencies here, so the logic is unit-testable. The AI
extraction in server.py is *merged* with, and *verified against*, what this
module finds in the source text. The goal: exact promo codes, prices, dates and
mail ids, and no values the source text does not actually support.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Currency / price
# ---------------------------------------------------------------------------
_SYMBOLS = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "AED": "AED", "د.إ": "AED"}
_CODES = ("AED", "USD", "EUR", "GBP", "INR", "SAR", "QAR", "KWD", "BHD", "OMR", "EGP", "CAD", "AUD")
_CODE_RX = "|".join(_CODES)
_NUM = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?"

# "AED 49.99", "USD49", "$9.99", "₹499", "Rs. 199"
_PRICE_PRE = re.compile(
    rf"(?P<cur>{_CODE_RX}|[$€£₹]|Rs\.?|INR)\s?(?P<amt>{_NUM})(?P<tail>\s*(?:/|per|a|each)?\s*(?:month|mo|year|yr|annum|week|wk|day)s?\b)?",
    re.I,
)
# "49.99 AED", "9.99 USD / month"
_PRICE_POST = re.compile(
    rf"(?P<amt>{_NUM})\s?(?P<cur>{_CODE_RX})\b(?P<tail>\s*(?:/|per|a|each)?\s*(?:month|mo|year|yr|annum|week|wk|day)s?\b)?",
    re.I,
)

_CYCLE_WORDS = [
    ("yearly", r"\b(year|yr|yearly|annual|annually|annum|12[- ]months?)\b"),
    ("monthly", r"\b(month|mo|monthly|per month|every month)\b"),
    ("weekly", r"\b(week|wk|weekly)\b"),
]

_DISCOUNT_CONTEXT = re.compile(r"(save|saving|off|discount|cashback|rebate|credit|coupon|worth|up to)", re.I)
_CHARGE_CONTEXT = re.compile(
    r"(charged|total|amount|paid|payment|billed|billing|price|plan|renews? (?:at|for)|will be|due|subtotal|receipt)", re.I)


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def _norm_cur(c: str) -> str:
    c = c.strip().rstrip(".").upper()
    if c in ("RS", "INR"):
        return "INR"
    return _SYMBOLS.get(c, c)


def find_prices(text: str) -> List[Dict[str, Any]]:
    """All money amounts, each tagged with whether it looks like a discount."""
    found: List[Dict[str, Any]] = []
    seen = set()
    for rx in (_PRICE_PRE, _PRICE_POST):
        for m in rx.finditer(text):
            try:
                amt = _to_float(m.group("amt"))
            except ValueError:
                continue
            cur = _norm_cur(m.group("cur"))
            key = (m.start(), amt)
            if key in seen:
                continue
            seen.add(key)
            ctx = text[max(0, m.start() - 40): m.end() + 40]
            tail = (m.group("tail") or "") + " " + text[m.end(): m.end() + 24]
            cycle = ""
            for name, crx in _CYCLE_WORDS:
                if re.search(crx, tail, re.I):
                    cycle = name
                    break
            before = text[max(0, m.start() - 24): m.start()]
            after = text[m.end(): m.end() + 14]
            is_discount = bool(
                re.search(r"(save|saving|discount|cashback|rebate|up to|worth)\s*$", before, re.I)
                or re.search(r"^\s*(off|discount|cashback)", after, re.I)
            )
            found.append({
                "amount": amt, "currency": cur, "cycle": cycle, "is_discount": is_discount,
                "raw": m.group(0).strip(), "pos": m.start(), "context": ctx,
                "charge_hint": bool(_CHARGE_CONTEXT.search(ctx)) and not is_discount,
            })
    found.sort(key=lambda p: p["pos"])
    return found


def best_price(prices: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Pick the amount most likely to be the recurring charge."""
    cands = [p for p in prices if not p["is_discount"] and p["amount"] > 0]
    if not cands:
        return None
    # Prefer ones with explicit cycle, then charge-context, then first mention.
    cands.sort(key=lambda p: (not p["cycle"], not p["charge_hint"], p["pos"]))
    return cands[0]


# ---------------------------------------------------------------------------
# Promo codes / offers
# ---------------------------------------------------------------------------
_CODE_TOKEN = r"[A-Z0-9][A-Z0-9_\-]{3,19}"
_PROMO_PATTERNS = [
    re.compile(rf"(?:promo(?:tion(?:al)?)?|coupon|voucher|discount|referral|redeem|offer|gift)\s*(?:code)?\s*(?:is|:|-|=)?\s*[\"'“‘`]?(?P<c>{_CODE_TOKEN})\b", re.I),
    re.compile(rf"\b(?:use|enter|apply|with|using|redeem)\s+(?:the\s+)?(?:promo\s+|coupon\s+|voucher\s+|discount\s+)?code[:\s]+[\"'“‘`]?(?P<c>{_CODE_TOKEN})\b", re.I),
    re.compile(rf"\bcode[:\s]+[\"'“‘`]?(?P<c>{_CODE_TOKEN})\b", re.I),
]
_CODE_STOPWORDS = {
    "CODE", "PROMO", "COUPON", "OFFER", "DISCOUNT", "VOUCHER", "APPLY", "ENTER", "USED", "USE",
    "THIS", "THAT", "WITH", "FROM", "YOUR", "FREE", "TRIAL", "MONTH", "YEARS", "YEAR", "DAYS",
    "ONLY", "TERMS", "CHECKOUT", "REDEEM", "ONLINE", "STORE", "LINK", "HERE", "BELOW", "ABOVE",
    "EMAIL", "ACCOUNT", "PLEASE", "TODAY", "TOMORROW", "NEXT", "VALID", "UNTIL", "EXPIRES",
}


def find_promo_codes(text: str) -> List[Dict[str, Any]]:
    """Promo/coupon codes. A code must contain a digit or be fully upper-case in
    the source, so ordinary words after 'code' are not mistaken for codes."""
    out: List[Dict[str, Any]] = []
    seen = set()
    for rx in _PROMO_PATTERNS:
        for m in rx.finditer(text):
            raw = m.group("c")
            code = raw.upper()
            if code in _CODE_STOPWORDS or code in seen:
                continue
            has_digit = any(ch.isdigit() for ch in raw)
            if not (has_digit or raw.isupper()):
                continue
            if re.fullmatch(r"\d+", code):
                continue
            seen.add(code)
            out.append({"code": code, "context": text[max(0, m.start() - 40): m.end() + 60].strip()})
    return out


def find_discounts(text: str) -> List[str]:
    """Human-readable discount / free-period phrases, copied from the text."""
    pats = [
        r"\b\d{1,3}\s?%\s*(?:off|discount)[^.\n]{0,40}",
        r"\bsave\s+(?:up to\s+)?\d{1,3}\s?%[^.\n]{0,40}",
        r"\b(?:" + _CODE_RX + r"|[$€£₹])\s?\d+(?:\.\d+)?\s*off\b[^.\n]{0,30}",
        r"\b(?:first|1st)\s+(?:month|year|week)\s+free\b",
        r"\b\d+\s*(?:months?|weeks?|days?)\s+(?:free|on us)\b",
        r"\bfree\s+(?:trial|for)\s+(?:of\s+)?\d+\s*(?:months?|weeks?|days?)\b",
        r"\b\d+[- ](?:day|week|month)\s+free\s+trial\b",
        r"\bbuy\s+\d+\s+get\s+\d+\b",
    ]
    seen, out = set(), []
    for p in pats:
        for m in re.finditer(p, text, re.I):
            s = re.sub(r"\s+", " ", m.group(0)).strip(" ,;:-")
            if s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
    return out[:6]


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_MON_RX = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"

_DATE_PATTERNS = [
    ("iso", re.compile(r"\b(?P<y>20\d{2})-(?P<m>\d{1,2})-(?P<d>\d{1,2})\b")),
    ("dmy_text", re.compile(rf"\b(?P<d>\d{{1,2}})(?:st|nd|rd|th)?\s+(?P<mon>{_MON_RX})\.?,?\s+(?P<y>20\d{{2}})\b", re.I)),
    ("mdy_text", re.compile(rf"\b(?P<mon>{_MON_RX})\.?\s+(?P<d>\d{{1,2}})(?:st|nd|rd|th)?,?\s+(?P<y>20\d{{2}})\b", re.I)),
    ("dmy_num", re.compile(r"\b(?P<d>\d{1,2})[/.](?P<m>\d{1,2})[/.](?P<y>20\d{2})\b")),
    # no-year forms: "12 Nov", "Nov 12"
    ("dm_text", re.compile(rf"\b(?P<d>\d{{1,2}})(?:st|nd|rd|th)?\s+(?P<mon>{_MON_RX})\b(?!\.?,?\s+\d)", re.I)),
    ("md_text", re.compile(rf"\b(?P<mon>{_MON_RX})\.?\s+(?P<d>\d{{1,2}})(?:st|nd|rd|th)?\b(?!,?\s+\d{{2}}|:)", re.I)),
]

_DATE_KINDS = [
    ("trial_end", re.compile(r"(trial\s+(?:ends?|expires?|period ends?)|free\s+(?:trial\s+)?(?:ends?|until)|trial\s+until|ends?\s+(?:on\s+)?your\s+trial)", re.I)),
    ("renewal_date", re.compile(r"(renew(?:s|al|ing)?|next\s+(?:billing|payment|charge)|billed\s+(?:on|again)|will\s+be\s+charged|auto[- ]?renew|due\s+(?:on|date)|next\s+bill)", re.I)),
    ("offer_expiry", re.compile(r"(offer\s+(?:ends?|expires?|valid)|valid\s+(?:until|till|through|thru|to)|expires?|expiry|expiration|ends?\s+(?:on|soon)|hurry|last day|until|ends)", re.I)),
]


def _mk_date(y: int, m: int, d: int) -> Optional[date]:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def find_dates(text: str, today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Dates with the kind of event they most likely describe (from the words
    just before them). Day-first for numeric forms (UAE/EU convention)."""
    today = today or date.today()
    out: List[Dict[str, Any]] = []
    taken: List[tuple] = []
    for name, rx in _DATE_PATTERNS:
        for m in rx.finditer(text):
            if any(a <= m.start() < b or a < m.end() <= b for a, b in taken):
                continue
            gd = m.groupdict()
            if "mon" in gd and gd.get("mon"):
                mon = _MONTHS[gd["mon"][:3].lower()]
            else:
                mon = int(gd["m"])
            day = int(gd["d"])
            if gd.get("y"):
                y = int(gd["y"])
            else:
                y = today.year
            dt = _mk_date(y, mon, day)
            if dt is None:
                continue
            if not gd.get("y") and dt < today - timedelta(days=30):
                dt = _mk_date(y + 1, mon, day) or dt
            taken.append((m.start(), m.end()))
            window = text[max(0, m.start() - 55): m.start()]
            # _DATE_KINDS is ordered most-specific first (trial, then offer, then
            # renewal is handled by order below); the first kind that matches
            # close to the date wins, so "trial ends on" beats the generic "ends on".
            kind = "other"
            for k, krx in _DATE_KINDS:
                hits = list(krx.finditer(window))
                if hits and len(window) - hits[-1].end() <= 30:
                    kind = k
                    break
            out.append({"date": dt.isoformat(), "kind": kind, "raw": m.group(0), "pos": m.start()})
    out.sort(key=lambda d: d["pos"])
    return out


def pick_date(dates: List[Dict[str, Any]], kind: str) -> Optional[str]:
    for d in dates:
        if d["kind"] == kind:
            return d["date"]
    return None


# ---------------------------------------------------------------------------
# Emails / URLs
# ---------------------------------------------------------------------------
_EMAIL_RX = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_NOREPLY_RX = re.compile(r"(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer|notifications?|billing|support|info|hello|team|news|update|offers?|marketing)@", re.I)
_URL_RX = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
_CANCEL_URL_RX = re.compile(r"(cancel|unsubscribe|manage|subscription|membership|billing|account|plan|settings)", re.I)


def find_emails(text: str) -> List[str]:
    seen, out = set(), []
    for m in _EMAIL_RX.finditer(text):
        e = m.group(0).lower().rstrip(".")
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


def find_cancel_urls(text: str) -> List[str]:
    """URLs that look like cancel/manage pages. Pure 'unsubscribe' links are
    email-list opt-outs, so they rank last."""
    urls = [u.rstrip(".,;") for u in _URL_RX.findall(text)]
    scored = []
    for u in urls:
        low = u.lower()
        if not _CANCEL_URL_RX.search(low):
            continue
        if any(x in low for x in ("unsubscribe", "optout", "opt-out", "preferences")):
            score = 3
        elif "cancel" in low:
            score = 0
        elif any(x in low for x in ("subscription", "membership", "billing", "manage")):
            score = 1
        else:
            score = 2
        scored.append((score, u))
    scored.sort(key=lambda t: t[0])
    out, seen = [], set()
    for _, u in scored:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


# ---------------------------------------------------------------------------
# Email header parsing
# ---------------------------------------------------------------------------
_HEADER_RX = re.compile(r"^(from|to|subject|date|sent|cc|delivered-to|reply-to)\s*:\s*(.*)$", re.I)


def parse_email(text: str) -> Dict[str, Any]:
    """Split a pasted email into headers + body. Works with raw 'From:/To:/Subject:'
    blocks and Gmail's forwarded-message header style. If there are no headers
    the whole text is the body."""
    headers: Dict[str, str] = {}
    lines = text.splitlines()
    body_start = 0
    header_run = 0
    for i, line in enumerate(lines[:30]):
        s = line.strip().lstrip(">").strip()
        m = _HEADER_RX.match(s)
        if m:
            key = m.group(1).lower()
            headers.setdefault("date" if key == "sent" else key, m.group(2).strip())
            header_run += 1
            body_start = i + 1
        elif s == "" and header_run:
            body_start = i + 1
            if header_run >= 2:
                break
        elif header_run and i - body_start > 1:
            break
    body = "\n".join(lines[body_start:]) if header_run >= 2 else text
    is_email = header_run >= 2 and ("from" in headers or "subject" in headers)
    sender_emails = find_emails(headers.get("from", ""))
    to_emails = find_emails(headers.get("to", "")) or find_emails(headers.get("delivered-to", ""))
    return {
        "is_email": is_email,
        "subject": headers.get("subject", ""),
        "from": headers.get("from", ""),
        "from_email": sender_emails[0] if sender_emails else "",
        "to_email": to_emails[0] if to_emails else "",
        "date": headers.get("date", ""),
        "body": body.strip() if is_email else text,
    }


# ---------------------------------------------------------------------------
# Heuristic classification
# ---------------------------------------------------------------------------
_RECEIPT_RX = re.compile(r"(receipt|invoice|payment (?:received|successful|confirmation)|you(?:'| )?ve been charged|thanks for your payment|order confirmation|billing statement|charged to|has been charged|subscription (?:is|has been) (?:confirmed|active|started)|welcome to .*premium)", re.I)
_RENEW_RX = re.compile(r"(will renew|renews on|auto[- ]?renew|next billing|upcoming (?:charge|payment|renewal)|your (?:subscription|plan|membership) (?:renews|will renew|is about to))", re.I)
_TRIAL_RX = re.compile(r"(free trial|trial (?:ends?|period|expires?)|trial (?:started|begins)|your trial)", re.I)
_PROMO_RX = re.compile(r"(% off|\bsave\b|\bdeal\b|limited[- ]time|special offer|exclusive offer|promo|coupon|discount|black friday|sale\b|use code|get \d+ months?)", re.I)
_CANCEL_RX = re.compile(r"(cancel(?:led|lation)? (?:confirmed|successful)|subscription (?:has been )?cancel|membership ended|we(?:'| )?re sorry to see you go)", re.I)


def classify_hint(text: str, subject: str = "") -> Dict[str, Any]:
    blob = f"{subject}\n{text}"
    flags = {
        "receipt": bool(_RECEIPT_RX.search(blob)),
        "renewal_notice": bool(_RENEW_RX.search(blob)),
        "trial": bool(_TRIAL_RX.search(blob)),
        "promo": bool(_PROMO_RX.search(blob)),
        "cancelled": bool(_CANCEL_RX.search(blob)),
    }
    if flags["cancelled"]:
        kind = "cancelled"
    elif flags["trial"] and not flags["receipt"]:
        kind = "trial"
    elif flags["receipt"] or flags["renewal_notice"]:
        kind = "subscription"
    elif flags["promo"]:
        kind = "promo"
    else:
        kind = "unknown"
    return {"kind": kind, **flags}


def provider_from_sender(from_header: str, from_email: str) -> str:
    """'Netflix <info@mailer.netflix.com>' -> 'Netflix'."""
    name = re.sub(r"<.*?>", "", from_header or "").strip().strip('"').strip()
    name = re.sub(r"\b(team|support|billing|no[- ]?reply|noreply|notifications?|inc\.?|ltd\.?|llc)\b", "", name, flags=re.I).strip(" -,")
    if name and "@" not in name and len(name) <= 40:
        return name
    if from_email and "@" in from_email:
        dom = from_email.split("@", 1)[1].split(".")
        if len(dom) >= 2:
            core = dom[-2] if dom[-2] not in ("co", "com", "org", "net") or len(dom) < 3 else dom[-3]
            return core.capitalize()
    return ""


# ---------------------------------------------------------------------------
# One-shot deterministic extraction
# ---------------------------------------------------------------------------
def deterministic_extract(text: str, today: Optional[date] = None) -> Dict[str, Any]:
    email = parse_email(text)
    body = email["body"]
    full = f"{email['subject']}\n{body}" if email["subject"] else body
    prices = find_prices(full)
    price = best_price(prices)
    dates = find_dates(full, today)
    codes = find_promo_codes(full)
    cancel_urls = find_cancel_urls(full)
    hint = classify_hint(body, email["subject"])
    other_emails = [e for e in find_emails(full) if e not in (email["from_email"],) and not _NOREPLY_RX.search(e)]
    account_email = email["to_email"] or (other_emails[0] if other_emails else "")

    cycle = (price or {}).get("cycle", "")
    if not cycle:
        for name, crx in _CYCLE_WORDS:
            if re.search(crx, full, re.I):
                cycle = name
                break

    ex: Dict[str, Any] = {
        "is_email": email["is_email"],
        "email_subject": email["subject"],
        "sender_email": email["from_email"],
        "provider": provider_from_sender(email["from"], email["from_email"]) if email["is_email"] else "",
        "account_email": account_email,
        "price": price["amount"] if price else None,
        "currency": price["currency"] if price else "",
        "billing_cycle": cycle,
        "trial_end": pick_date(dates, "trial_end"),
        "renewal_date": pick_date(dates, "renewal_date"),
        "offer_expiry": pick_date(dates, "offer_expiry"),
        "promo_codes": [c["code"] for c in codes],
        "discounts": find_discounts(full),
        "cancel_url": cancel_urls[0] if cancel_urls else "",
        "hint": hint,
        "all_prices": [{k: p[k] for k in ("amount", "currency", "cycle", "is_discount", "raw")} for p in prices][:8],
        "all_dates": [{k: d[k] for k in ("date", "kind", "raw")} for d in dates][:8],
    }
    return ex


# ---------------------------------------------------------------------------
# Merge AI output with deterministic findings & verify against the source
# ---------------------------------------------------------------------------
def _norm(s: str) -> str:
    return re.sub(r"[\s,]+", "", (s or "").lower())


def _amount_in_text(amount: float, text: str) -> bool:
    forms = {f"{amount:.2f}", f"{amount:.1f}", f"{amount:g}", f"{int(amount)}" if amount == int(amount) else ""}
    forms.discard("")
    t = text.replace(",", "")
    return any(re.search(rf"(?<![\d.]){re.escape(f)}(?!\d)", t) for f in forms)


def _valid_iso(s: Any) -> Optional[str]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s)[:10]).date().isoformat()
    except Exception:
        return None


def merge_and_verify(ai: Dict[str, Any], det: Dict[str, Any], source_text: str) -> Dict[str, Any]:
    """Combine AI + deterministic results.

    - Anything the AI states about price / promo code / mail id must appear in
      the source text, otherwise it is dropped (hallucination guard).
    - Missing values are filled from the deterministic pass.
    - Returns the merged dict with `verified` (what was confirmed in source),
      `doubts` (human-readable reasons to double check) and an adjusted
      `confidence`.
    """
    ex = dict(ai)
    src = source_text or ""
    verified: Dict[str, bool] = {}
    doubts: List[str] = []

    # --- promo codes: union, but each must literally be in the source -------
    ai_codes = []
    for c in ([ex.get("promo_code")] if ex.get("promo_code") else []) + list(ex.get("promo_codes") or []):
        c = str(c or "").strip().upper()
        if c and c in src.upper() and c not in ai_codes:
            ai_codes.append(c)
    codes = ai_codes + [c for c in det.get("promo_codes", []) if c not in ai_codes]
    ex["promo_codes"] = codes[:5]
    ex["promo_code"] = codes[0] if codes else ""
    if codes:
        verified["promo_code"] = True

    # --- price ---------------------------------------------------------------
    price = ex.get("price")
    if isinstance(price, (int, float)) and price > 0:
        if _amount_in_text(float(price), src):
            verified["price"] = True
        elif det.get("price") is not None:
            doubts.append(f"AI price {price:g} not found in the text; used {det['price']:g} instead")
            ex["price"] = det["price"]
            ex["currency"] = det.get("currency") or ex.get("currency")
            verified["price"] = True
        else:
            doubts.append(f"Price {price:g} could not be confirmed in the text")
            ex["price"] = None
    elif det.get("price") is not None:
        ex["price"] = det["price"]
        ex["currency"] = det.get("currency") or ex.get("currency")
        verified["price"] = True
    if det.get("currency") and verified.get("price") and ex.get("price") == det.get("price"):
        ex["currency"] = det["currency"]
    if not ex.get("billing_cycle") and det.get("billing_cycle"):
        ex["billing_cycle"] = det["billing_cycle"]

    # --- dates: valid ISO, AI value must be one the text supports ------------
    text_dates = {d["date"] for d in det.get("all_dates", [])}
    for field in ("renewal_date", "trial_end", "offer_expiry"):
        v = _valid_iso(ex.get(field))
        dv = det.get(field)
        if v and (v in text_dates):
            ex[field] = v
            verified[field] = True
        elif dv:
            ex[field] = dv
            verified[field] = True
            if v and v != dv:
                doubts.append(f"{field.replace('_', ' ')} corrected to {dv} (matches the text)")
        elif v:
            # AI gave a date the text doesn't contain (relative phrase, or invented)
            ex[field] = v
            doubts.append(f"{field.replace('_', ' ')} {v} is inferred, not written in the text")
        else:
            ex[field] = None

    # --- account email -------------------------------------------------------
    acct = str(ex.get("account_email") or "").strip().lower()
    if acct and acct not in src.lower():
        acct = ""
    ex["account_email"] = acct or det.get("account_email", "")
    if ex["account_email"]:
        verified["account_email"] = True

    ex["sender_email"] = det.get("sender_email", "") or ex.get("sender_email", "")
    ex["email_subject"] = det.get("email_subject", "") or ex.get("email_subject", "")

    # --- cancel url ----------------------------------------------------------
    cu = str(ex.get("cancel_url") or "")
    if cu and cu not in src:
        cu = ""
    ex["cancel_url"] = cu or det.get("cancel_url", "")

    # --- provider fallback ---------------------------------------------------
    if not (ex.get("provider") or "").strip() and det.get("provider"):
        ex["provider"] = det["provider"]

    # --- discounts / offer text ---------------------------------------------
    disc = [d for d in (ex.get("discounts") or []) if isinstance(d, str)]
    for d in det.get("discounts", []):
        if d not in disc:
            disc.append(d)
    ex["discounts"] = disc[:6]
    if not ex.get("discount") and disc:
        ex["discount"] = disc[0]

    # --- content type: don't let marketing become a subscription -------------
    hint = det.get("hint", {})
    ctype = (ex.get("content_type") or "unknown").lower()
    if hint.get("kind") == "cancelled":
        ex["content_type"] = "cancelled"
    elif hint.get("kind") == "promo" and ctype in ("subscription", "unknown", "payment") and not hint.get("receipt"):
        ex["content_type"] = "plan"
        ex["is_promotional"] = True
    elif ctype in ("promo", "offer"):
        ex["content_type"] = "plan"
        ex["is_promotional"] = True
    if hint.get("promo") and codes:
        ex["is_promotional"] = True

    # --- confidence ----------------------------------------------------------
    conf = float(ex.get("confidence") if isinstance(ex.get("confidence"), (int, float)) else 0.5)
    evidence_bonus = 0.04 * sum(1 for k in ("price", "renewal_date", "trial_end", "account_email") if verified.get(k))
    if verified.get("promo_code"):
        evidence_bonus += 0.04
    conf = conf + evidence_bonus - 0.12 * len(doubts)
    if not (ex.get("provider") or ex.get("product")):
        conf = min(conf, 0.45)
        doubts.append("Could not tell which service this is from")
    if ex["content_type"] in ("subscription", "trial") and ex.get("price") is None and not ex.get("trial_end"):
        conf = min(conf, 0.7)
        doubts.append("No price or trial date found")
    ex["confidence"] = round(max(0.0, min(1.0, conf)), 2)

    ex["verified"] = verified
    ex["doubts"] = (ex.get("doubts") if isinstance(ex.get("doubts"), list) else []) + doubts
    ex["doubts"] = list(dict.fromkeys(str(d) for d in ex["doubts"] if d))[:5]

    # suggested destination (what the user should probably choose when in doubt)
    sug = ex.get("suggested_destination") or ""
    if sug not in ("account", "plan", "link", "ignore"):
        sug = ""
    if not sug:
        if ex["content_type"] in ("subscription", "trial") and not ex.get("is_promotional"):
            sug = "account"
        elif ex["content_type"] in ("plan",) or ex.get("is_promotional"):
            sug = "plan"
        elif ex["content_type"] == "cancelled":
            sug = "ignore"
        else:
            sug = "link"
    ex["suggested_destination"] = sug
    return ex


# ---------------------------------------------------------------------------
# Cancel directory — where to cancel well-known services
# ---------------------------------------------------------------------------
CANCEL_DIRECTORY: Dict[str, Dict[str, str]] = {
    "netflix": {"url": "https://www.netflix.com/cancelplan", "steps": "Netflix → Account → Membership & Billing → Cancel Membership"},
    "spotify": {"url": "https://www.spotify.com/account/subscription/", "steps": "Spotify website → Account → Manage your plan → Cancel Premium (can't be done in the app)"},
    "youtube": {"url": "https://www.youtube.com/paid_memberships", "steps": "YouTube → profile → Purchases and memberships → Manage membership → Deactivate"},
    "chatgpt": {"url": "https://chatgpt.com/#settings/Subscription", "steps": "ChatGPT → profile → My plan → Manage subscription → Cancel plan"},
    "openai": {"url": "https://chatgpt.com/#settings/Subscription", "steps": "ChatGPT → profile → My plan → Manage subscription → Cancel plan"},
    "claude": {"url": "https://claude.ai/settings/billing", "steps": "Claude → Settings → Billing → Cancel subscription"},
    "anthropic": {"url": "https://claude.ai/settings/billing", "steps": "Claude → Settings → Billing → Cancel subscription"},
    "disney": {"url": "https://www.disneyplus.com/account/subscription", "steps": "Disney+ → Profile → Account → Subscription → Cancel Subscription"},
    "amazon prime": {"url": "https://www.amazon.com/mc", "steps": "Amazon → Account & Lists → Prime Membership → Manage Membership → End Membership"},
    "prime": {"url": "https://www.amazon.com/mc", "steps": "Amazon → Account & Lists → Prime Membership → Manage Membership → End Membership"},
    "apple": {"url": "https://apps.apple.com/account/subscriptions", "steps": "iPhone Settings → [your name] → Subscriptions → pick the service → Cancel"},
    "icloud": {"url": "https://apps.apple.com/account/subscriptions", "steps": "iPhone Settings → [your name] → iCloud → Manage Storage → Change Storage Plan"},
    "google one": {"url": "https://one.google.com/settings", "steps": "Google One → Settings → Cancel membership"},
    "google play": {"url": "https://play.google.com/store/account/subscriptions", "steps": "Play Store → profile → Payments & subscriptions → Subscriptions → pick one → Cancel"},
    "adobe": {"url": "https://account.adobe.com/plans", "steps": "Adobe account → Plans → Manage plan → Cancel plan (early-cancel fees may apply on annual plans)"},
    "microsoft": {"url": "https://account.microsoft.com/services", "steps": "Microsoft account → Services & subscriptions → Manage → Cancel subscription"},
    "office": {"url": "https://account.microsoft.com/services", "steps": "Microsoft account → Services & subscriptions → Manage → Cancel subscription"},
    "canva": {"url": "https://www.canva.com/settings/billing-and-plans", "steps": "Canva → Account settings → Billing & plans → Cancel subscription"},
    "notion": {"url": "https://www.notion.so/my-account", "steps": "Notion → Settings → Plans → Downgrade to Free"},
    "dropbox": {"url": "https://www.dropbox.com/account/plan", "steps": "Dropbox → Account → Plan → Cancel plan"},
    "github": {"url": "https://github.com/settings/billing", "steps": "GitHub → Settings → Billing and plans → Cancel plan"},
    "linkedin": {"url": "https://www.linkedin.com/premium/manage", "steps": "LinkedIn → Me → Premium features → Manage Premium account → Cancel subscription"},
    "anghami": {"url": "https://play.anghami.com/settings", "steps": "Anghami → Settings → Manage subscription (or via the app store you subscribed with)"},
    "osn": {"url": "https://www.osnplus.com", "steps": "OSN+ → Account → Subscription → Cancel (or via your telecom / app store billing)"},
    "shahid": {"url": "https://shahid.mbc.net", "steps": "Shahid → Profile → Subscription → Cancel (or via the billing partner you used)"},
    "careem": {"url": "https://www.careem.com", "steps": "Careem app → Account → Careem Plus → Manage → Cancel membership"},
    "noon": {"url": "https://www.noon.com", "steps": "noon → Account → noon One → Manage membership → Cancel"},
    "duolingo": {"url": "https://www.duolingo.com/settings/subscription", "steps": "Duolingo → Settings → Super Duolingo → Manage subscription (web or the store you used)"},
    "grammarly": {"url": "https://account.grammarly.com/subscription", "steps": "Grammarly → Account → Subscription → Cancel subscription"},
    "zoom": {"url": "https://zoom.us/billing", "steps": "Zoom → Account Management → Billing → Current Plans → Cancel Subscription"},
    "midjourney": {"url": "https://www.midjourney.com/account", "steps": "Midjourney → Account → Manage Subscription → Cancel Plan"},
    "perplexity": {"url": "https://www.perplexity.ai/settings/account", "steps": "Perplexity → Settings → Account → Manage subscription → Cancel"},
    "cursor": {"url": "https://www.cursor.com/settings", "steps": "Cursor dashboard → Billing → Manage subscription → Cancel"},
    "figma": {"url": "https://www.figma.com/settings", "steps": "Figma → Settings → Billing → Cancel plan"},
    "hbo": {"url": "https://www.max.com/account", "steps": "Max → Profile → Subscription → Manage → Cancel"},
    "max": {"url": "https://www.max.com/account", "steps": "Max → Profile → Subscription → Manage → Cancel"},
    "paramount": {"url": "https://www.paramountplus.com/account/", "steps": "Paramount+ → Account → Cancel Subscription"},
    "hulu": {"url": "https://secure.hulu.com/account", "steps": "Hulu → Account → Cancel Your Subscription"},
    "tinder": {"url": "https://tinder.com", "steps": "Cancel via the store you subscribed with (App Store / Play Store subscriptions)"},
}


def cancel_info(provider: str, cancel_url: str = "", cancel_steps: str = "") -> Dict[str, str]:
    """Where to cancel. Explicit data (from the email itself or the user) wins,
    then the built-in directory, then a generic fallback."""
    p = (provider or "").lower()
    entry = None
    for key in sorted(CANCEL_DIRECTORY, key=len, reverse=True):
        if re.search(rf"\b{re.escape(key)}\b", p):
            entry = CANCEL_DIRECTORY[key]
            break
    if cancel_url:
        return {"url": cancel_url, "steps": cancel_steps or (entry or {}).get("steps", ""), "source": "email"}
    if entry:
        return {"url": entry["url"], "steps": cancel_steps or entry["steps"], "source": "directory"}
    return {
        "url": "", "source": "unknown",
        "steps": cancel_steps or "Open the service's website or app → Account/Billing → Subscription → Cancel. "
                                 "If you subscribed through Apple or Google, cancel under Subscriptions in the store.",
    }


# ---------------------------------------------------------------------------
# Personal-memory helpers
# ---------------------------------------------------------------------------
def _d(v: Any) -> Optional[date]:
    iso = _valid_iso(v)
    return datetime.fromisoformat(iso).date() if iso else None


def next_charge(sub: Dict[str, Any], today: date) -> Optional[date]:
    """Next date money leaves the account (trial end wins for trials)."""
    if sub.get("status") in ("Cancelled", "Expired", "Paused"):
        return None
    t = _d(sub.get("trial_end"))
    if sub.get("status") == "Trial" and t and t >= today:
        return t
    r = _d(sub.get("renewal_date"))
    if not r:
        return t if t and t >= today else None
    cycle = (sub.get("billing_cycle") or "monthly").lower()
    # roll forward stale renewal dates
    guard = 0
    while r < today and guard < 600:
        guard += 1
        if cycle == "yearly":
            try:
                r = r.replace(year=r.year + 1)
            except ValueError:
                r = r + timedelta(days=365)
        elif cycle == "weekly":
            r = r + timedelta(days=7)
        else:
            m = r.month + 1
            y = r.year + (1 if m > 12 else 0)
            m = 1 if m > 12 else m
            day = min(r.day, 28 if m == 2 else 30 if m in (4, 6, 9, 11) else 31)
            r = date(y, m, day)
    return r


def cancel_plan(sub: Dict[str, Any], today: date, notice_days: int = 1) -> Optional[Dict[str, Any]]:
    """What the user needs to remember to avoid the next charge."""
    charge = next_charge(sub, today)
    if not charge:
        return None
    cancel_by = charge - timedelta(days=max(0, notice_days))
    days_left = (cancel_by - today).days
    info = cancel_info(sub.get("provider") or sub.get("product", ""), sub.get("cancel_url", ""), sub.get("cancel_steps", ""))
    if days_left < 0:
        urgency = "overdue"
    elif days_left == 0:
        urgency = "today"
    elif days_left <= 7:
        urgency = "soon"
    else:
        urgency = "later"
    is_trial = sub.get("status") == "Trial"
    return {
        "id": sub.get("id"), "provider": sub.get("provider"), "plan": sub.get("plan", ""),
        "status": sub.get("status"), "is_trial": is_trial,
        "price": sub.get("price"), "currency": sub.get("currency"), "billing_cycle": sub.get("billing_cycle"),
        "charge_date": charge.isoformat(), "cancel_by": cancel_by.isoformat(), "days_left": days_left,
        "urgency": urgency, "account_email": sub.get("account_email", ""),
        "where": info, "promo_code": sub.get("promo_code", ""),
    }


def active_promos(items: List[Dict[str, Any]], today: date) -> List[Dict[str, Any]]:
    """Promo codes still worth remembering (not expired)."""
    out = []
    for it in items:
        code = (it.get("promo_code") or "").strip()
        if not code:
            continue
        exp = _d(it.get("offer_expiry"))
        if exp and exp < today:
            continue
        out.append({
            "code": code, "provider": it.get("provider", ""), "description": it.get("discount") or it.get("notes", ""),
            "expires": exp.isoformat() if exp else None,
            "days_left": (exp - today).days if exp else None,
            "ref_type": it.get("_ref_type", "plan"), "ref_id": it.get("id"),
        })
    out.sort(key=lambda p: (p["days_left"] is None, p["days_left"] if p["days_left"] is not None else 0))
    return out
