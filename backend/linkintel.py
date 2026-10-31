"""Link intelligence: classify a pasted URL, pull metadata, build tags.

Pure helpers + small best-effort fetchers (all failures are swallowed — saving a
link must never fail because a site was unreachable).
"""
from __future__ import annotations

import html as _html
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 SubMind"

# kind -> (display source used by the Link Vault filter, collection/section name)
KINDS = {
    "github": ("GitHub", "GitHub"),
    "instagram": ("Instagram", "Instagram"),
    "youtube": ("YouTube", "YouTube"),
    "tiktok": ("TikTok", "TikTok"),
    "x": ("X", "X / Twitter"),
    "reddit": ("Reddit", "Reddit"),
    "linkedin": ("LinkedIn", "LinkedIn"),
    "article": ("Website", "Websites"),
}

_GH_RESERVED = {
    "features", "topics", "collections", "trending", "sponsors", "marketplace", "settings", "orgs", "login",
    "pricing", "about", "explore", "notifications", "issues", "pulls", "search", "readme", "enterprise", "apps",
}


def normalize_url(url: str) -> str:
    u = (url or "").strip().strip("<>")
    if u and not re.match(r"^[a-z][a-z0-9+.\-]*://", u, re.I):
        u = "https://" + u
    return u


def parse_github(url: str) -> Optional[Dict[str, str]]:
    """github.com/<owner>/<repo>[/...] -> {owner, repo}. None for non-repo pages."""
    p = urlparse(normalize_url(url))
    host = (p.hostname or "").lower()
    if host not in ("github.com", "www.github.com"):
        return None
    parts = [x for x in p.path.split("/") if x]
    if len(parts) < 2 or parts[0].lower() in _GH_RESERVED:
        return None
    repo = re.sub(r"\.git$", "", parts[1])
    return {"owner": parts[0], "repo": repo}


def classify_url(url: str) -> str:
    host = (urlparse(normalize_url(url)).hostname or "").lower().removeprefix("www.")
    if host == "github.com":
        return "github"
    if host.endswith("instagram.com") or host == "instagr.am":
        return "instagram"
    if host.endswith("youtube.com") or host == "youtu.be":
        return "youtube"
    if host.endswith("tiktok.com"):
        return "tiktok"
    if host in ("x.com", "twitter.com", "mobile.twitter.com") or host.endswith(".x.com"):
        return "x"
    if host.endswith("reddit.com") or host == "redd.it":
        return "reddit"
    if host.endswith("linkedin.com"):
        return "linkedin"
    return "article"


def instagram_shortcode(url: str) -> Optional[Dict[str, str]]:
    m = re.search(r"instagram\.com/(?:[^/]+/)?(reel|reels|p|tv)/([A-Za-z0-9_\-]+)", url)
    if not m:
        return None
    return {"type": "reel" if m.group(1) in ("reel", "reels", "tv") else "post", "code": m.group(2)}


def hashtags(text: str) -> List[str]:
    return [t.lower() for t in re.findall(r"#([A-Za-z][A-Za-z0-9_]{1,30})", text or "")]


def slug_tag(t: str) -> str:
    t = re.sub(r"[^a-z0-9+#.\- ]", "", (t or "").lower()).strip().replace(" ", "-")
    return t[:28]


def build_tags(*groups: List[str], limit: int = 10) -> List[str]:
    """Merge tag lists, dedupe (order = priority), normalise."""
    out, seen = [], set()
    for g in groups:
        for t in g or []:
            s = slug_tag(str(t))
            if s and len(s) > 1 and s not in seen:
                seen.add(s)
                out.append(s)
    return out[:limit]


# ---------------------------------------------------------------------------
# Fetchers (best effort)
# ---------------------------------------------------------------------------
def _meta(html: str, *names: str) -> str:
    for n in names:
        for pat in (
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(n)}["\'][^>]*content=["\']([^"\']*)["\']',
            rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']{re.escape(n)}["\']',
        ):
            m = re.search(pat, html, re.I)
            if m and m.group(1).strip():
                return _html.unescape(m.group(1)).strip()
    return ""


