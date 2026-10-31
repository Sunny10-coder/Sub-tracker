/** Local-only SubMind data engine. Never sends private imports to a server.
 * A separate FastAPI URL remains optional for advanced AI and web-search services.
 * Android stores this JSON in app-private storage; this is NOT an encrypted backup.
 */
import { storage } from "@/src/utils/storage";
import { classifyLink, canonicalUrl, graphFromVault, inferCategory, inferTags } from "@/src/lib/vault-intelligence";
import { MIN_CONFIDENCE, CLASSIFIER_VERSION } from "@/src/lib/gmail-classifier";
import { applyMailCandidate } from "@/src/lib/mail-reconciliation";
import type { MailCandidate } from "@/src/lib/gmail-classifier";

export const LOCAL_VAULT_KEY = "submind.private.import.v1";
type Dict = Record<string, any>;
type Vault = { schema: string; subscriptions: Dict[]; accounts: Dict[]; watchlist: Dict[];
  promo_codes: Dict[]; mail_activity: Dict[]; review_queue: Dict[]; prompts: Dict[]; mailboxes: Dict[]; promo_sources: Dict[]; promo_findings: Dict[];
  benefits: Dict[]; links: Dict[]; reminders: Dict[]; price_snapshots: Dict[]; settings: Dict; imported_at?: string };
const EMPTY:Vault={schema:"submind-import-v1",subscriptions:[],accounts:[],watchlist:[],
 promo_codes:[],mail_activity:[],review_queue:[],prompts:[],mailboxes:[],promo_sources:[],promo_findings:[],benefits:[],links:[],reminders:[],price_snapshots:[],
 settings:{currency:"AED",ai_enabled:true,price_monitoring:false,auto_add_threshold:0.95}};

function lower(s:any):string{return String(s||"").toLowerCase()}
function normalized(s:any):string{return lower(s).replace(/[^a-z0-9]/g,"")}
function string(s:any):string{return typeof s==="string"?s.trim():""}
function asArray(x:any):Dict[]{return Array.isArray(x)?x.filter(v=>v&&typeof v==="object"):[]}
function copy(v:Vault):Vault{
 const merged={...EMPTY,...v,settings:{...EMPTY.settings,...v.settings}};
 for(const k of ["subscriptions","accounts","watchlist","promo_codes","mail_activity","review_queue","prompts","mailboxes","promo_sources","promo_findings","benefits","links","reminders","price_snapshots"] as const) {
  (merged as any)[k]=asArray((v as any)[k]);
 }
 return merged;
}
function ident(s:Dict):string{return [normalized(s.provider||s.Provider||s.Service),
 normalized(s.product||s.Product),normalized(s.plan||s.Plan),
 normalized(s.account_email||s.email||s["Stated account email"]),
 string(s.mailbox_email||s.Mailbox).toLowerCase(),string(s.renewal_date||s["Renewal / expiry"])].join("|")}
function pickVal(s:Dict,k:string,other?:string):any{return s[k] ?? (other?s[other]:undefined)}
function normalizeSub(s:Dict):Dict{
 const status=string(s.status||s.Status);
 const allowed=["Active","Trial","Paused","Cancelled","Expired","Unknown"];
 return {...s,provider:pickVal(s,"provider","Provider")||"Unknown",
  plan:pickVal(s,"plan","Plan")||"",product:pickVal(s,"product","Product")||s.provider,
  status:allowed.includes(status)?status:"Unknown",
  account_email:string(s.account_email).toLowerCase(),
  price:s.price===null || s.price===undefined || s.price===""?null:Number(s.price),
  currency:string(s.currency||s.Currency||"AED").toUpperCase(),
  billing_cycle:string(s.billing_cycle||s["Billing cycle"]||"unknown").toLowerCase(),
  renewal_date:s.renewal_date||s["Renewal / expiry"]||null,
  category:s.category||s.Category||"Other",
  id:string(s.id)||"loc-"+normalized(ident(s))};
}
function normalizeAccount(a:Dict):Dict{return {...a,id:a.id||"locacct-"+normalized(a.provider+"|"+a.email),
 provider:a.provider||a.Provider||"Unknown",email:string(a.email).toLowerCase(),status:a.status||"Needs confirmation"}}
function normalizeWatch(a:Dict):Dict{return {...a,id:a.id||"watch-"+normalized(a.Provider+"|"+a.Plan),
 provider:a.provider||a.Provider||"Unknown",plan:a.plan||a.Plan||"",
 price:a.price??a.Price??null,currency:a.currency||a.Currency||"AED",
 billing_cycle:a.billing_cycle||a["Billing cycle"]||"unknown",status:a.status||a.Status||"Watching"}}
function normalizePromo(a:Dict):Dict{return {...a,id:a.id||"promo-"+normalized(a.Service+"|"+a.Code),
 provider:a.provider||a.Service||"Unknown",code:a.code||a.Code||"",
 discount_text:a.discount_text||a.Discount||"",verified:a.verified===true,source:a.source||a.Source||"Excel"}}
