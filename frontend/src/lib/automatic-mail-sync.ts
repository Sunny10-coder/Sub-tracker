import { storage } from "@/src/utils/storage";
import { api } from "@/src/lib/api";
import { getConnectedGmail, scanConnectedGmail } from "@/src/lib/gmail-sync";
/** Automatic Gmail refresh on opening the app, with a 12-hour per-mailbox throttle. */
const PREFIX="submind.gmail.last-auto-sync.";
const PERIOD=12*60*60*1000;
let task:Promise<{skipped:boolean;reason?:string}|{skipped:false;added:number}>|null=null;
export function autoSyncGmailOnLaunch() {
 if(task)return task;
 task=(async()=>{
  try {
    const email=await getConnectedGmail();
    if(!email)return {skipped:true,reason:"No authorised Gmail account"} as const;
    const previous=Number(await storage.getItem(PREFIX+email,0));
    if(previous&&Date.now()-previous<PERIOD)return {skipped:true,reason:"Already scanned recently"} as const;
    const result=await scanConnectedGmail({days:180,limit:140});
    const imported=await api.autoSyncMail(result.email,result.candidates);
    await storage.setItem(PREFIX+email,Date.now());
    return {skipped:false,added:Number(imported.accountsAdded||0)+Number(imported.subscriptionsAdded||0)+Number(imported.promosAdded||0)} as const;
  }catch(e:any){return {skipped:true,reason:String(e?.message||e)} as const;}
 })().finally(()=>{task=null});
 return task;
}
