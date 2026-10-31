/**
 * SubMind Smart Companion.
 * Grounded, device-side planning and recommendations; no background billing,
 * private-data upload, invented entitlements, or autonomous paid-model calls.
 */
import { recommendToolsForGoal } from "@/src/lib/tool-goal-matcher";
import { suggestRelatedLinks } from "@/src/lib/smart-link-intelligence";

export type SmartTask = {
 id:string; source_key:string;title:string;description?:string;
 source_type:string;source_id?:string;kind:string;
 status:"open"|"done"|"dismissed";due_date?:string|null;
 created_at:string;updated_at?:string;
};
type Item=Record<string,any>;
export type SmartSuggestion=Omit<SmartTask,"id"|"created_at"|"status">;
const text=(x:any)=>String(x??"").trim();
const lower=(x:any)=>text(x).toLowerCase();
const norm=(x:any)=>lower(x).replace(/[^a-z0-9 ]/g," ");
const terms=(x:any)=>new Set(norm(x).split(/\s+/).filter(w=>w.length>=4&&!["what","which","with","from","about","into","this","that","some","using","after","their","tool","tools","saved","model","service","plan"].includes(w)));
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(w=>b.has(w));
const isActive=(x:Item)=>!["cancelled","canceled","expired","inactive"].includes(lower(x.status));
const safeDate=(s:any)=>/^\d{4}-\d{2}-\d{2}$/.test(text(s))&&Number.isFinite(Date.parse(text(s)+"T12:00:00Z"))?text(s):null;
const daysTo=(s:any)=>{const d=safeDate(s);return d?Math.ceil((Date.parse(d+"T12:00:00Z")-Date.now())/86400000):null};
const explicitCredit=(x:Item)=>{
 for(const name of ["remaining_credits","credits_remaining","balance_remaining","remaining","balance"]){
  const n=Number(x[name]);if(x[name]!==null&&x[name]!==undefined&&x[name]!==""&&Number.isFinite(n)&&n>=0)
   return {number:n,kind:"Recorded remaining"};
 }
 for(const name of ["allocated_credits","credits_awarded","credits","amount","quantity"]){
  const n=Number(x[name]);if(x[name]!==null&&x[name]!==undefined&&x[name]!==""&&Number.isFinite(n)&&n>=0)
   return {number:n,kind:"Recorded allocation; balance unknown"};
 }
 return null;
};
export type CreditRecord={
 id:string;provider:string;label:string;quantity:number|null;unit:string;
 meaning:string;expiry:string|null;days_left:number|null;source:string;
 status:"expires-soon"|"recorded"|"expired"|"unverified";
};
export function creditOptimizer(v:Item):{records:CreditRecord[];guidance:string[]}{
 const records:CreditRecord[]=[];
 for(const b of (v.benefits||[])){
  const info=explicitCredit(b);
  const label=text(b.benefit||b.name||b.title||b.description||b.product||"Credit or benefit");
  const creditLike=/credit|token|minute|point|generation|inference|compute|api\b/i.test(
    [label,b.unit,b.type,b.provider,b.description].join(" "));
  if(!info&&!creditLike)continue;
  const expiry=safeDate(b.expiry_date||b.expires_at||b.valid_until||b.expiry);
  const remaining=daysTo(expiry);
  records.push({
   id:text(b.id)||"benefit:"+records.length,
   provider:text(b.provider||b.service||b.platform)||"Unknown provider",
   label:label.slice(0,150),quantity:info?.number??null,
   unit:text(b.unit||b.currency||"credits").slice(0,25),
   meaning:info?.kind||"Allocation/balance not verified",
   expiry,days_left:remaining,source:text(b.source||b.source_message_id||"Imported record"),
   status:remaining!==null&&remaining<0?"expired":
     remaining!==null&&remaining<=7?"expires-soon":info?"recorded":"unverified",
  });
 }
 records.sort((a,b)=>{
  const k=(r:CreditRecord)=>r.status==="expires-soon"?0:r.status==="recorded"?1:r.status==="unverified"?2:3;
  return k(a)-k(b)||(a.days_left??9999)-(b.days_left??9999);
 });
 return {
  records:records.slice(0,100),
  guidance:[
   "Use your saved credits and existing subscriptions before purchasing another plan, but verify current balances with each provider.",
   "Gemini Flash/Lite is the preferred automatic model. Argon/Pro and any other possibly billable model require manual selection and confirmation.",
   "No model is guaranteed free. The app does not test a model by making a paid inference.",
  ],
 };
}
export type BenefitMatch={
 id:string;provider:string;plan:string;score:number;reason:string;
 status:string;source:"subscription"|"benefit"|"account";confirmed:boolean;
};
export function matchSubscriptionBenefits(v:Item,candidate:Item|string,limit=7):BenefitMatch[]{
 const record=typeof candidate==="string"?{title:candidate}:candidate;
 const target=terms([record.title,record.provider,record.summary,record.description,
   (record.tags||[]).join(" "), (record.use_cases||[]).join(" "),record.category].join(" "));
 const provider=lower(record.provider);
 const matches:BenefitMatch[]=[];
 const score=(item:Item,source:BenefitMatch["source"])=>{
  const tokens=terms([item.provider,item.product,item.plan,item.description,item.notes,
    item.benefit,item.category,(item.tags||[]).join(" ")].join(" "));
  const shared=overlap(target,tokens);
  const sameProvider=Boolean(provider)&&provider===lower(item.provider);
  const sameName=norm(record.title).length>3&&norm(item.provider).length>3&&
   norm(record.title).includes(norm(item.provider));
  const points=shared.length*2+(sameProvider?7:0)+(sameName?5:0)+
    (record.category&&lower(record.category)===lower(item.category)?2:0);
  if(points<4)return;
  matches.push({
   id:text(item.id),provider:text(item.provider||item.service)||"Unknown",
   plan:text(item.plan||item.product||item.benefit||item.title||"Saved service"),
   status:text(item.status||"Unknown"),source,score:points,
   reason:sameProvider?"Same provider; check whether your saved entitlement covers this feature.":
    "Similar saved keywords: "+shared.slice(0,5).join(", "),
   confirmed:source==="subscription"&&sameProvider&&/^(active|trial)$/i.test(text(item.status)),
  });
 };
 for(const x of v.subscriptions||[])if(isActive(x))score(x,"subscription");
 for(const x of v.benefits||[])score(x,"benefit");
 // Registered accounts alone do not prove any active benefit. Exclude them.
 return matches.sort((a,b)=>b.score-a.score).slice(0,limit);
}
export type PlanStep={number:number;title:string;detail:string;tool?:string;ref_id?:string;kind?:string};
export function buildGoalPlan(v:Item,goalInput:string):{
 goal:string;steps:PlanStep[];matches:ReturnType<typeof recommendToolsForGoal>["results"];
 suggestedLinks:Item[];alternatives:string[];notice:string;
}{
 const goal=text(goalInput).slice(0,800);
 const match=recommendToolsForGoal(v,goal);
 const goalTerms=terms(goal);
 const links=(v.links||[]).map((link:Item)=>{
  const source=terms([link.title,link.summary,(link.tags||[]).join(" "),
    (link.search_keywords||[]).join(" "),(link.use_cases||[]).join(" ")].join(" "));
  const similarity=overlap(goalTerms,source).length+(goal&&lower(link.title).includes(lower(goal))?3:0);
  return {link,similarity};
 }).filter((x:{link:Item;similarity:number})=>x.similarity>=1)
   .sort((a:{similarity:number},b:{similarity:number})=>b.similarity-a.similarity).slice(0,5).map((x:{link:Item})=>x.link);
 const steps:PlanStep[]=[];
 if(goal)steps.push({number:1,title:"Define the result",detail:goal});
 for(const selection of match.results.slice(0,4)){
  steps.push({number:steps.length+1,title:"Evaluate "+selection.tool.name,
   detail:"Check its saved plan, limits and compatibility before using it. "+selection.reason,
   tool:selection.tool.name,ref_id:selection.tool.ref_id,kind:selection.tool.kind});
 }
 if(links.length)steps.push({number:steps.length+1,title:"Review saved resources",
  detail:"Relevant saved links: "+links.slice(0,3).map((x:Item)=>text(x.title)).join(" · ")});
 if(goal)steps.push({number:steps.length+1,title:"Verify outcome and capture what worked",
  detail:"Save the result or reusable prompt in SubMind, and update any actual costs or credits consumed."});
 return {goal,steps,matches:match.results,suggestedLinks:links,
  alternatives:match.results.slice(4).map(x=>x.tool.name),
  notice:match.hasMatch?"Recommendations use saved records; verify capabilities and available credits before taking action.":
    "No sufficiently supported service match. Saved links may still help; no new entitlement has been assumed."};
}
export function buildFollowUpSuggestions(v:Item):SmartSuggestion[]{
 const suggestions:SmartSuggestion[]=[];
 const add=(s:SmartSuggestion)=>{if(!suggestions.some(x=>x.source_key===s.source_key))suggestions.push(s)};
 for(const l of (v.links||[]).slice(0,160)){
  if(!l.id)continue;
  const isRepo=l.kind==="github";
  const stale=!l.opened_count&&l.created_at&&Date.now()-Date.parse(l.created_at)>6*86400000;
  if(isRepo&&!l.tested_at)add({
   source_key:"test-repo:"+l.id,kind:"test-link",title:"Test saved repository: "+text(l.title).slice(0,90),
   description:"Review README, compatibility and actual setup before relying on this repository.",
   source_type:"link",source_id:text(l.id),due_date:null,
  });
  else if(stale)add({source_key:"review-link:"+l.id,kind:"review-link",
   title:"Review saved link: "+text(l.title).slice(0,90),
   description:"Saved over a week ago and not marked as opened.",
   source_type:"link",source_id:text(l.id),due_date:null});
 }
 for(const p of (v.promo_codes||[]).slice(0,120)){
  const when=safeDate(p.expiry_date||p.expires),days=daysTo(when);
  if(days===null||days<0||days>7||!p.id)continue;
  add({source_key:"promo-expiry:"+p.id,kind:"offer-expiry",
   title:"Check offer before expiry: "+text(p.provider||p.title),
   description:"Recorded expiry: "+when+". Verify the offer is still available before claiming.",
   source_type:"promo",source_id:text(p.id),due_date:when});
 }
 const tasks:SmartTask[]=v.smart_tasks||[];
 const past=new Set(tasks.map(x=>x.source_key));
 return suggestions.filter(x=>!past.has(x.source_key)).slice(0,35);
}
export type KnowledgeConnection={type:string;id:string;title:string;score:number;reason:string};
export function knowledgeConnections(v:Item,item:Item,max=7):KnowledgeConnection[]{
 const srcTags=new Set((item.tags||[]).map((x:string)=>lower(x)));
 const srcTerms=terms([item.title,item.provider,item.summary,(item.search_keywords||[]).join(" ")].join(" "));
 const pool:KnowledgeConnection[]=[];
 const add=(type:string,x:Item)=>{
  if(!x.id||x.id===item.id)return;
  const shared=(x.tags||[]).filter((x:string)=>srcTags.has(lower(x)));
  const target=terms([x.title,x.provider,x.plan,x.summary,x.description,x.text,
    (x.search_keywords||[]).join(" ")].join(" "));
  const sameProvider=Boolean(lower(item.provider))&&lower(item.provider)===lower(x.provider);
  const related=overlap(srcTerms,target);
  const score=shared.length*4+related.length+(item.category&&item.category===x.category?2:0)+(sameProvider?5:0);
  if(score<4)return;
  pool.push({type,id:text(x.id),title:text(x.title||x.provider||x.plan).slice(0,100),
   score,reason:sameProvider?"Same service":shared.length?"Shared tags: "+shared.slice(0,3).join(", "):
    "Related terms: "+related.slice(0,3).join(", ")});
 };
 for(const x of v.links||[])add("link",x);
 for(const x of v.prompts||[])add("prompt",x);
 for(const x of v.subscriptions||[])add("subscription",x);
 return pool.sort((a,b)=>b.score-a.score).slice(0,max);
}
export type GitHubSnapshot={
 full_name:string;latest_release_tag:string|null;latest_release_url:string|null;
 pushed_at:string|null;archived:boolean;checked_at:string;
};
export async function fetchGitHubSnapshot(raw:string):Promise<GitHubSnapshot>{
 const u=new URL(raw);
 if(u.protocol!=="https:"||u.hostname.toLowerCase()!=="github.com"||u.username||u.password)throw Error("Only public GitHub repository URLs can be watched.");
 const path=u.pathname.split("/").filter(Boolean).slice(0,2).map(x=>x.replace(/\.git$/,""));
 if(path.length!==2||!path.every(x=>/^[a-zA-Z0-9_.-]+$/.test(x)))throw Error("Invalid GitHub repository URL.");
 const base="https://api.github.com/repos/"+encodeURIComponent(path[0])+"/"+encodeURIComponent(path[1]);
 const get=async(url:string)=>{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),9000);
  try{
   const r=await fetch(url,{headers:{Accept:"application/vnd.github+json"},credentials:"omit",signal:ctl.signal});
   if(!r.ok)return null;
   const t=await r.text();if(t.length>90000)return null;
   return JSON.parse(t);
  }catch{return null;}finally{clearTimeout(timer);}
 };
 const repo=await get(base);
 if(!repo||repo.private||typeof repo.full_name!=="string")throw Error("Public GitHub repo is unavailable or API rate limit reached.");
 const release=await get(base+"/releases/latest");
 return{
  full_name:text(repo.full_name),latest_release_tag:text(release?.tag_name)||null,
  latest_release_url:text(release?.html_url)||null,pushed_at:text(repo.pushed_at)||null,
  archived:repo.archived===true,checked_at:new Date().toISOString(),
 };
}
export function repoUpdates(link:Item,next:GitHubSnapshot):SmartSuggestion[]{
 const prev=link.repo_watch_snapshot as GitHubSnapshot|undefined;
 if(!prev)return[]; // First scan establishes the baseline, not an alert.
 const events:SmartSuggestion[]=[];
 if(next.latest_release_tag&&next.latest_release_tag!==prev.latest_release_tag){
  events.push({source_key:"github-release:"+link.id+":"+next.latest_release_tag,
   title:next.full_name+" released "+next.latest_release_tag,kind:"github-release",
   source_type:"link",source_id:text(link.id),due_date:null,
   description:"A new public release was detected. Inspect its changelog: "+text(next.latest_release_url)});
 }
 if(next.archived&&!prev.archived)events.push({
  source_key:"github-archived:"+link.id,title:next.full_name+" was archived",
  description:"This repository is now marked archived on GitHub.",
  source_type:"link",source_id:text(link.id),kind:"github-archived",due_date:null,
 });
 // Don't produce an alert for every commit or timestamp movement.
 return events;
}