def fetch_page_meta(url: str, timeout: int = 8) -> Dict[str, Any]:
    out = {"title": "", "description": "", "thumbnail": None, "text": "", "ok": False}
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": UA, "Accept-Language": "en"})
        page = r.text[:250000]
        out["ok"] = r.status_code < 400
        m = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
        out["title"] = _html.unescape(re.sub(r"\s+", " ", _meta(page, "og:title", "twitter:title") or (m.group(1) if m else ""))).strip()[:200]
        out["description"] = _meta(page, "og:description", "description", "twitter:description")[:1500]
        out["thumbnail"] = _meta(page, "og:image", "twitter:image") or None
        text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", page, flags=re.I | re.S)
        text = re.sub(r"<[^>]+>", " ", text)
        out["text"] = _html.unescape(re.sub(r"\s+", " ", text))[:3000]
    except Exception:
        pass
    return out


def fetch_github(owner: str, repo: str, timeout: int = 8) -> Dict[str, Any]:
    """Repo facts from the public GitHub API (60 req/h unauthenticated)."""
    out: Dict[str, Any] = {"ok": False}
    try:
        h = {"User-Agent": "SubMind", "Accept": "application/vnd.github+json"}
        r = requests.get(f"https://api.github.com/repos/{owner}/{repo}", headers=h, timeout=timeout)
        if r.status_code != 200:
            return out
        j = r.json()
        out.update({
            "ok": True, "full_name": j.get("full_name"), "description": j.get("description") or "",
            "stars": j.get("stargazers_count"), "forks": j.get("forks_count"), "language": j.get("language"),
            "topics": j.get("topics") or [], "license": (j.get("license") or {}).get("spdx_id"),
            "updated_at": j.get("pushed_at"), "homepage": j.get("homepage") or "", "archived": j.get("archived", False),
            "avatar": (j.get("owner") or {}).get("avatar_url"),
        })
        try:
            rr = requests.get(f"https://api.github.com/repos/{owner}/{repo}/readme",
                              headers={**h, "Accept": "application/vnd.github.raw"}, timeout=timeout)
            if rr.status_code == 200:
                txt = re.sub(r"<[^>]+>", " ", rr.text)          # strip html badges
                txt = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", txt)   # images
                txt = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", txt)  # links -> text
                out["readme"] = re.sub(r"\s+", " ", txt)[:3500]
        except Exception:
            pass
    except Exception:
        pass
    return out


def fetch_oembed(url: str, kind: str, timeout: int = 6) -> Dict[str, Any]:
    """YouTube / TikTok / X oEmbed — title, author, thumbnail without an API key."""
    ep = {
        "youtube": "https://www.youtube.com/oembed",
        "tiktok": "https://www.tiktok.com/oembed",
        "x": "https://publish.twitter.com/oembed",
    }.get(kind)
    if not ep:
        return {}
    try:
        r = requests.get(ep, params={"url": url, "format": "json"}, timeout=timeout, headers={"User-Agent": UA})
        if r.status_code == 200:
            j = r.json()
            return {"title": j.get("title") or "", "author": j.get("author_name") or "", "thumbnail": j.get("thumbnail_url")}
    except Exception:
        pass
    return {}


def fetch_instagram(url: str) -> Dict[str, Any]:
    """Public Instagram posts/reels expose their caption in og:description.
    Instagram often serves a login wall — then we only have the URL, and the
    caller must say so rather than pretend the video was analysed."""
    meta = fetch_page_meta(url)
    desc = meta.get("description", "")
    title = meta.get("title", "")
    login_wall = (not desc) or bool(re.search(r"log ?in|sign ?up", title, re.I) and not desc)
    caption = ""
    author = ""
    # og:description looks like: '1,234 likes, 56 comments - user on March 3, 2025: "caption…"'
    m = re.search(r"-\s*([A-Za-z0-9._]+)\s+on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s*:\s*[\"“](.*)[\"”]\.?$", desc, re.S)
    if m:
        author, caption = m.group(1), m.group(2).strip()
    elif desc:
        caption = desc
    if not author:
        a = re.search(r"@([A-Za-z0-9._]+)", title) or re.search(r"^([A-Za-z0-9._]+) on Instagram", title)
        author = a.group(1) if a else ""
    return {"ok": bool(caption), "caption": caption[:1500], "author": author, "title": title,
            "thumbnail": meta.get("thumbnail"), "login_wall": login_wall, "hashtags": hashtags(caption)}
