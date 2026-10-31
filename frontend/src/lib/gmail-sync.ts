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
import { buildGmailQueries, classifyMail, type MailCandidate, type MailType } from "@/src/lib/gmail-classifier";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
let configured = false;
function configure() {
  if (Platform.OS !== "android") throw Error("Gmail OAuth currently requires the Android APK.");
  if (!configured) { GoogleSignin.configure({ scopes: [GMAIL_SCOPE], offlineAccess: false }); configured = true; }
}
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
export type GmailScanResult = { email: string; messages_scanned: number; candidates: MailCandidate[]; limited: boolean; rejected: number; search_matches: number };
export async function scanConnectedGmail(options: {
 days?: number; limit?: number; onProgress?: (n:number)=>void; kinds?:MailType[];
}={}):Promise<GmailScanResult>{
 configure();
 const email=await getConnectedGmail();
 if(!email)throw Error("Connect a Google account first.");
 const limit=Math.min(300,Math.max(1,options.limit||120));
 const queries=buildGmailQueries(options.days||180,options.kinds);
 if(!queries.length)throw Error("Select at least one Gmail category to scan.");
 const seen=new Map<string,{id:string}>();
 let limited=false;
 for(const {q} of queries){
   let pageToken:string|undefined;
   do{
     if(seen.size>=limit){limited=true;break;}
     const response=await gmailRequest(urlQuery("/messages",{
       q,maxResults:Math.min(100,limit-seen.size),...(pageToken?{pageToken}:{})
     }));
     for(const msg of response.messages||[])if(msg.id&&!seen.has(msg.id))seen.set(msg.id,msg);
     pageToken=response.nextPageToken;
   }while(pageToken&&seen.size<limit);
   if(pageToken)limited=true;
 }
 const candidates:MailCandidate[]=[];
 let scanned=0,rejected=0;
 for(const item of seen.values()){
   const msg=await gmailRequest("/messages/"+encodeURIComponent(item.id)+"?format=full");
   const subject=header(msg.payload,"subject"),from=header(msg.payload,"from");
   const date=msg.internalDate?new Date(Number(msg.internalDate)).toISOString():new Date().toISOString();
   const matches=classifyMail({id:msg.id,subject,from,date,snippet:msg.snippet||"",
     body:extractPlain(msg.payload),labels:msg.labelIds||[]},email);
   if(matches.length)candidates.push(...matches);else rejected++;
   scanned++;options.onProgress?.(scanned);
 }
 return {email,messages_scanned:scanned,candidates,limited,rejected,search_matches:seen.size};
}
