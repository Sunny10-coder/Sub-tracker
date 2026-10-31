/**
 * Privacy-first and idempotent Gmail -> SubMind reconciler.
 * Sensitive or ambiguous events are kept for later review, not falsely activated.
 * No Google tokens or full email contents are stored in the vault.
 */
import type { MailCandidate } from "./gmail-classifier";

export type MailDecision = "added" | "updated" | "duplicate" | "review" | "ignored";
export type MailApplyResult = {decision:MailDecision;type:string;reason:string;record_id?:string};
type Row = Record<string,any>;
export type MailCollections = {
 accounts:Row[];subscriptions:Row[];promo_codes:Row[];promo_findings:Row[];
 review_queue:Row[];mail_activity:Row[];
};
const key=(x:any)=>String(x??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const str=(x:any)=>typeof x==="string"?x.trim():"";
const email=(x:any)=>str(x).toLowerCase();
const date=(x:any):string|null=>{
 const raw=str(x);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
 const ms=Date.parse(raw+"T00:00:00Z");
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===raw?raw:null;
};
const money=(x:any):number|null=> x===undefined||x===null||x===""?null:
 Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<1000000?Number(x):null;
const aliases:Record<string,string>={
 openai:"chatgpt",chatgpt:"chatgpt",anthropic:"claude",claude:"claude",
 googleai:"gemini",googlegemini:"gemini",gemini:"gemini",
 github:"github",replit:"replit"
};
export const providerKey=(x:any)=>aliases[key(x)]||key(x);
export type MailEventType =
 "activated"|"payment"|"renewed"|"trial_started"|"trial_ending"|
 "renewal_notice"|"cancelled"|"expired"|"account_created"|"verification_pending"|"promotion"|"unknown";

export function eventFromSubject(subject:string,type:string):MailEventType {
 const s=String(subject||"").toLowerCase();
 if(type==="account")return /(?:verify|confirm)(?: your)? (?:email|account)|activate your account/i.test(s)
   ?"verification_pending":"account_created";
 if(type==="promo")return "promotion";
 if(type!=="subscription")return "unknown";
 if(/(?:your )?(?:subscription|plan|membership)\s+(?:has been |was |is now )?(?:cancelled|canceled)\b|cancellation confirmed/.test(s))return"cancelled";
 if(/(?:your )?(?:subscription|plan|membership)\s+(?:has |has been |is now )?(?:expired|ended)\b/.test(s))return"expired";
 if(/(?:free )?trial\s+(?:has )?(?:started|activated|begun)\b|trial activation confirmed/.test(s))return"trial_started";
 if(/(?:free )?trial\s+(?:ends?|expires?|ending|will end)\b/.test(s))return"trial_ending";
 if(/(?:subscription|plan|membership)\s+(?:has been |was |is now )?(?:activated|started|is active)\b|subscription confirmation|your subscription is active|plan activated/.test(s))return"activated";
 if(/(?:subscription|membership|plan)\s+(?:has )?(?:renewed|was renewed)\b|(?:renewal|automatic renewal)\s+(?:confirmed|successful|completed)\b/.test(s))return"renewed";
 if(/(?:payment|charge)\s+(?:successful|confirmed|received|completed)\b|receipt for your subscription/.test(s))return"payment";
 if(/(?:upcoming renewal|renewal reminder|renewal notice|next billing date|will renew|subscription expiring)/.test(s))return"renewal_notice";
 return"unknown";
}
function samePlan(a:Row,b:Row):boolean{
 const x=key(a.plan),y=key(b.plan);
 if(x&&y)return x===y;
 return true; // missing plan means eligible only if exactly one candidate
}
function planCandidates(v:MailCollections,provider:string,mailbox:string,plan:string):Row[]{
 return v.subscriptions.filter(s=>providerKey(s.provider)===providerKey(provider)
   && (!email(s.account_email)||email(s.account_email)===mailbox)
   && samePlan(s,{plan}));
}
function pushSource(record:Row,sourceKey:string,when:string) {
 const keys=new Set<string>(Array.isArray(record.mail_source_keys)?record.mail_source_keys:[]);
 keys.add(sourceKey);
 record.mail_source_keys=Array.from(keys).slice(-70);
 record.last_mail_event_at=when;
}
function queueReview(v:MailCollections,candidate:MailCandidate,mailbox:string,why:string,sourceKey:string,id:()=>string,now:string):MailApplyResult{
 const prior=v.review_queue.find(r=>str(r.source_key)===sourceKey);
 if(!prior){
  v.review_queue.unshift({...candidate,id:"review-"+id(),source_key:sourceKey,mailbox_email:mailbox,
   status:"needs_review",review_required:true,reason:why,created_at:now});
 }
 return {decision:prior?"duplicate":"review",type:candidate.type,reason:why,record_id:prior?.id};
}
function recordProcessed(v:MailCollections,candidate:MailCandidate,mailbox:string,sourceKey:string,
 decision:MailDecision,id:()=>string,now:string,recordId?:string){
 v.mail_activity.unshift({id:"activity-"+id(),source_key:sourceKey,action:"smart_sync",
  type:candidate.type,provider:candidate.extraction?.provider,mailbox_email:mailbox,
  decision,record_id:recordId,recorded_at:now});
 if(v.mail_activity.length>6000)v.mail_activity.length=6000;
}
export function applyMailCandidate(
 v:MailCollections,candidate:MailCandidate,mailboxRaw:string,now:string,
 id:()=>string,force=false
):MailApplyResult{
 const mailbox=email(mailboxRaw);
 const sourceKey=mailbox+":"+str(candidate.message_id)+":"+str(candidate.type);
 const info:Row=candidate.extraction||{};
 const provider=str(info.provider);
 const kind=str(candidate.type);
 const confidence=Number(candidate.confidence)||0;
 if(!mailbox.includes("@")||!str(candidate.message_id)||!provider||!["subscription","account","promo"].includes(kind))
  return{decision:"ignored",type:kind,reason:"Missing verified identity or provider"};
 if(!force&&Number(candidate.classifier_version)<2)return{decision:"ignored",type:kind,reason:"Obsolete parser output"};
 if(v.mail_activity.some(x=>str(x.source_key)===sourceKey&&["smart_sync","approved_v3"].includes(str(x.action))))
  return{decision:"duplicate",type:kind,reason:"Already processed source email"};
 const event:MailEventType=(info.event_type as MailEventType)||eventFromSubject(candidate.source_subject,kind);
 const when=str(candidate.source_date)||now;
 if(confidence<0.82&&!force) return queueReview(v,candidate,mailbox,"Low evidence confidence",sourceKey,id,now);
 if(kind==="account"){
  if(event==="verification_pending"&&!force)
   return queueReview(v,candidate,mailbox,"Email verification request does not confirm account activation",sourceKey,id,now);
  let acc=v.accounts.find(x=>providerKey(x.provider)===providerKey(provider)&&email(x.email)===mailbox);
  const result=acc?"updated":"added";
  if(!acc){acc={id:"acct-"+id(),provider,email:mailbox,status:"Created",source:"gmail",
   created_at:now,auto_detected:true};v.accounts.unshift(acc);}
  if(acc.status==="Needs confirmation"&&event==="account_created")acc.status="Created";
  pushSource(acc,sourceKey,when);
  recordProcessed(v,candidate,mailbox,sourceKey,result,id,now,acc.id);
  return{decision:result,type:kind,reason:"Registration matched existing account or created once",record_id:acc.id};
 }
 if(kind==="promo"){
  const code=str(info.code).toUpperCase();
  const expires=date(info.expiry_date);
  if(!code&&!force)
   return queueReview(v,candidate,mailbox,"Promotional email has no definite redemption code",sourceKey,id,now);
  if(!code){
   const title=str(info.discount_text)||"Offer from "+provider;
   let entry=v.promo_findings.find(x=>providerKey(x.provider)===providerKey(provider)&&key(x.title)===key(title));
   const result=entry?"updated":"added";
   if(!entry){entry={id:"finding-"+id(),provider,title,status:"unverified",verified:false,
    source:"gmail",created_at:now};v.promo_findings.unshift(entry);}
   if(expires)entry.expiry_date=expires;
   pushSource(entry,sourceKey,when);
   recordProcessed(v,candidate,mailbox,sourceKey,result,id,now,entry.id);
   return{decision:result,type:kind,reason:"Unverified offer saved without an invented coupon",record_id:entry.id};
  }
  let promo=v.promo_codes.find(x=>providerKey(x.provider)===providerKey(provider)&&key(x.code)===key(code));
  const result=promo?"updated":"added";
  if(!promo){promo={id:"promo-"+id(),provider,code,verified:false,source:"gmail",
   account_email:mailbox,created_at:now};v.promo_codes.unshift(promo);}
  if(expires)promo.expiry_date=expires;
  if(info.discount_text&&!promo.discount_text)promo.discount_text=str(info.discount_text).slice(0,220);
  pushSource(promo,sourceKey,when);
  recordProcessed(v,candidate,mailbox,sourceKey,result,id,now,promo.id);
  return{decision:result,type:kind,reason:"Promo code matched across Gmail and existing vault",record_id:promo.id};
 }
 const possibilities=planCandidates(v,provider,mailbox,str(info.plan));
 const exact=possibilities.filter(s=>key(s.plan)&&key(s.plan)===key(info.plan));
 // An unknown plan matches only a single record; otherwise ambiguous.
 const matches=exact.length?exact:possibilities;
 if(matches.length>1&&!force)
  return queueReview(v,candidate,mailbox,"Multiple possible plans for this service; avoid duplicating or overwriting",sourceKey,id,now);
 let sub=matches.length===1?matches[0]:undefined;
 // Do not create a new 'subscription' just because a reminder arrived.
 const confirmed=["activated","renewed","payment","trial_started","cancelled","expired"].includes(event);
 const paid=(info.payment_confirmed===true)&&(money(info.price)!==null)
  && !!str(info.currency)&&event==="payment";
 const activation=["activated","renewed","trial_started","cancelled","expired"].includes(event)||paid;
 if(!activation&&!force){
  // A renewal reminder can safely update a known plan's next date, but not activate it.
  if(!sub||!date(info.renewal_date))
   return queueReview(v,candidate,mailbox,"Renewal/expiry notice without confirmed activation or payment",sourceKey,id,now);
 }
 if(event==="payment"&&!paid&&!force)
  return queueReview(v,candidate,mailbox,"Payment email lacks verifiable paid amount and recurring-plan evidence",sourceKey,id,now);
 if(!sub&& !confirmed && !force)
  return queueReview(v,candidate,mailbox,"No matching subscription to update",sourceKey,id,now);
 const incomingPrice=money(info.price);
 const incomingCurrency=str(info.currency).toUpperCase();
 if(sub && incomingPrice!==null && sub.price!==null && sub.price!==undefined && !force
   && incomingCurrency && str(sub.currency)===incomingCurrency
   && Math.abs(Number(sub.price)-incomingPrice)>Math.max(1,Number(sub.price)*0.05))
  return queueReview(v,candidate,mailbox,"Price differs from existing plan; retain original and review when convenient",sourceKey,id,now);
 if(sub && email(sub.account_email)&&email(sub.account_email)!==mailbox)
  return queueReview(v,candidate,mailbox,"Plan belongs to a different Gmail address",sourceKey,id,now);
 const result:MailDecision=sub?"updated":"added";
 if(!sub){
  sub={id:"sub-"+id(),provider,plan:str(info.plan),product:str(info.product)||provider,
   status:"Unknown",source:"gmail",account_email:mailbox,price:null,currency:incomingCurrency||"AED",
   billing_cycle:str(info.billing_cycle)||"unknown",created_at:now,auto_detected:true,
   review_required:false};
  v.subscriptions.unshift(sub);
 }
 if(!email(sub.account_email))sub.account_email=mailbox;
 if(!sub.plan&&str(info.plan))sub.plan=str(info.plan);
 const renewal=date(info.renewal_date),trialEnd=date(info.trial_end),
       expiry=date(info.expiry_date)||date(info.access_end);
 if(renewal && (!date(sub.renewal_date)||renewal>=String(sub.renewal_date)))sub.renewal_date=renewal;
 if(trialEnd && (!date(sub.trial_end)||trialEnd>=String(sub.trial_end)))sub.trial_end=trialEnd;
 if(expiry) {sub.expiry_date=expiry;sub.access_end=expiry;}
 if(incomingPrice!==null && (sub.price===null||sub.price===undefined||paid||force)) sub.price=incomingPrice;
 if(incomingCurrency&&(sub.currency==="AED"&&!str(info.currency)||!str(sub.currency)||paid||force))sub.currency=incomingCurrency;
 if(str(info.billing_cycle)&&str(info.billing_cycle)!=="unknown"&&(!str(sub.billing_cycle)||sub.billing_cycle==="unknown"||paid||force))
  sub.billing_cycle=str(info.billing_cycle);
 if(event==="activated"||event==="renewed"||paid)sub.status="Active";
 else if(event==="trial_started")sub.status="Trial";
 else if(event==="expired")sub.status="Expired";
 else if(event==="cancelled")sub.status="Cancelled";
 else if(force && ["Active","Trial","Expired","Cancelled","Paused","Unknown"].includes(str(info.status)))
  sub.status=str(info.status);
 if(paid){
  sub.last_paid_at=date(str(when).slice(0,10))||now.slice(0,10);
  sub.last_payment_amount=incomingPrice;
  sub.last_payment_currency=incomingCurrency;
  sub.payment_confirmed=true;
 }
 sub.last_event_type=event;
 sub.auto_detected=sub.source==="gmail"?true:sub.auto_detected;
 sub.review_required=false;
 pushSource(sub,sourceKey,when);
 let account=v.accounts.find(x=>providerKey(x.provider)===providerKey(provider)&&email(x.email)===mailbox);
 if(!account){
  account={id:"acct-"+id(),provider,email:mailbox,status:"Discovered",source:"gmail",
   created_at:now,auto_detected:true};
  v.accounts.unshift(account);
 }
 recordProcessed(v,candidate,mailbox,sourceKey,result,id,now,sub.id);
 return{decision:result,type:kind,reason:result==="added"?"Confirmed event created subscription":"Existing app record updated instead of duplicated",record_id:sub.id};
}
