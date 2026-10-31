/**
 * Local, deterministic intelligence shared by Links, Promos, Prompts and Brain Map.
 * Works offline and does not send personal vault data to external AI providers.
 */
export type VaultItem = Record<string, any>;

const STOP = new Set(["www", "com", "net", "org", "app", "site", "co", "io", "the", "and", "with", "from", "https", "http"]);
const TOPICS: Record<string, string[]> = {
  AI: ["ai", "model", "llm", "chatgpt", "claude", "gemini", "seedance", "prompt", "generative", "grok"],
  Development: ["github", "developer", "app", "coding", "code", "api", "replit", "supabase", "python", "react", "expo"],
  Learning: ["course", "tutorial", "learn", "study", "research", "academy", "documentation", "docs"],
  Design: ["design", "figma", "image", "animation", "video", "cinematic", "3d", "render"],
  Productivity: ["automation", "workflow", "project", "notion", "planner", "productivity"],
  Finance: ["bank", "finance", "billing", "subscription", "price", "budget", "payment"],
  Deals: ["coupon", "discount", "promo", "offer", "giveaway", "freebie", "trial", "sale", "credit"],
  Health: ["health", "fitness", "workout", "nutrition", "sleep", "wellness"],
};
const PROVIDER_DOMAINS: Record<string, string> = {
  "openai.com": "ChatGPT", "chatgpt.com": "ChatGPT", "anthropic.com": "Claude",
  "claude.ai": "Claude", "gemini.google.com": "Gemini", "replit.com": "Replit",
  "github.com": "GitHub", "higgsfield.ai": "Higgsfield", "perplexity.ai": "Perplexity",
  "reddit.com": "Reddit", "youtube.com": "YouTube", "youtu.be": "YouTube",
};
const lower = (value: unknown) => String(value || "").toLowerCase();
const label = (value: unknown) => String(value || "").trim();
const key = (value: unknown) => lower(value).replace(/[^a-z0-9]/g, "");
function tokens(text: string): string[] {
  return Array.from(new Set(lower(text).split(/[^a-z0-9]+/).filter((x) => x.length > 2 && !STOP.has(x)))).slice(0, 30);
}
export function inferTags(text: string, explicit: string[] = []): string[] {
  const words = tokens(text);
  const found = new Set(explicit.map((x) => lower(x).trim()).filter(Boolean));
  for (const [topic, terms] of Object.entries(TOPICS)) {
    if (terms.some((t) => words.includes(t) || lower(text).includes(t + " "))) found.add(topic.toLowerCase());
  }
  return [...found].slice(0, 12);
}
export function inferCategory(text: string): string {
  const words = tokens(text);
  let winner = "Other"; let top = 0;
  for (const [category, terms] of Object.entries(TOPICS)) {
    const score = terms.reduce((count, term) => count + Number(words.includes(term)), 0);
    if (score > top) { top = score; winner = category; }
  }
  return winner;
}
export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (!["https:", "http:"].includes(url.protocol)) throw Error("Only http(s) URLs are supported");
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const param of [...url.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid|igshid|mc_cid|mc_eid|ref_src)$/i.test(param)) url.searchParams.delete(param);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch { throw Error("Enter a valid http:// or https:// link"); }
}
export function classifyLink(url: string, note = "", source = "share"): VaultItem {
  const canonical_url = canonicalUrl(url);
  const parsed = new URL(canonical_url);
  const domain = parsed.hostname.replace(/^www\./, "");
  const provider = Object.entries(PROVIDER_DOMAINS).find(([host]) => domain === host || domain.endsWith("." + host))?.[1] ||
    domain.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  const path = decodeURIComponent(parsed.pathname).replace(/[-_/]+/g, " ").trim().slice(0, 80);
  const context = [domain, path, note].join(" ");
  const category = inferCategory(context);
  return {
    url: url.trim(), canonical_url, provider, source, category,
    title: path.length > 3 ? path : provider,
    summary: note.trim().slice(0, 700),
    note: note.trim().slice(0, 1500),
    tags: inferTags(context, [domain.split(".")[0]]),
    classification: "local-rules", review_required: false,
  };
}
/** Expiry is recorded only when a matching contextual date is explicit. */
export function expiryFromText(text: string): string | null {
  const s = text.slice(0, 2500);
  const match = s.match(/(?:expires?|ending|valid until|offer ends|deadline|until)\s*(?:on|by|:)?\s*((?:20\d{2}[-/]\d{1,2}[-/]\d{1,2})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2})|(?:\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d{2}))/i);
  if (!match) return null;
  const t = Date.parse(match[1]);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