function mergeById(current:Dict[],fresh:Dict[]):Dict[]{
 const existing=new Map(current.map(x=>[String(x.id),x]));
 for(const x of fresh){const old=existing.get(String(x.id));existing.set(String(x.id),old?{...x,...old}:x)}
 return Array.from(existing.values());
}
let writeQueue:Promise<any>=Promise.resolve();
function mutate<T>(fn:()=>Promise<T>):Promise<T>{
 const result=writeQueue.then(fn,fn); writeQueue=result.catch(()=>undefined);return result;
}
export async function getVault():Promise<Vault>{
 const raw=await storage.getItem(LOCAL_VAULT_KEY,"");
 if(typeof raw!=="string"||!raw)return copy(EMPTY);
 try{const parsed=JSON.parse(raw);return parsed && typeof parsed==="object" ? copy(parsed):copy(EMPTY)}catch{return copy(EMPTY)}
}
async function save(v:Vault):Promise<void>{
 if(!await storage.setItem(LOCAL_VAULT_KEY,JSON.stringify(v)))throw Error("Could not save data in phone storage");
}
export async function importPrivateBundle(data:any):Promise<{added:Dict;duplicates:Dict;review:number}>{
 if(!data || data.schema!=="submind-import-v1" || !Array.isArray(data.subscriptions) ||
    !Array.isArray(data.accounts))throw Error("Not a valid SubMind private import file");
 if(data.subscriptions.length>10000||data.accounts.length>10000)throw Error("Import exceeds size limit");
 return mutate(async()=>{
  const vault=await getVault();
  const inbound:{[key:string]:Dict[]}={
   subscriptions:asArray(data.subscriptions).map(normalizeSub),
   accounts:asArray(data.accounts).map(normalizeAccount),
   watchlist:asArray(data.watchlist).map(normalizeWatch),
   promo_codes:asArray(data.promo_codes).map(normalizePromo),
   review_queue:asArray(data.review_queue).map((a,i)=>({...a,id:a.id||"review-"+normalized([a.source_row,a.provider,a.field,a.reason,i].join("|"))})),
   benefits:asArray(data.benefits).map((b,i)=>({...b,id:b.id||"benefit-import-"+i+"-"+normalized(b.provider||b.name)})),
   mail_activity:asArray(data.mail_activity).map((m,i)=>({...m,id:m.id||"activity-import-"+i+"-"+normalized(m.source_key)})),
   prompts:asArray(data.prompts).map((p,i)=>({...p,id:p.id||"prompt-import-"+i+"-"+normalized(p.title)})),
   links:asArray(data.links).map((l,i)=>({...l,id:l.id||"link-import-"+i+"-"+normalized(l.url)})),
   reminders:asArray(data.reminders).map((r,i)=>({...r,id:r.id||"rem-import-"+i})),
   mailboxes:asArray(data.mailboxes).map((m,i)=>({...m,id:m.id||"mailbox-"+normalized(m.email)||"mailbox-"+i})),
   promo_sources:asArray(data.promo_sources).map((s,i)=>({...s,id:s.id||"source-import-"+i+"-"+normalized(s.provider)})),
   promo_findings:asArray(data.promo_findings).map((f,i)=>({...f,id:f.id||"finding-import-"+i+"-"+normalized(f.source_url)}))
  };
  const added:Dict={},duplicates:Dict={};
  for(const k of Object.keys(inbound)){
    const existing=(vault as any)[k]||[];const array=inbound[k];
    const existingKeys=new Set(existing.map((x:Dict)=>String(x.id)));
    added[k]=array.filter(x=>!existingKeys.has(String(x.id))).length;
    duplicates[k]=array.length-added[k];
    (vault as any)[k]=mergeById(existing,array);
  }
  if(data.settings&&typeof data.settings==="object"&&!Array.isArray(data.settings)){
    for(const k of ["currency","ai_enabled","keep_screenshots","price_monitoring","auto_add_threshold"]){
      if(Object.prototype.hasOwnProperty.call(data.settings,k))vault.settings[k]=data.settings[k];
    }
  }
  vault.imported_at=new Date().toISOString();await save(vault);
  return {added,duplicates,review:vault.review_queue.length};
 });
}
function isoDay(d:any):number|null{
 if(typeof d!=="string"||!/^20\d{2}-\d\d-\d\d/.test(d))return null;
 const v=Date.parse(d.slice(0,10)+"T00:00:00Z");
 return Number.isFinite(v)?v:null;
}
function futureDays(d:any):number|null{const t=isoDay(d);if(t===null)return null;
 const now=new Date();const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
 return Math.round((t-today)/86400000)}
