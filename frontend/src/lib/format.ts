// Formatting helpers.
export function money(amount?: number | null, currency = "AED"): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const s = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
  return `${currency} ${s}`;
}

export function formatDate(d?: string | null): string {
  if (!d) return "—";
  try {
    const date = new Date(String(d).slice(0, 10) + "T00:00:00");
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(d);
  }
}

export function daysUntil(d?: string | null): number | null {
  if (!d) return null;
  try {
    const date = new Date(String(d).slice(0, 10) + "T00:00:00");
    if (isNaN(date.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((date.getTime() - today.getTime()) / 86400000);
  } catch {
    return null;
  }
}

export function relativeDate(d?: string | null): string {
  const n = daysUntil(d);
  if (n === null) return "—";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 0) return `${Math.abs(n)}d ago`;
  if (n < 7) return `In ${n} days`;
  if (n < 30) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30)} months`;
}

export const CATEGORIES = ["AI", "Streaming", "Music", "Productivity", "Cloud", "Gaming", "News", "Fitness", "Shopping", "Other"];
export const CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR", "SAR"];
export const CYCLES = ["monthly", "yearly", "weekly", "custom"];
export const STATUSES = ["Active", "Trial", "Paused", "Cancelled", "Expired", "Unknown"];

// ---- Links ---------------------------------------------------------------------
export type LinkKind = "github" | "instagram" | "youtube" | "tiktok" | "x" | "reddit" | "linkedin" | "article" | "note";

export const KIND_LABEL: Record<string, string> = {
  github: "GitHub repo", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", x: "X post",
  reddit: "Reddit", linkedin: "LinkedIn", article: "Web page", note: "Note",
};

export const KIND_ICON: Record<string, string> = {
  github: "github", instagram: "instagram", youtube: "youtube", tiktok: "music-note", x: "twitter",
  reddit: "reddit", linkedin: "linkedin", article: "web", note: "note-text-outline",
};

export function looksLikeUrl(t?: string | null): boolean {
  const s = (t || "").trim();
  return /^https?:\/\/\S+$/i.test(s) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(s);
}

// Client-side twin of backend/linkintel.classify_url so the paste screen can show what it found live.
export function detectLinkKind(url?: string | null): LinkKind {
  const m = (url || "").trim().toLowerCase().match(/^(?:[a-z]+:\/\/)?(?:www\.)?([^/?#]+)/);
  const host = m ? m[1] : "";
  if (host === "github.com") return "github";
  if (host.endsWith("instagram.com") || host === "instagr.am") return "instagram";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com")) return "x";
  if (host.endsWith("reddit.com") || host === "redd.it") return "reddit";
  if (host.endsWith("linkedin.com")) return "linkedin";
  return "article";
}

export function parseTags(raw: string): string[] {
  return raw.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean);
}

// Reminder presets shared by Paste Link and the link detail screen.
export const REMIND_PRESETS: { label: string; days: number | null }[] = [
  { label: "No reminder", days: null },
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
];

export function cancelByLabel(daysLeft: number, cancelBy: string): string {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`;
  if (daysLeft === 0) return "Cancel today";
  if (daysLeft === 1) return "Cancel by tomorrow";
  return `Cancel by ${formatDate(cancelBy)}`;
}
