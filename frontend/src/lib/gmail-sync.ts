/**
 * Android-only, consent-based Gmail reader. All message content is classified
 * on-device; neither email bodies nor access tokens are stored in the vault.
 *
 * Google OAuth setup: Android client ID for package com.submind.metro and
 * SHA-1 fingerprint of the signing certificate; Gmail API enabled; user added
 * to testing audience (or production verification when applicable).
 */
import { Platform } from "react-native";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { expiryFromText } from "@/src/lib/vault-intelligence";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SEARCH = '{"subscription" "renewal" "trial" "receipt" "invoice" "payment" "welcome" "sign up" "account created" "promo" "coupon" "discount" "giveaway" "credit" "offer"}';
let configured = false;
function configure() {
  if (Platform.OS !== "android") throw Error("Gmail OAuth currently requires the Android APK.");
  if (!configured) { GoogleSignin.configure({ scopes: [GMAIL_SCOPE], offlineAccess: false }); configured = true; }
}
export type MailCandidate = {
  message_id: string; type: "subscription" | "account" | "promo";
  source_subject: string; source_from: string; source_date: string;
  confidence: number; extraction: Record<string, any>;
};
export async function getConnectedGmail(): Promise<string | null> {
  configure();
  let user = GoogleSignin.getCurrentUser();
  if (!user && GoogleSignin.hasPreviousSignIn()) {
    try {
      const restored = await GoogleSignin.signInSilently();
      if (restored.type === "success") user = restored.data;
    } catch { return null; }
  }
  return String(user?.user?.email || "").toLowerCase() || null;
}
export async function connectGmail(forceChooser = false): Promise<string> {
  configure();
  if (forceChooser) await GoogleSignin.signOut();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn({});
  if (!isSuccessResponse(result)) throw Error("Google sign-in was cancelled or did not succeed.");
  const email = String(result.data.user.email || "").toLowerCase();
  if (!email) throw Error("Google sign-in did not provide a mailbox address.");
  return email;
}
export async function disconnectGmail(revoke = false): Promise<void> {
  configure();
  if (revoke) await GoogleSignin.revokeAccess();
  else await GoogleSignin.signOut();
}
function urlQuery(base: string, params: Record<string, string | number>): string {
  return base + "?" + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
}
async function gmailRequest(path: string, allowRefresh = true): Promise<any> {
  configure();
  const { accessToken } = await GoogleSignin.getTokens();
  const res = await fetch(GMAIL_API + path, { headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" } });
  if (res.status === 401 && allowRefresh) {
    await GoogleSignin.clearCachedAccessToken(accessToken);
    return gmailRequest(path, false);
  }
  if (!res.ok) {
    if (res.status === 403) throw Error("Gmail access denied. Confirm Gmail API is enabled and this Google account is an OAuth test user.");
    if (res.status === 401) throw Error("Gmail authorisation expired. Reconnect your mailbox.");
    if (res.status === 429) throw Error("Gmail rate limit reached; retry later.");
    throw Error("Gmail request failed (" + res.status + ").");
  }
  return res.json();
}
function base64Utf8(raw: string): string {
  if (!raw) return "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const text = raw.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let bits = 0; let val = 0; const bytes: number[] = [];
  for (const ch of text.slice(0, 32000)) {
    const digit = alphabet.indexOf(ch); if (digit < 0) continue;
    val = (val << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((val >> bits) & 255); }
  }
  try { return decodeURIComponent(bytes.map((x) => "%" + x.toString(16).padStart(2, "0")).join("")); }
  catch { return bytes.map((x) => String.fromCharCode(x)).join(""); }
}
function extractPlain(payload: any, depth = 0): string {
  if (!payload || depth > 5) return "";
  const mime = String(payload.mimeType || "");
  const body = payload.body?.data ? base64Utf8(payload.body.data) : "";
  if (mime.includes("text/plain") && body) return body.slice(0, 8000);
  for (const part of (payload.parts || []).slice(0, 15)) {
    const found = extractPlain(part, depth + 1); if (found) return found;
  }
  // If only HTML is provided, strip markup before running local rules.
  if (mime.includes("text/html") && body) {
    return body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|quot);/g, " ").slice(0, 8000);
  }
  return "";
}
function header(payload: any, name: string): string {
  return String((payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === name)?.value || "");
}
function providerFrom(from: string, subject: string): string {
  const match = from.match(/@([a-z0-9.-]+)/i);
  const domain = String(match?.[1] || "").toLowerCase().replace(/^(mail|notifications|email|news|billing|noreply)\./, "");
  const overrides: Record<string, string> = {
    "openai.com":"ChatGPT","anthropic.com":"Claude","github.com":"GitHub",
    "replit.com":"Replit","google.com":"Google","microsoft.com":"Microsoft",
    "higgsfield.ai":"Higgsfield","canva.com":"Canva","notion.so":"Notion",
  };
  for (const [host, value] of Object.entries(overrides)) if (domain === host || domain.endsWith("." + host)) return value;
  const supplied = from.replace(/<.*$/, "").replace(/["']/g, "").trim();
  if (supplied && !/^(no-?reply|support|billing|team|hello)$/i.test(supplied) && supplied.length < 50) return supplied;
  const prefix = domain.split(".")[0];
  return prefix ? prefix[0].toUpperCase() + prefix.slice(1) : subject.split(" ")[0] || "Unknown";
}
function dateFrom(text: string, regex: RegExp): string | null {
  const m = text.match(regex);
  if (!m) return null;
  const raw = String(m[1]).trim();
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
export function classifyMail(message: {id: string; subject: string; from: string; snippet: string; body?: string; date: string}, mailbox: string): MailCandidate[] {
  const subject = message.subject.slice(0, 220);
  const text = [subject, message.snippet, message.body || ""].join(" ").slice(0, 10000);
  const provider = providerFrom(message.from, subject);
  const s = text.toLowerCase();
  const answer: MailCandidate[] = [];
  const base = { message_id: message.id, source_subject: subject, source_from: message.from.slice(0, 200),
    source_date: message.date };
  const price = text.match(/(?:usd|aed|eur|gbp|inr|us\$|a\$|\$|€|£|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const currencyMatch = price && text.match(/(?:usd|aed|eur|gbp|inr|us\$|a\$|\$|€|£|₹)/i);
  const token = currencyMatch?.[0]?.toUpperCase();
  const currency = token === "$" || token === "US$" ? "USD" : token === "A$" ? "AUD" :
    token === "€" ? "EUR" : token === "£" ? "GBP" : token === "₹" ? "INR" : token || null;
  const amount = price ? Number(price[1].replace(/,/g, "")) : null;
  const renewalDate = dateFrom(text, /(?:renew(?:s|al)?|next billing(?: date)?|next payment(?: date)?|charged on|billing date)\s*(?:on|:|is)?\s*((?:20\d{2}-\d{2}-\d{2})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2}))/i);
  const trialEnd = dateFrom(text, /(?:trial ends?|free trial ends?|trial expires?)\s*(?:on|:|is)?\s*((?:20\d{2}-\d{2}-\d{2})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2}))/i);
  const billing_cycle = /\b(?:per month|monthly|\/month)\b/i.test(text) ? "monthly" :
    /\b(?:annually|yearly|per year|\/year)\b/i.test(text) ? "yearly" :
    /\b(?:weekly|per week)\b/i.test(text) ? "weekly" :
    /\b(?:daily|per day)\b/i.test(text) ? "daily" : "unknown";
  const account_email = mailbox.toLowerCase();
  if (/\b(?:subscription|renew(?:al|s|ed)?|billing|charged|payment|paid|invoice|receipt|trial|membership)\b/i.test(s)) {
    answer.push({ ...base, type: "subscription",
      confidence: Number(!!amount) * 0.12 + Number(!!renewalDate || !!trialEnd) * 0.18 + 0.53,
      extraction: { provider, product: provider, plan: "", price: Number.isFinite(amount) ? amount : null,
        currency: currency || "USD", billing_cycle, renewal_date: renewalDate, trial_end: trialEnd,
        account_email, status: "Unknown", source: "gmail", subject, auto_renew: null } });
  }
  if (/\b(?:welcome to|account (?:created|activated)|verify your (?:email|account)|confirm your (?:email|account)|registration (?:successful|confirmed)|sign(?:ed)? up)\b/i.test(s)) {
    answer.push({ ...base, type: "account", confidence: 0.69,
      extraction: { provider, email: account_email, account_email, status: "Needs confirmation", subject } });
  }
  if (/\b(?:coupon|promo code|promotion|discount|giveaway|limited.time offer|exclusive offer|redeem|special offer|free credits?)\b/i.test(s)) {
    const codeMatch = text.match(/(?:promo(?:tional)? code|coupon code|use code|redeem code|code)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,23})\b/i);
    answer.push({ ...base, type: "promo", confidence: codeMatch ? 0.77 : 0.52,
      extraction: { provider, code: codeMatch ? codeMatch[1].toUpperCase() : "", discount_text: subject,
        expiry_date: expiryFromText(text), account_email, source: "gmail", verified: false,
        source_url: null, subject } });
  }
  return answer;
}
export type GmailScanResult = { email: string; messages_scanned: number; candidates: MailCandidate[]; limited: boolean };
export async function scanConnectedGmail(options: { days?: number; limit?: number; onProgress?: (n: number) => void } = {}): Promise<GmailScanResult> {
  configure();
  const email = await getConnectedGmail();
  if (!email) throw Error("Connect a Google account first.");
  const days = Math.min(730, Math.max(1, options.days || 180));
  const limit = Math.min(200, Math.max(1, options.limit || 80));
  const query = SEARCH + " newer_than:" + days + "d";
  const ids: { id: string }[] = []; let pageToken: string | undefined;
  do {
    const response = await gmailRequest(urlQuery("/messages", {
      q: query, maxResults: Math.min(100, limit - ids.length),
      ...(pageToken ? { pageToken } : {}),
    }));
    ids.push(...(response.messages || []));
    pageToken = response.nextPageToken;
  } while (pageToken && ids.length < limit);
  const candidates: MailCandidate[] = [];
  let count = 0;
  for (const item of ids.slice(0, limit)) {
    const msg = await gmailRequest("/messages/" + encodeURIComponent(item.id) + "?format=full");
    const subject = header(msg.payload, "subject");
    const from = header(msg.payload, "from");
    const date = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();
    const body = extractPlain(msg.payload);
    candidates.push(...classifyMail({id:msg.id,subject,from,date,snippet:msg.snippet || "",body},email));
    count++;
    options.onProgress?.(count);
  }
  return { email, messages_scanned: count, candidates, limited: !!pageToken || ids.length >= limit };
}