export function graphFromVault(v: VaultItem): { nodes: VaultItem[]; edges: VaultItem[] } {
  const nodes: VaultItem[] = []; const edges: VaultItem[] = []; const present = new Set<string>();
  const dedupEdges = new Set<string>(); const providerNodes = new Map<string, string>();
  const tagNodes = new Map<string, string>();
  const add = (type: string, id: string, title: unknown, extra: VaultItem = {}) => {
    const nodeId = type + ":" + String(id);
    if (!present.has(nodeId)) {
      nodes.push({ id: nodeId, type, label: label(title).slice(0, 50) || type, ...extra });
      present.add(nodeId);
    }
    return nodeId;
  };
  const connect = (a: string, b: string, relation: string) => {
    if (!present.has(a) || !present.has(b) || a === b) return;
    const k = [a, b].sort().join("|") + ":" + relation;
    if (!dedupEdges.has(k)) { dedupEdges.add(k); edges.push({ source: a, target: b, relation }); }
  };
  const provider = (raw: unknown) => {
    if (!label(raw) || lower(raw) === "unknown") return "";
    const p = key(raw); if (!p) return "";
    const id = add("provider", p, raw); providerNodes.set(p, id); return id;
  };
  const tagsFor = (id: string, item: VaultItem) => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const tag of tags.slice(0, 8)) {
      const tagName = key(tag); if (!tagName) continue;
      let node = tagNodes.get(tagName);
      if (!node) { node = add("tag", tagName, tag); tagNodes.set(tagName, node); }
      connect(id, node, "tag");
    }
    if (label(item.category) && item.category !== "Other") {
      connect(id, add("category", key(item.category), item.category), "category");
    }
  };
  const accountNodes = new Map<string, string>();
  for (const a of (v.accounts || []).slice(0, 80)) {
    const id = add("account", a.id, a.provider || a.email, { ref_id: a.id });
    const p = provider(a.provider); if (p) connect(id, p, "service");
    const accountKey = key(a.provider) + "|" + lower(a.email);
    accountNodes.set(accountKey, id);
  }
  for (const s of (v.subscriptions || []).slice(0, 100)) {
    const id = add("subscription", s.id, [s.provider, s.plan].filter(Boolean).join(" · "), { ref_id: s.id });
    const p = provider(s.provider); if (p) connect(id, p, "service");
    const a = accountNodes.get(key(s.provider) + "|" + lower(s.account_email));
    if (a) connect(id, a, "owned-by");
    tagsFor(id, s);
  }
  for (const l of (v.links || []).slice(0, 80)) {
    const id = add("link", l.id, l.title || l.url, { ref_id: l.id });
    const p = provider(l.provider); if (p) connect(id, p, "service");
    tagsFor(id, l);
  }
  for (const p of (v.prompts || []).slice(0, 60)) {
    const id = add(p.kind === "idea" ? "idea" : "prompt", p.id, p.title, { ref_id: p.id });
    tagsFor(id, p);
    for (const related of (p.related_ids || []).slice(0, 10)) {
      for (const kind of ["link", "subscription", "account", "prompt", "idea"]) connect(id, kind + ":" + related, "related");
    }
  }
  for (const promo of (v.promo_codes || []).slice(0, 60)) {
    const id = add("promo", promo.id, promo.title || promo.provider || promo.code, { ref_id: promo.id });
    const p = provider(promo.provider); if (p) connect(id, p, "offered-by");
    tagsFor(id, { category: "Deals", tags: promo.tags || [] });
  }
  for (const finding of (v.promo_findings || []).slice(0, 70)) {
    const id = add("promo", finding.id, finding.title || finding.provider, { ref_id: finding.id });
    const p = provider(finding.provider); if (p) connect(id, p, "discovered");
    tagsFor(id, { category: "Deals", tags: finding.tags || [] });
  }
  for (const w of (v.watchlist || []).slice(0, 40)) {
    const id = add("plan", w.id, [w.provider, w.plan].filter(Boolean).join(" · "), { ref_id: w.id });
    const p = provider(w.provider); if (p) connect(id, p, "watching");
  }
  return { nodes: nodes.slice(0, 550), edges: edges.filter((e) => present.has(e.source) && present.has(e.target)).slice(0, 1000) };
}
