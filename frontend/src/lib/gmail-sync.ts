/**
 * Android-only, consent-based Gmail reader. All message content is classified
 * on-device; neither email bodies nor access tokens are stored in the vault.
 *
 * Google OAuth setup: Android client ID for package com.submind.metro and
 * SHA-1 fingerprint of the signing certificate; Gmail API enabled; user added
 * to testing audience (or production verification when applicable).
 */
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { buildGmailQueries, classifyMail, type MailCandidate, type MailType } from "@/src/lib/gmail-classifier";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const REGISTERED_MAILBOXES="submind.gmail.registered-mailboxes.v1";
let activeGoogleAccount:string|null=null;
function configure(accountName?:string){
  if(Platform.OS!=="android")throw Error("Gmail OAuth requires the Android APK.");
  // Google SignIn is a single active session. Android can prioritise a
  // registered device account; we must verify the actual email before reading.
  GoogleSignin.configure({scopes:[GMAIL_SCOPE],offlineAccess:false,
    ...(accountName?{accountName}:{})});
}
const normal=(v:any)=>String(v||"").trim().toLowerCase();
export async function getRegisteredMailboxes():Promise<string[]>{
  const raw=await storage.getItem(REGISTERED_MAILBOXES,"[]");
  try{
    const list=JSON.parse(String(raw||"[]"));
    return Array.isArray(list)?Array.from(new Set(list.map(normal))).filter((e:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0,3):[];
  }catch{return [];}
}
export async function registerMailbox(email:string):Promise<string[]>{
  const value=normal(email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error("Google returned an invalid Gmail identity.");
  const previous=await getRegisteredMailboxes();
  if(previous.includes(value))return previous;
  if(previous.length>=3)throw Error("SubMind allows up to three registered Gmail accounts. Remove one first.");
  const next=[...previous,value];
  if(!await storage.setItem(REGISTERED_MAILBOXES,JSON.stringify(next)))throw Error("Could not save Gmail account list.");
  return next;
}
export async function forgetMailbox(email:string):Promise<string[]>{
  const next=(await getRegisteredMailboxes()).filter(x=>x!==normal(email));
  if(!await storage.setItem(REGISTERED_MAILBOXES,JSON.stringify(next)))throw Error("Could not update Gmail account list");
  return next;
}
export async function getConnectedGmail():Promise<string|null>{
  configure(activeGoogleAccount||undefined);
  let user=GoogleSignin.getCurrentUser();
  if(!user&&GoogleSignin.hasPreviousSignIn()){
    try {
      const restored=await GoogleSignin.signInSilently();
      if(restored.type==="success")user=restored.data;
    }catch{return null;}
  }
  const address=normal(user?.user?.email);
  if(address)activeGoogleAccount=address;
  return address||null;
}
export async function connectGmail(forceChooser=false):Promise<string>{
  configure();
  if(forceChooser){await GoogleSignin.signOut();activeGoogleAccount=null;}
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog:true});
  const result=await GoogleSignin.signIn({});
  if(!isSuccessResponse(result))throw Error("Google sign-in was cancelled or failed.");
  const address=normal(result.data.user.email);
  if(!address)throw Error("Google sign-in returned no email address.");
  const registered=await getRegisteredMailboxes();
  if(registered.length>=3&&!registered.includes(address)){
    throw Error("Three accounts are already registered. Remove one before connecting another.");
  }
  activeGoogleAccount=address;
  await registerMailbox(address);
  return address;
}
/**
 * Attempts to silently select a previously authorised Android Google account.
 * Does NOT open interactive consent or read the wrong user's mailbox.
 * Returns null if Google Play Services cannot silently restore this identity.
 */
export async function selectRegisteredMailbox(email:string):Promise<string|null>{
  const target=normal(email);
  if(!(await getRegisteredMailboxes()).includes(target))return null;
  configure(target);
  try{
    const result=await GoogleSignin.signInSilently();
    if(result.type!=="success"||normal(result.data.user.email)!==target)return null;
    activeGoogleAccount=target;
    const response=await gmailRequest("/profile");
    if(normal(response.emailAddress)!==target)return null;
    return target;
  }catch{return null;}
}
export async function disconnectGmail(revoke=false):Promise<void>{
  configure();
  if(revoke)await GoogleSignin.revokeAccess();
  else await GoogleSignin.signOut();
  activeGoogleAccount=null;
}
function urlQuery(base: string, params: Record<string, string | number>): string {
  return base + "?" + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
}
async function gmailRequest(path: string, allowRefresh = true): Promise<any> {
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
export type GmailScanResult={email:string;messages_scanned:number;candidates:MailCandidate[];
  limited:boolean;rejected:number;search_matches:number;scan_started_at:string};
export function currentGoogleMailbox(){return activeGoogleAccount;}

export async function scanConnectedGmail(options:{
  days?:number;limit?:number;onProgress?:(n:number)=>void;kinds?:MailType[];
  expectedEmail?:string;
}={}):Promise<GmailScanResult>{
  const email=await getConnectedGmail();
  if(!email)throw Error("Connect Google account first.");
  if(options.expectedEmail&&normal(options.expectedEmail)!==email)
    throw Error("Gmail mailbox does not match requested account. No messages were read.");
  const scan_started_at=new Date().toISOString();
  // Trust Google's actual mailbox identity, NOT just the Google sign-in email.
  const profile=await gmailRequest("/profile");
  if(normal(profile.emailAddress)!==email)
    throw Error("Gmail profile mismatch. Account switching was not completed.");
  const limit=Math.min(250,Math.max(1,options.limit||120));
  const queries=buildGmailQueries(options.days??7,options.kinds);
  if(!queries.length)throw Error("Select at least one category.");
  const seen=new Map<string,{id:string}>();
  let limited=false;
  // Reserve query capacity per category so newsletters or receipt volume
  // cannot prevent account or promo matches from ever being inspected.
  const perCategory=Math.max(10,Math.floor(limit/queries.length));
  for(const {q} of queries){
    let pageToken:string|undefined,categoryChecked=0;
    do{
      if(categoryChecked>=perCategory){limited=true;break;}
      const response=await gmailRequest(urlQuery("/messages",{
        q,maxResults:Math.min(100,perCategory-categoryChecked),...(pageToken?{pageToken}:{})
      }));
      const messages=response.messages||[];
      categoryChecked+=messages.length;
      for(const msg of messages)if(msg.id&&!seen.has(msg.id))seen.set(msg.id,msg);
      pageToken=response.nextPageToken;
      if(pageToken&&categoryChecked>=perCategory)limited=true;
    }while(pageToken&&categoryChecked<perCategory);
  }
  const candidates:MailCandidate[]=[];
  let scanned=0,rejected=0;
  for(const item of seen.values()){
    const msg=await gmailRequest("/messages/"+encodeURIComponent(item.id)+"?format=full");
    const subject=header(msg.payload,"subject"),from=header(msg.payload,"from");
    const date=msg.internalDate?new Date(Number(msg.internalDate)).toISOString():scan_started_at;
    const matches=classifyMail({id:msg.id,subject,from,date,snippet:msg.snippet||"",
      body:extractPlain(msg.payload),labels:msg.labelIds||[]},email);
    if(matches.length)candidates.push(...matches);
    else rejected++;
    scanned++;options.onProgress?.(scanned);
  }
  return {email,messages_scanned:scanned,candidates,limited,rejected,
    search_matches:seen.size,scan_started_at};
}
