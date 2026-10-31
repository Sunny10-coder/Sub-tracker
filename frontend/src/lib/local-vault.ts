/** Local-only SubMind data engine. Never sends private imports to a server.
 * A separate FastAPI URL remains optional for advanced AI and web-search services.
 * Android stores this JSON in app-private storage; this is NOT an encrypted backup.
 */
import { storage } from "@/src/utils/storage";
import { classifyLink, canonicalUrl, graphFromVault, inferCategory, inferTags } from "@/src/lib/vault-intelligence";

export const LOCAL_VAULT_KEY = "submind.private.import.v1";
type Dict = Record<string, any>;
type Vault = { schema: string; subscriptions: Dict[]; accounts: Dict[]; watchlist: Dict[];
  promo_codes: Dict[]; mail_activity: Dict[]; review_queue: Dict[]; prompts: Dict[]; mailboxes: Dict[];
  benefits: Dict[]; links: Dict[]; reminders: Dict[]; price_snapshots: Dict[]; settings: Dict; imported_at?: string };
const EMPTY:Vault={schema:"submind-import-v1",subscriptions:[],accounts:[],watchlist:[],
 promo_codes:[],mail_activity:[],review_queue:[],prompts:[],mailboxes:[],benefits:[],links:[],reminders:[],price_snapshots:[],
 settings:{currency:"AED",ai_enabled:true,price_monitoring:false,auto_add_threshold:0.95}};

