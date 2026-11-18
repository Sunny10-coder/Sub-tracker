import { NativeModules, Platform } from "react-native";
import { getVault } from "@/src/lib/local-vault";

type Item=Record<string,any>;
export type WidgetSnapshot={
  expiring_count:string;expiring_title:string;expiring_when:string;
  notes_count:string;notes_title:string;
  links_count:string;links_title:string;links_when:string;
};
export type WidgetSources={subscriptions?:Item[];links?:Item[];reminders?:Item[]};

const nativeWidget=()=>Platform.OS==="android"?NativeModules.SubMindWidget as
  {updateSnapshot:(data:WidgetSnapshot)=>Promise<boolean>;
   requestPin:()=>Promise<boolean>}|undefined:undefined;
const redact=(input:any,max=72):string=>String(input||"")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,"[email]")
  .replace(/\b(?:https?:\/\/|www\.)\S+/ig,"[link]")
  .trim().slice(0,max);
const asArray=(a:unknown):Item[]=>Array.isArray(a)?a:[];
function dueDay(raw:any):number|null{
 const str=String(raw||"").slice(0,10);
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(str))return null;
 const t=Date.parse(str+"T00:00:00Z");
 return Number.isFinite(t)?t:null;
}
function dayDistance(raw:any):number|null{
 const t=dueDay(raw);if(t===null)return null;
 const d=new Date(),today=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
 return Math.round((t-today)/86400000);
}
const relative=(diff:number|null):string=>diff===null?"Date not set":
  diff<0?Math.abs(diff)+"d overdue":diff===0?"Today":diff===1?"Tomorrow":"In "+diff+" days";

/**
 * The widget uses readable display labels only. Never serialize raw vault
 * records, account emails, tokens, links or full private notes to preferences.
 */
export function makeWidgetSnapshot(
  vault:{subscriptions?:Item[];notes?:Item[];links?:Item[];reminders?:Item[]},
  sources:WidgetSources={},
):WidgetSnapshot{
 const subs=asArray(sources.subscriptions??vault.subscriptions);
 const now:Item[]=[];
 for(const s of subs){
   const status=String(s.status||"").toLowerCase();
   if(!["active","trial","cancelled"].includes(status))continue;
   const due=status==="trial"?s.trial_end||s.renewal_date:
     status==="cancelled"?s.access_end:s.renewal_date||s.access_end||s.expiry_date;
   const delta=dayDistance(due);
   if(delta===null||delta<0||delta>30)continue;
   now.push({name:redact(s.provider||s.product||"Subscription",60),delta,plan:redact(s.plan,40)});
 }
 now.sort((a,b)=>a.delta-b.delta);
 const first=now[0];
 const notes=asArray(vault.notes).filter(n=>!n.archived).sort((a,b)=>
   String(b.updated_at||b.created_at||"").localeCompare(String(a.updated_at||a.created_at||"")));
 const links=asArray(sources.links??vault.links);
 const reminders=asArray(sources.reminders??vault.reminders);
 const linkMap=new Map(links.map(l=>[String(l.id),l]));
 const linkReminders:Item[]=[];
 const ids=new Set<string>();
 for(const r of reminders){
   if(r.completed||r.deleted_at||String(r.ref_type)!=="link")continue;
   const linked=linkMap.get(String(r.ref_id));
   if(!linked)continue;
   const id=String(linked.id);if(ids.has(id))continue;ids.add(id);
   linkReminders.push({title:redact(linked.title||r.title||"Saved link"),due:r.due_date});
 }
 for(const l of links){
   const id=String(l.id);
   if(!l.reminder_due||ids.has(id)||l.archived)continue;
   ids.add(id);linkReminders.push({title:redact(l.title||"Saved link"),due:l.reminder_due});
 }
 linkReminders.sort((a,b)=>(dueDay(a.due)??Infinity)-(dueDay(b.due)??Infinity));
 const link=linkReminders[0];
 return {
   expiring_count:now.length+" subscription"+(now.length===1?"":"s")+" expiring",
   expiring_title:first?first.name+(first.plan?" · "+first.plan:""):"Nothing expiring soon",
   expiring_when:first?relative(first.delta):"Next 30 days",
   notes_count:notes.length+" note"+(notes.length===1?"":"s"),
   notes_title:notes[0]?redact(notes[0].title||notes[0].body||"Untitled note"):
     "Add your first note",
   links_count:linkReminders.length+" reminder link"+(linkReminders.length===1?"":"s"),
   links_title:link?link.title:"No links with reminders",
   links_when:link?relative(dayDistance(link.due)):"Add reminders to saved links",
 };
}
export async function refreshHomeWidget(sources?:WidgetSources):Promise<boolean>{
 const widget=nativeWidget();if(!widget)return false;
 try{
   const vault=await getVault();
   return await widget.updateSnapshot(makeWidgetSnapshot(vault,sources));
 }catch{return false;}
}
export async function requestHomeWidgetPin():Promise<boolean>{
 const widget=nativeWidget();if(!widget)return false;
 await refreshHomeWidget();
 try{return await widget.requestPin();}catch{return false;}
}
export const hasNativeHomeWidget=()=>!!nativeWidget();