function dueDate(s:Dict):string|null{
 if(s.status==="Cancelled"||s.auto_renew===false)return s.access_end||s.trial_end||null;
 return s.status==="Trial"?(s.trial_end||s.renewal_date||s.access_end||null):(s.renewal_date||s.access_end||s.expiry_date||null);
}
function charge(s:Dict):number|null{
 if(!["Active","Trial"].includes(s.status)||s.auto_renew===false||s.review_required===true)return null;
 if(s.status==="Trial"&&s.trial_paid!==true)return null;
 if(s.source==="gmail"&&s.auto_detected===true&&s.payment_confirmed!==true)return null;
 if(s.price===null||s.price===undefined||!Number.isFinite(Number(s.price)))return null;
 const cost=Number(s.price);if(cost<0)return null;
 switch(String(s.billing_cycle||"").toLowerCase()){
  case "monthly":return cost;case "yearly":return cost/12;case "weekly":return cost*52/12;case "daily":return cost*365/12;default:return null;
 }
}
export function localInsights(v:Vault):Dict{
 const subs=v.subscriptions;const active=subs.filter(s=>["Active","Trial"].includes(s.status));
 const monthly:Record<string,number>={};const cats:Record<string,number>={};const catNames:Record<string,string[]>={};
 const upcoming:Dict[]=[];const trials:Dict[]=[];
 for(const s of active){
  const cost=charge(s);const cur=String(s.currency||"AED").toUpperCase();
  if(cost!==null){monthly[cur]=(monthly[cur]||0)+cost;const c=String(s.category||"Other");
   const name=cur+" / "+c;cats[name]=(cats[name]||0)+cost;(catNames[name]??=[]).push(s.provider);}
  const delta=futureDays(dueDate(s));
  if(delta!==null&&delta>=0&&delta<=30){
   const event={id:s.id,provider:s.provider,date:dueDate(s),price:s.price,currency:s.currency,account_email:s.account_email};
   if(s.status==="Trial")trials.push(event);
   else upcoming.push(event);
  }
 }
 upcoming.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 trials.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const cur=v.settings.currency||"AED";const current=Math.round((monthly[cur]||0)*100)/100;
 return {currency:cur,monthly_by_currency:Object.fromEntries(Object.entries(monthly).map(([k,n])=>[k,Math.round(n*100)/100])),
  monthly_spend:current,yearly_spend:Math.round(current*12*100)/100,
  active_count:active.length,total_count:subs.length,renewals_30d:upcoming,trials_ending:trials,
  category_breakdown:Object.entries(cats).map(([category,amount])=>({category,amount:Math.round(amount*100)/100})).sort((a,b)=>b.amount-a.amount),
  top_category:Object.entries(cats).sort((a,b)=>b[1]-a[1])[0]?.[0]||null,
  overlaps:Object.entries(catNames).filter(([,names])=>names.length>1).map(([category,providers])=>({category,providers})),
  price_increases:[],watchlist_count:v.watchlist.length};
}
function jsonBody(opts?:RequestInit):Dict{try{return JSON.parse(String(opts?.body||"{}"))}catch{return {}}}
const nowIso=()=>new Date().toISOString();
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);
function notFound():never{throw Error("404: Record not found")}
export async function localRequest<T>(path:string,opts?:RequestInit):Promise<T>{
 const method=String(opts?.method||"GET").toUpperCase();const [route,qs]=path.split("?");
 const params=new URLSearchParams(qs||"");const data=jsonBody(opts);
 if(method!=="GET")return mutate(async()=>{const v=await getVault();let result:any=null;
   const collection=(name:keyof Vault)=>((v[name] as Dict[])||[]);
   if(route==="/subscriptions/check-duplicate"&&method==="POST"){
      const existing=v.subscriptions.find(x=>normalized(x.provider)===normalized(data.provider)
        &&normalized(x.plan)===normalized(data.plan)&&string(x.account_email)===string(data.account_email));
      result={duplicate:Boolean(existing),existing_id:existing?.id||null,subscription:existing||null};
   }else if(route==="/subscriptions"&&method==="POST"){
      const rec=normalizeSub({...data,id:"sub-"+uid(),created_at:nowIso()});
      if(v.subscriptions.some(x=>normalized(x.provider)===normalized(rec.provider)
       &&normalized(x.plan)===normalized(rec.plan)&&string(x.account_email)&&string(x.account_email)===string(rec.account_email)))
       throw Error("409: That plan already exists for the same sign-in email");
      v.subscriptions.unshift(rec);result=rec;
   }else if(route.startsWith("/subscriptions/")&&method==="PATCH"){
      const id=route.split("/")[2];const x=v.subscriptions.find(a=>a.id===id);if(!x)notFound();
      Object.assign(x,normalizeSub({...x,...data}));result=x;
   }else if(route.startsWith("/subscriptions/")&&method==="DELETE"){
      const id=route.split("/")[2];v.subscriptions=v.subscriptions.filter(x=>x.id!==id);result={ok:true};
   }else if(route==="/accounts"&&method==="POST"){
      const rec=normalizeAccount({...data,id:"acct-"+uid()});
      if(!rec.provider||rec.provider==="Unknown")throw Error("Account provider is required");
      if(v.accounts.some(a=>normalized(a.provider)===normalized(rec.provider)&&string(a.email).toLowerCase()===string(rec.email).toLowerCase()))throw Error("409: This provider and sign-in email are already saved");
      v.accounts.unshift(rec);result=rec;
   }else if(route.startsWith("/accounts/")&&method==="PATCH"){
      const id=route.split("/")[2];const x=v.accounts.find(a=>a.id===id);if(!x)notFound();
      Object.assign(x,data);result=x;
   }else if(route.startsWith("/accounts/")&&method==="DELETE"){
      v.accounts=v.accounts.filter(a=>a.id!==route.split("/")[2]);result={ok:true};
   }else if(route.startsWith("/subscriptions/")&&route.endsWith("/payment")&&method==="POST"){
      const id=route.split("/")[2],record=v.subscriptions.find(x=>x.id===id);
      if(!record)notFound();
      const amount=data.amount===undefined||data.amount===null?null:Number(data.amount);
      const date=string(data.date),currency=string(data.currency||record.currency);
      if(amount===null||!Number.isFinite(amount)||amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!currency)
        throw Error("Confirm an amount, currency and date before recording a payment.");
      record.payments=Array.isArray(record.payments)?record.payments:[];
      const prior=record.payments.find((p:Dict)=>p.amount===amount&&p.date===date&&p.currency===currency);
      if(prior){result={duplicate:true,payment:prior};}
      else{const payment={id:"pay-"+uid(),amount,date,currency,source:"manual-confirmed",created_at:nowIso()};
        record.payments.unshift(payment);result={duplicate:false,payment};}
   }else if(route==="/reminders"&&method==="POST"){
      const rec={...data,id:"rem-"+uid(),completed:false,created_at:nowIso()};v.reminders.unshift(rec);result=rec;
   }else if(route.startsWith("/reminders/")){
      const id=route.split("/")[2];const x=v.reminders.find(a=>a.id===id);
      if(method==="DELETE"){v.reminders=v.reminders.filter(a=>a.id!==id);result={ok:true}}
      else {if(!x)notFound();Object.assign(x,data);result=x;}
   }else if(route==="/watchlist"&&method==="POST"){
      const rec=normalizeWatch({...data,id:"watch-"+uid()});v.watchlist.unshift(rec);result=rec;
   }else if(route.startsWith("/watchlist/")&&route.endsWith("/convert")&&method==="POST"){
      const id=route.split("/")[2];const plan=v.watchlist.find(x=>x.id===id);
      if(!plan)notFound();
      const existing=v.subscriptions.find(s=>normalized(s.provider)===normalized(plan.provider)&&normalized(s.plan)===normalized(plan.plan)
        &&string(s.account_email)===string(plan.account_email||""));
      if(existing)result={duplicate:true,subscription_id:existing.id,subscription:existing};
      else{
        const sub=normalizeSub({...plan,id:"sub-"+uid(),status:"Unknown",review_required:true,
          source:"watchlist",created_at:nowIso(),account_email:string(plan.account_email),billing_cycle:plan.billing_cycle||"unknown"});
        v.subscriptions.unshift(sub);plan.status="Moved to plans";
        result={duplicate:false,subscription_id:sub.id,subscription:sub};
      }
   }else if(route.startsWith("/watchlist/")&&method==="DELETE"){
      v.watchlist=v.watchlist.filter(a=>a.id!==route.split("/")[2]);result={ok:true};
   }else if(route==="/deals/codes"&&method==="POST"){
      const rec=normalizePromo({...data,id:"promo-"+uid()});
      const existing=v.promo_codes.find(a=>normalized(a.provider)===normalized(rec.provider)
       &&normalized(a.code)===normalized(rec.code)&&string(a.account_email)===string(rec.account_email));
      if(existing)return {duplicate:true,item:existing} as T;
      v.promo_codes.unshift(rec);result={duplicate:false,item:rec};
   }else if(route==="/prompts"&&method==="POST"){
      const title=string(data.title);const body=string(data.text);
      if(!title||!body)throw Error("Prompt title and text are required");
      const rec={id:"prompt-"+uid(),title,text:body,category:inferCategory(title+" "+body),tags:inferTags(title+" "+body,Array.isArray(data.tags)?data.tags.filter((x:any)=>typeof x==="string").map((x:string)=>x.trim()):[]),related_ids:[],created_at:nowIso(),...data};
      v.prompts.unshift(rec);result=rec;
   }else if(route.startsWith("/prompts/")&&method==="PATCH"){
      const rec=v.prompts.find(x=>x.id===route.split("/")[2]);if(!rec)notFound();
      Object.assign(rec,data,{updated_at:nowIso()});result=rec;
   }else if(route.startsWith("/prompts/")&&method==="DELETE"){
      v.prompts=v.prompts.filter(x=>x.id!==route.split("/")[2]);result={ok:true};
   }else if(route==="/mail/smart-sync"&&method==="POST"){
      const mailbox=string(data.mailbox).toLowerCase();
      const candidates=asArray(data.records);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)||candidates.length>400)
        throw Error("Invalid mailbox or too many email findings");
      const summary={added:0,updated:0,duplicate:0,review:0,ignored:0};
      const now=nowIso();
      for(const item of candidates){
        const decision=applyMailCandidate(v,item as MailCandidate,mailbox,now,uid);
        summary[decision.decision]++;
      }
      const current=v.mailboxes.find(x=>string(x.email).toLowerCase()===mailbox);
      if(current){
        current.last_synced_at=now;
        current.last_scan_count=Number(data.messages_scanned)||candidates.length;
        current.last_scan_days=Number(data.days)||7;
        current.last_scan_limited=data.limited===true;
      }else v.mailboxes.push({
        id:"mailbox-"+normalized(mailbox),email:mailbox,last_synced_at:now,
        last_scan_count:Number(data.messages_scanned)||candidates.length,
        last_scan_days:Number(data.days)||7,last_scan_limited:data.limited===true
      });
      result={...summary,mailbox,review_pending:v.review_queue.filter(x=>x.status==="needs_review").length};
   }else if(route==="/mail/auto-sync"&&method==="POST"){
      const mailbox=string(data.mailbox).toLowerCase();
      const rows=asArray(data.records);
      if(!mailbox.includes("@")||rows.length>300)throw Error("Invalid mailbox or oversized scan");
      let accountsAdded=0,subscriptionsAdded=0,promosAdded=0,updated=0,ignored=0;
      const previouslySeen=new Set(v.mail_activity.filter(x=>x.action==="auto_sync").map(x=>string(x.source_key)));
      const supportedDate=(x:any)=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)?x:null;
      for(const incoming of rows){
        const source_key=mailbox+":"+string(incoming.message_id)+":"+string(incoming.type);
        const info=incoming.extraction||{};
        const provider=string(info.provider);
        if(!string(incoming.message_id)||!["subscription","account","promo"].includes(incoming.type)
          ||Number(incoming.classifier_version)!==CLASSIFIER_VERSION
          ||Number(incoming.confidence)<MIN_CONFIDENCE
          ||!Array.isArray(incoming.evidence)||!incoming.evidence.length
          ||!provider||normalized(provider)==="unknown"){ignored++;continue;}
        if(previouslySeen.has(source_key)){ignored++;continue;}
        const email=mailbox;
        let saved=false;
        if(incoming.type==="account"){
          const existing=v.accounts.find(a=>normalized(a.provider)===normalized(provider)&&string(a.email)===email);
          if(!existing){
            v.accounts.unshift(normalizeAccount({
              id:"acct-"+uid(),provider,email,status:"Created",source:"gmail",source_key,
              discovered_at:nowIso(),confidence:Number(incoming.confidence)
            }));
            accountsAdded++;saved=true;
          }else saved=true;
        }else if(incoming.type==="subscription"){
          // Never silently declare "Active" solely because an email mentions a receipt.
          const name=string(info.plan),prior=v.subscriptions.find(x=>
            normalized(x.provider)===normalized(provider)&&string(x.account_email)===email&&
            (normalized(x.plan)===normalized(name)||!string(x.plan)||!name));
          const trialEnd=supportedDate(info.trial_end),renewal=supportedDate(info.renewal_date);
          if(prior){
            if(!prior.plan&&name)prior.plan=name;
            if(renewal&&(!prior.renewal_date||String(renewal)>String(prior.renewal_date)))prior.renewal_date=renewal;
            if(trialEnd&&(!prior.trial_end||String(trialEnd)>String(prior.trial_end)))prior.trial_end=trialEnd;
            if(prior.price==null&&info.price!=null&&Number.isFinite(Number(info.price)))prior.price=Number(info.price);
            if((!prior.currency||prior.currency==="AED")&&string(info.currency))prior.currency=string(info.currency);
            if((!prior.billing_cycle||prior.billing_cycle==="unknown")&&string(info.billing_cycle))prior.billing_cycle=string(info.billing_cycle);
            prior.last_detected_at=nowIso();
            updated++;saved=true;
          }else{
            const sub=normalizeSub({
              ...info,id:"sub-"+uid(),provider,account_email:email,source:"gmail",
              source_key,created_at:nowIso(),
              status:trialEnd?"Trial":"Unknown",
              confidence:Number(incoming.confidence),
              renewal_date:renewal,trial_end:trialEnd,
              review_required:false,auto_detected:true,
              currency:string(info.currency)||"AED"
            });
            v.subscriptions.unshift(sub);subscriptionsAdded++;saved=true;
          }
          if(!v.accounts.some(a=>normalized(a.provider)===normalized(provider)&&string(a.email)===email)){
            v.accounts.unshift(normalizeAccount({id:"acct-"+uid(),provider,email,status:"Discovered",
              source:"gmail",created_at:nowIso()}));
            accountsAdded++;
          }
        }else if(incoming.type==="promo"){
          const code=string(info.code).toUpperCase();
          const expiry=supportedDate(info.expiry_date);
          if(code){
            const existing=v.promo_codes.find(x=>normalized(x.provider)===normalized(provider)&&
              normalized(x.code)===normalized(code)&&string(x.account_email)===email);
            if(existing){
              if(expiry)existing.expiry_date=expiry;
              existing.last_seen_at=nowIso();updated++;
            }else{
              v.promo_codes.unshift(normalizePromo({
                id:"promo-"+uid(),provider,code,discount_text:string(info.discount_text).slice(0,230),
                expiry_date:expiry,account_email:email,source:"gmail",source_key,
                verified:false,created_at:nowIso(),auto_detected:true
              }));
              promosAdded++;
            }
            saved=true;
          }else{
            // Offers without a redemption code belong to findings, not fake promo codes.
            const title=string(info.discount_text)||"Offer from "+provider;
            const existing=v.promo_findings.find(x=>normalized(x.provider)===normalized(provider)&&
              string(x.account_email)===email&&normalized(x.title)===normalized(title));
            if(!existing){
              v.promo_findings.unshift({id:"finding-"+uid(),provider,title,
                description:"Detected from a Gmail promotional message",account_email:email,
                source:"gmail",source_key,expiry_date:expiry,verified:false,
                status:"unverified",created_at:nowIso(),auto_detected:true});
              promosAdded++;
            }else updated++;
            saved=true;
          }
        }
        if(saved){
          previouslySeen.add(source_key);
          v.mail_activity.unshift({id:"sync-"+uid(),source_key,action:"auto_sync",
            provider,type:incoming.type,mailbox_email:email,recorded_at:nowIso()});
        }else ignored++;
      }
      const mailboxRecord=v.mailboxes.find(x=>x.email===mailbox);
      if(mailboxRecord){mailboxRecord.last_synced_at=nowIso();mailboxRecord.last_scan_count=rows.length;}
      else v.mailboxes.push({id:"mailbox-"+normalized(mailbox),email:mailbox,
        last_synced_at:nowIso(),last_scan_count:rows.length});
      result={accountsAdded,subscriptionsAdded,promosAdded,updated,ignored,mailbox};
   }else if(route==="/mail/ingest"&&method==="POST"){
      const mailbox=string(data.mailbox).toLowerCase();const rows=asArray(data.records);
      if(!mailbox||rows.length>250)throw Error("Invalid mailbox or too many records");
      const seen=new Set([...v.review_queue,...v.mail_activity].map(x=>string(x.source_key)));
      let added=0,filtered=0,duplicates=0;
      for(const incoming of rows){
        const source_key=mailbox+":"+string(incoming.message_id)+":"+string(incoming.type);
        const provider=string(incoming.extraction?.provider);
        const confidence=Number(incoming.confidence)||0;
        const supported=Array.isArray(incoming.evidence)&&incoming.evidence.length>0;
        if(!incoming.message_id||!["subscription","account","promo"].includes(incoming.type)
           ||!provider||normalized(provider)==="unknown"||confidence<MIN_CONFIDENCE||!supported){filtered++;continue;}
        if(seen.has(source_key)){duplicates++;continue;}
        // The local ingestion endpoint rejects old broad-parser candidates as well.
        if(Number(incoming.classifier_version)!==CLASSIFIER_VERSION){filtered++;continue;}
        const record={...incoming,id:"mail-"+uid(),source_key,mailbox_email:mailbox,
          status:"needs_review",created_at:nowIso(),review_required:true,
          confidence:Math.min(1,Math.max(0,Number(incoming.confidence)||0))};
        v.review_queue.unshift(record);seen.add(source_key);added++;
      }
      const old=v.mailboxes.find(x=>x.email===mailbox);
      if(old){old.last_synced_at=nowIso();old.last_scan_count=rows.length;}
      else v.mailboxes.push({id:"mailbox-"+normalized(mailbox),email:mailbox,last_synced_at:nowIso(),last_scan_count:rows.length});
      result={added,duplicates,filtered,mailbox,review_pending:v.review_queue.filter(x=>x.status==="needs_review").length};
   }else if(route==="/mail/cleanup-legacy"&&method==="POST"){
      const before=v.review_queue.length;
      v.review_queue=v.review_queue.filter(x=>x.status!=="needs_review"||x.source!=="gmail"&&
        !(string(x.source_key).includes(":")&&string(x.id).startsWith("mail-"))
        ||(Number(x.classifier_version)===CLASSIFIER_VERSION&&Number(x.confidence)>=MIN_CONFIDENCE));
      result={removed:before-v.review_queue.length,preserved: v.review_queue.length};
   }else if(route.startsWith("/inbox/")&&method==="POST"&&route.endsWith("/action")){
      const id=route.split("/")[2];
      const entry=v.review_queue.find(x=>x.id===id);
      if(!entry)notFound();
      if(entry.status!=="needs_review")throw Error("This finding was already reviewed");
      const action=string(data.action);
      if(action!=="approve"&&action!=="dismiss")throw Error("Choose approve or dismiss");
      if(action==="dismiss"){
        entry.status="dismissed";entry.reviewed_at=nowIso();
        v.mail_activity.unshift({id:"review-"+uid(),source_key:entry.source_key,
          action:"approved_v3",decision:"dismissed",recorded_at:nowIso()});
        result={ok:true,status:entry.status};
      }else{
        const updated={...entry,extraction:{...(entry.extraction||{}),...(data.edits||{})},
          confidence:1,classifier_version:CLASSIFIER_VERSION};
        // Approval resolves uncertainty but still reconciles against the
        // provider/account/plan rather than creating a second app record.
        const outcome=applyMailCandidate(v,updated as MailCandidate,
          string(entry.mailbox_email),nowIso(),uid,true);
        if(outcome.decision==="ignored")throw Error("Review could not be saved. Check provider and mailbox.");
        entry.status="approved";entry.reviewed_at=nowIso();
        result={ok:true,status:entry.status,record_id:outcome.record_id};
      }
   }else if(route==="/promo/sources"&&method==="POST"){
      const provider=string(data.provider).slice(0,100);
      const keywords=string(data.keywords).slice(0,150);
      if(!provider)throw Error("Enter the source or provider to monitor");
      const existing=v.promo_sources.find(x=>normalized(x.provider)===normalized(provider)&&normalized(x.keywords)===normalized(keywords));
      if(existing)result=existing;
      else{const rec={id:"src-"+uid(),provider,keywords,source_url:string(data.source_url).slice(0,400),
       enabled:true,created_at:nowIso(),last_checked_at:null};v.promo_sources.unshift(rec);result=rec;}
   }else if(route.startsWith("/promo/sources/")&&method==="PATCH"){
      const item=v.promo_sources.find(x=>x.id===route.split("/")[3]);if(!item)notFound();
      Object.assign(item,data,{updated_at:nowIso()});result=item;
   }else if(route.startsWith("/promo/sources/")&&method==="DELETE"){
      v.promo_sources=v.promo_sources.filter(x=>x.id!==route.split("/")[3]);result={ok:true};
   }else if(route==="/promo/findings"&&method==="POST"){
      const url=canonicalUrl(string(data.source_url));
      const existing=v.promo_findings.find(x=>x.source_url===url);
      if(existing){Object.assign(existing,{last_seen_at:nowIso(),...data,source_url:url});result={duplicate:true,item:existing};}
      else{const rec={...data,id:"finding-"+uid(),source_url:url,verified:false,
        status:"unverified",created_at:nowIso(),last_seen_at:nowIso(),
        tags:inferTags([data.title,data.provider,data.description].join(" "),["deals"])};v.promo_findings.unshift(rec);
        result={duplicate:false,item:rec};}
   }else if(route.startsWith("/promo/findings/")&&method==="DELETE"){
      v.promo_findings=v.promo_findings.filter(x=>x.id!==route.split("/")[3]);result={ok:true};
   }else if(route==="/settings"&&method==="PATCH"){
      v.settings={...v.settings,...data};result=v.settings;
   }else if(route==="/links"&&method==="POST"){
      const classified=classifyLink(String(data.url||""),String(data.note||""),String(data.source||"share"));
      const existing=v.links.find(l=>l.canonical_url===classified.canonical_url);
      if(existing)result=existing;else{const rec={...classified,...data,id:"link-"+uid(),created_at:nowIso()};v.links.unshift(rec);result=rec}
   }else if(route==="/ingest/text"&&method==="POST"){
      const raw=string(data.text).slice(0,12000);
      if(!raw)throw Error("Enter text to save.");
      if(/\b(?:otp|verification code|one.time code|recovery phrase|private key|password)\b/i.test(raw))
        throw Error("Remove credentials and verification codes before saving.");
      const entry={id:"inbox-"+uid(),source:string(data.source)||"manual",raw_text:raw,
        source_subject:"Manual note",status:"needs_review",confidence:0,created_at:nowIso(),
        extraction:{provider:"",summary:raw.slice(0,400),content_type:"note"},
        doubts:["Manual note; no subscription has been inferred."]};
      v.review_queue.unshift(entry);result=entry;
   }else if(route==="/ingest/email"&&method==="POST"){
      const raw=string(data.body).slice(0,16000);
      if(!raw)throw Error("Paste email text before processing.");
      if(/\b(?:one.time code|verification code|security code|recovery phrase|private key|password reset|your otp)\b/i.test(raw))
        throw Error("Security or verification email rejected.");
      const header=(name:string)=>raw.match(new RegExp("^"+name+":\\s*(.+)$","im"))?.[1]?.trim()||"";
      const sender=string(data.sender)||header("From"),subject=string(data.subject)||header("Subject")||"Pasted email",to=string(data.to)||header("To");
      const candidate=classifyMail({id:"pasted-"+uid(),subject,from:sender,date:nowIso(),
        snippet:raw.slice(0,400),body:raw,labels:[]},to)[0];
      const extracted=candidate?.extraction||{};
      const entry={id:"inbox-"+uid(),source:"pasted-email",raw_text:raw,source_subject:subject,
        source_from:sender,source_to:to,created_at:nowIso(),status:"needs_review",
        extraction:{...extracted,account_email:extracted.account_email||to||"",summary:raw.slice(0,400)},
        confidence:candidate?.confidence||0,
        doubts:["Pasted email requires review before creating a plan."]};
      v.review_queue.unshift(entry);result=entry;
   }else if(route==="/ingest/link"&&method==="POST"){
      const classified=classifyLink(String(data.url||""),String(data.text||""),String(data.source||"share"));
      const existing=v.links.find(l=>l.canonical_url===classified.canonical_url);
      let target:Dict;
      if(existing){target=existing;result={link_id:existing.id,duplicate:true,link:existing};}
      else{const rec={...classified,id:"link-"+uid(),created_at:nowIso()};
       v.links.unshift(rec);target=rec;result={link_id:rec.id,duplicate:false,link:rec};}
      if(Array.isArray(data.tags)&&data.tags.length){
        target.tags=Array.from(new Set([...(target.tags||[]),...data.tags.filter((x:any)=>typeof x==="string").map((x:string)=>x.trim().toLowerCase()).filter(Boolean)]));
      }
      if(string(data.text)&&!target.note)target.note=string(data.text).slice(0,1200);
      if(!string(data.reminder_date)&&Number.isFinite(Number(data.remind_in_days))&&Number(data.remind_in_days)>0){
        const when=new Date();when.setDate(when.getDate()+Math.min(3650,Number(data.remind_in_days)));
        data.reminder_date=when.toISOString().slice(0,10);
      }
      if(string(data.reminder_date)){
        let reminder=v.reminders.find(r=>r.ref_type==="link"&&r.ref_id===target.id&&!r.completed);
        if(!reminder){reminder={id:"rem-"+uid(),ref_id:target.id,ref_type:"link",completed:false,created_at:nowIso()};v.reminders.unshift(reminder);}
        Object.assign(reminder,{title:string(data.reminder_title)||"Review saved link",due_date:data.reminder_date,
          remind_time:string(data.reminder_time)||"09:00"});
        target.reminder_id=reminder.id;
      }
   }else if(route==="/deals/track-price"&&method==="POST"){
      const rec={id:"price-"+uid(),checked_at:nowIso(),...data};
      v.price_snapshots.unshift(rec);result={duplicate:false,record:rec,change:null};
   }else if(route.startsWith("/links/")&&route.endsWith("/opened")&&method==="POST"){
      const id=route.split("/")[2],link=v.links.find(l=>l.id===id);if(!link)notFound();
      link.opened_count=(Number(link.opened_count)||0)+1;link.last_opened_at=nowIso();result=link;
   }else if(route.startsWith("/links/")&&route.endsWith("/remind")&&method==="POST"){
      const id=route.split("/")[2],link=v.links.find(l=>l.id===id);if(!link)notFound();
      let date=string(data.date);
      if(!date){const n=Number(data.days);if(!Number.isFinite(n)||n<1)throw Error("Choose reminder date");
        const d=new Date();d.setDate(d.getDate()+Math.min(3650,n));date=d.toISOString().slice(0,10);}
      let r=v.reminders.find(x=>x.ref_type==="link"&&x.ref_id===id&&!x.completed);
      if(!r){r={id:"rem-"+uid(),ref_type:"link",ref_id:id,completed:false,created_at:nowIso()};v.reminders.unshift(r);}
      Object.assign(r,{title:string(data.title)||"Review saved link",due_date:date,remind_time:"09:00"});
      link.reminder_due=date;link.reminder_id=r.id;result=r;
   }else if(route.startsWith("/links/")&&method==="DELETE"){
      v.links=v.links.filter(l=>l.id!==route.split("/")[2]);result={ok:true};
   }else if(route.startsWith("/links/")&&method==="PATCH"){
      const l=v.links.find(l=>l.id===route.split("/")[2]);if(!l)notFound();Object.assign(l,data);result=l;
   }else if(route.startsWith("/links/")&&route.endsWith("/reminder")&&method==="PUT"){
      const id=route.split("/")[2];const l=v.links.find(l=>l.id===id);if(!l)notFound();
      let r=v.reminders.find(r=>r.ref_type==="link"&&r.ref_id===id&&!r.completed);
      if(!r){r={id:"rem-"+uid(),ref_id:id,ref_type:"link",completed:false};v.reminders.unshift(r)}
      Object.assign(r,{title:data.title,due_date:data.due_date,remind_time:data.remind_time||"09:00"});l.reminder_id=r.id;result=r;
   }else{throw Error("This action needs an optional backend or is not available offline: "+route)}
   await save(v);return result as T;
 });
 const v=await getVault();const accounts:Dict[]=v.accounts.map((a:Dict)=>({...a,
  plans:v.subscriptions.filter(s=>(s.account_email&&a.email&&s.account_email===a.email&&normalized(s.provider)===normalized(a.provider)))
   .map(s=>({id:s.id,plan:s.plan,status:s.status})),
  active_plans:v.subscriptions.filter(s=>(s.account_email&&a.email&&s.account_email===a.email&&normalized(s.provider)===normalized(a.provider))
    &&["Active","Trial"].includes(s.status)).length}));
 const insights=localInsights(v);
 let result:any;
 if(route==="/")result={app:"SubMind",status:"ok",mode:"local"};
 else if(route==="/subscriptions"){result=v.subscriptions.filter(s=>(!params.get("status")||s.status===params.get("status"))&&(!params.get("category")||s.category===params.get("category")))}
 else if(route.startsWith("/subscriptions/"))result=v.subscriptions.find(s=>s.id===route.split("/")[2])||notFound();
 else if(route==="/accounts")result=accounts;
 else if(route.startsWith("/accounts/"))result=accounts.find(s=>s.id===route.split("/")[2])||notFound();
 else if(route==="/insights")result=insights;
 else if(route==="/vault/dashboard")result={monthly_by_currency:insights.monthly_by_currency,active_subscriptions:insights.active_count,
  accounts:accounts.length,links:v.links.length,saved_plans:v.watchlist.length,needs_review:v.review_queue.length,
  renewals_30d:insights.renewals_30d,trials_ending:insights.trials_ending};
 else if(route==="/watchlist")result=v.watchlist;
 else if(route.startsWith("/watchlist/"))result=v.watchlist.find(x=>x.id===route.split("/")[2])||notFound();
 else if(route==="/deals/codes")result=v.promo_codes;
 else if(route==="/promo/sources")result=v.promo_sources;
 else if(route==="/promo/findings")result=v.promo_findings;
 else if(route==="/prompts")result=v.prompts;
 else if(route.startsWith("/prompts/"))result=v.prompts.find(x=>x.id===route.split("/")[2])||notFound();
 else if(route==="/mailboxes")result=v.mailboxes;
 else if(route==="/review-queue")result=v.review_queue.filter(x=>x.status==="needs_review");
 else if(route==="/deals/price-history")result=v.price_snapshots.filter(x=>!params.get("provider")||normalized(x.provider).includes(normalized(params.get("provider"))));
 else if(route==="/links")result=v.links;
 else if(route.startsWith("/links/")&&route.endsWith("/reminder"))result=v.reminders.find(r=>r.ref_type==="link"&&r.ref_id===route.split("/")[2]&&!r.completed)||null;
 else if(route.startsWith("/links/"))result=v.links.find(x=>x.id===route.split("/")[2])||notFound();
 else if(route==="/reminders")result=v.reminders;
 else if(route==="/settings")result=v.settings;
 else if(route==="/inbox")result=v.review_queue.filter(x=>x.status==="needs_review"&&
   (!params.get("tab")||params.get("tab")==="all"||params.get("tab")==="All"||lower(x.type)===lower(params.get("tab"))));
 else if(route==="/graph")result=graphFromVault(v);
 else if(route.startsWith("/search")){
   const q=lower(params.get("q")).trim();const has=(x:Dict)=>lower([x.provider,x.title,x.text,x.code,x.url,x.email,x.plan,(x.tags||[]).join(" ")].join(" ")).includes(q);
   result={subscriptions:v.subscriptions.filter(has).slice(0,50),links:v.links.filter(has).slice(0,50),
     prompts:v.prompts.filter(has).slice(0,50),promos:v.promo_codes.filter(has).slice(0,50),promo_findings:v.promo_findings.filter(has).slice(0,50),
     accounts:v.accounts.filter(has).slice(0,50),plans:v.watchlist.filter(has).slice(0,50),reminders:v.reminders.filter(has).slice(0,50)};
 }
 else throw Error("This feature requires a backend or AI API configuration: "+route);
 return result as T;
}