function normalized(s:any):string{return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function string(s:any):string{return typeof s==="string"?s.trim():""}
function asArray(x:any):Dict[]{return Array.isArray(x)?x.filter(v=>v&&typeof v==="object"):[]}
function copy(v:Vault):Vault{
 const merged={...EMPTY,...v,settings:{...EMPTY.settings,...v.settings}};
 for(const k of ["subscriptions","accounts","watchlist","promo_codes","mail_activity","review_queue","prompts","mailboxes","benefits","links","reminders","price_snapshots"] as const) {
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
 try{return copy(JSON.parse(raw))}catch{return copy(EMPTY)}
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
   benefits:asArray(data.benefits),
   mail_activity:asArray(data.mail_activity),
   prompts:asArray(data.prompts).map((p,i)=>({...p,id:p.id||"prompt-import-"+i+"-"+normalized(p.title)})),
   links:asArray(data.links).map((l,i)=>({...l,id:l.id||"link-import-"+i+"-"+normalized(l.url)})),
   reminders:asArray(data.reminders).map((r,i)=>({...r,id:r.id||"rem-import-"+i})),
   mailboxes:asArray(data.mailboxes)
  };
  const added:Dict={},duplicates:Dict={};
  for(const k of Object.keys(inbound)){
    const existing=(vault as any)[k]||[];const array=inbound[k];
    const existingKeys=new Set(existing.map((x:Dict)=>String(x.id)));
    added[k]=array.filter(x=>!existingKeys.has(String(x.id))).length;
    duplicates[k]=array.length-added[k];
    (vault as any)[k]=mergeById(existing,array);
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
 return s.status==="Trial"?(s.trial_end||s.renewal_date||null):(s.renewal_date||null);
}
function charge(s:Dict):number|null{
 if(!["Active","Trial"].includes(s.status)||s.auto_renew===false||s.review_required===true)return null;
 if(s.status==="Trial"&&s.trial_paid!==true)return null;
 if(s.price===null||s.price===undefined||!Number.isFinite(Number(s.price)))return null;
 const cost=Number(s.price);if(cost<0)return null;
 switch(String(s.billing_cycle||"").toLowerCase()){
  case "monthly":return cost;case "yearly":return cost/12;case "weekly":return cost*52/12;default:return null;
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
   if(route==="/subscriptions"&&method==="POST"){
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
      if(!rec.email||!rec.provider)throw Error("Account provider and sign-in email are required");
      if(v.accounts.some(a=>normalized(a.provider)===normalized(rec.provider)&&string(a.email)===string(rec.email)))throw Error("409: Account already exists");
      v.accounts.unshift(rec);result=rec;
   }else if(route.startsWith("/accounts/")&&method==="PATCH"){
      const id=route.split("/")[2];const x=v.accounts.find(a=>a.id===id);if(!x)notFound();
      Object.assign(x,data);result=x;
   }else if(route.startsWith("/accounts/")&&method==="DELETE"){
      v.accounts=v.accounts.filter(a=>a.id!==route.split("/")[2]);result={ok:true};
   }else if(route==="/reminders"&&method==="POST"){
      const rec={...data,id:"rem-"+uid(),completed:false,created_at:nowIso()};v.reminders.unshift(rec);result=rec;
   }else if(route.startsWith("/reminders/")){
      const id=route.split("/")[2];const x=v.reminders.find(a=>a.id===id);
      if(method==="DELETE"){v.reminders=v.reminders.filter(a=>a.id!==id);result={ok:true}}
      else {if(!x)notFound();Object.assign(x,data);result=x;}
   }else if(route==="/watchlist"&&method==="POST"){
      const rec=normalizeWatch({...data,id:"watch-"+uid()});v.watchlist.unshift(rec);result=rec;
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
      const rec={id:"prompt-"+uid(),title,text:body,category:inferCategory(title+" "+body),tags:inferTags(title+" "+body,asArray(data.tags).map(x=>String(x))),related_ids:[],created_at:nowIso(),...data};
      v.prompts.unshift(rec);result=rec;
   }else if(route.startsWith("/prompts/")&&method==="PATCH"){
      const rec=v.prompts.find(x=>x.id===route.split("/")[2]);if(!rec)notFound();
      Object.assign(rec,data,{updated_at:nowIso()});result=rec;
   }else if(route.startsWith("/prompts/")&&method==="DELETE"){
      v.prompts=v.prompts.filter(x=>x.id!==route.split("/")[2]);result={ok:true};
   }else if(route==="/mail/ingest"&&method==="POST"){
      const mailbox=string(data.mailbox).toLowerCase();const rows=asArray(data.records);
      if(!mailbox||rows.length>250)throw Error("Invalid mailbox or too many records");
      const seen=new Set([...v.review_queue,...v.mail_activity].map(x=>string(x.source_key)));
      let added=0;
      for(const incoming of rows){
        const source_key=mailbox+":"+string(incoming.message_id)+":"+string(incoming.type);
        if(!incoming.message_id||!["subscription","account","promo"].includes(incoming.type)||seen.has(source_key))continue;
        const record={...incoming,id:"mail-"+uid(),source_key,mailbox_email:mailbox,
          status:"needs_review",created_at:nowIso(),review_required:true,
          confidence:Math.min(1,Math.max(0,Number(incoming.confidence)||0))};
        v.review_queue.unshift(record);seen.add(source_key);added++;
      }
      const old=v.mailboxes.find(x=>x.email===mailbox);
      if(old){old.last_synced_at=nowIso();old.last_scan_count=rows.length;}
      else v.mailboxes.push({email:mailbox,last_synced_at:nowIso(),last_scan_count:rows.length});
      result={added,duplicates:rows.length-added,mailbox,review_pending:v.review_queue.filter(x=>x.status==="needs_review").length};
   }else if(route.startsWith("/inbox/")&&method==="POST"&&route.endsWith("/action")){
      const id=route.split("/")[2];const entry=v.review_queue.find(x=>x.id===id);
      if(!entry)notFound();
      if(entry.status!=="needs_review")throw Error("This record was already reviewed");
      const action=string(data.action);
      if(action!=="approve"&&action!=="dismiss")throw Error("Choose approve or dismiss");
      entry.status=action==="approve"?"approved":"dismissed";
      entry.reviewed_at=nowIso();
      if(action==="approve"){
        const rec=entry.extraction||{};const email=string(rec.account_email||entry.mailbox_email).toLowerCase();
        if(entry.type==="account"){
          if(rec.provider&&!v.accounts.some(a=>normalized(a.provider)===normalized(rec.provider)&&string(a.email)===email)){
            v.accounts.unshift(normalizeAccount({provider:rec.provider,email,status:"Created",source:"gmail",source_key:entry.source_key,id:"acct-"+uid()}));
          }
        }else if(entry.type==="subscription"){
          if(rec.provider&&!v.subscriptions.some(s=>normalized(s.provider)===normalized(rec.provider)&&string(s.account_email)===email&&normalized(s.plan)===normalized(rec.plan))){
            const sub=normalizeSub({...rec,account_email:email,source:"gmail",status:rec.trial_end?"Trial":"Unknown",
              review_required:true,id:"sub-"+uid()});
            v.subscriptions.unshift(sub);
          }
          if(rec.provider&&email&&!v.accounts.some(a=>normalized(a.provider)===normalized(rec.provider)&&string(a.email)===email)){
            v.accounts.unshift(normalizeAccount({provider:rec.provider,email,status:"Created",source:"gmail",id:"acct-"+uid()}));
          }
        }else if(entry.type==="promo"){
          const code=string(rec.code);
          if(rec.provider&&!v.promo_codes.some(p=>normalized(p.provider)===normalized(rec.provider)&&normalized(p.code)===normalized(code)&&string(p.source_key)===entry.source_key)){
            v.promo_codes.unshift(normalizePromo({...rec,source:"gmail",source_key:entry.source_key,
              account_email:email,id:"promo-"+uid(),verified:false}));
          }
        }
      }
      v.mail_activity.unshift({id:"mail-action-"+uid(),source_key:entry.source_key,
        type:entry.type,mailbox_email:entry.mailbox_email,provider:entry.extraction?.provider,
        action,recorded_at:nowIso()});
      result={ok:true,status:entry.status};
   }else if(route==="/settings"&&method==="PATCH"){
      v.settings={...v.settings,...data};result=v.settings;
   }else if(route==="/links"&&method==="POST"){
      const classified=classifyLink(String(data.url||""),String(data.note||""),String(data.source||"share"));
      const existing=v.links.find(l=>l.canonical_url===classified.canonical_url);
      if(existing)result=existing;else{const rec={...classified,...data,id:"link-"+uid(),created_at:nowIso()};v.links.unshift(rec);result=rec}
   }else if(route==="/ingest/link"&&method==="POST"){
      const classified=classifyLink(String(data.url||""),String(data.text||""),String(data.source||"share"));
      const existing=v.links.find(l=>l.canonical_url===classified.canonical_url);
      if(existing)result={link_id:existing.id,duplicate:true,link:existing};
      else{const rec={...classified,id:"link-"+uid(),created_at:nowIso()};
       v.links.unshift(rec);result={link_id:rec.id,duplicate:false,link:rec}}
   }else if(route==="/deals/track-price"&&method==="POST"){
      const rec={id:"price-"+uid(),checked_at:nowIso(),...data};
      v.price_snapshots.unshift(rec);result={duplicate:false,record:rec,change:null};
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
 const v=await getVault();const accounts=v.accounts.map(a=>({...a,
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
     prompts:v.prompts.filter(has).slice(0,50),promos:v.promo_codes.filter(has).slice(0,50),
     accounts:v.accounts.filter(has).slice(0,50),plans:v.watchlist.filter(has).slice(0,50),reminders:v.reminders.filter(has).slice(0,50)};
 }
 else throw Error("This feature requires a backend or AI API configuration: "+route);
 return result as T;
}
