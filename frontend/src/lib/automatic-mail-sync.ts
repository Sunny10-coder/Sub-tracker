/**
 * SubMind's optional, in-app Gmail scheduler.
 * - Three previously authorised device accounts, sequentially.
 * - One successful scan per mailbox per day; seven-day overlap catches delays.
 * - Interrupted / partial scans never advance the checkpoint.
 * - On-device only: no cloud tokens, daemon, or false closed-app promises.
 */
import { storage } from "@/src/utils/storage";
import { api } from "@/src/lib/api";
import {
  getConnectedGmail, getRegisteredMailboxes, registerMailbox,
  scanConnectedGmail, selectRegisteredMailbox
} from "@/src/lib/gmail-sync";
const PREFIX="submind.gmail.daily-sync.v2.";
const DAY=86400000;
export type SyncResult={email:string;status:"scanned"|"up_to_date"|"needs_authorisation"|"error";
  days:number;scanned:number;added:number;updated:number;review:number;duplicate:number;
  rejected:number;limited:boolean;message:string};
export type SyncReport={results:SyncResult[];completed_at:string};
const EMPTY={added:0,updated:0,review:0,duplicate:0};
let running:Promise<SyncReport>|null=null;
export async function lastGmailScan(email:string):Promise<number>{
  const value=await storage.getItem(PREFIX+email.toLowerCase(),0);
  return Number(value)||0;
}
export function autoSyncGmailOnLaunch(options:{
  force?:boolean;one?:string;initialDays?:number;onProgress?:(email:string,count:number)=>void
}={}):Promise<SyncReport>{
 if(running)return running;
 running=(async()=>{
   const now=Date.now(),list=await getRegisteredMailboxes();
   const current=await getConnectedGmail().catch(()=>null);
   if(current&&!list.includes(current)&&list.length<3)await registerMailbox(current);
   const registered=await getRegisteredMailboxes();
   const selection=options.one?registered.filter(e=>e===options.one!.toLowerCase()):registered;
   const results:SyncResult[]=[];
   for(const email of selection){
     const previous=await lastGmailScan(email);
     const days=options.force&&options.initialDays?
       Math.min(30,Math.max(1,options.initialDays)):
       previous?Math.min(30,Math.max(7,Math.ceil((now-previous)/DAY)+2)):
       7;
     if(!options.force&&previous&&now-previous<DAY){
       results.push({email,status:"up_to_date",days,scanned:0,...EMPTY,
         rejected:0,limited:false,message:"Already scanned within the last 24 hours"});
       continue;
     }
     try{
       // Native GoogleSignin supports a single active Google identity.
       // Only proceed if we can verify this exact mailbox.
       const active=await getConnectedGmail();
       const selected=active===email?email:await selectRegisteredMailbox(email);
       if(selected!==email){
         results.push({email,status:"needs_authorisation",days,scanned:0,...EMPTY,
           rejected:0,limited:false,message:"Reconnect this Google account to restore permission"});
         continue;
       }
       const scan=await scanConnectedGmail({expectedEmail:email,days,limit:240,
         onProgress:n=>options.onProgress?.(email,n)});
       const saved=await api.smartSyncMail(email,scan.candidates,{
         days,messages_scanned:scan.messages_scanned,limited:scan.limited
       });
       // If the search hit a cap, a bounded scan is incomplete: do not
       // claim the checkpoint has been fully covered.
       if(!scan.limited){
         if(!await storage.setItem(PREFIX+email,Date.now()))
           throw Error("Could not persist Gmail scan checkpoint");
       }
       results.push({email,status:"scanned",days,scanned:scan.messages_scanned,
         added:saved.added,updated:saved.updated,review:saved.review,
         duplicate:saved.duplicate,rejected:scan.rejected,
         limited:scan.limited,message:scan.limited?
           "Scan limit reached; partial results saved, checkpoint not advanced":"Daily scan completed"});
     }catch(error:any){
       results.push({email,status:"error",days,scanned:0,...EMPTY,
         rejected:0,limited:false,message:String(error?.message||error)});
     }
   }
   return{results,completed_at:new Date().toISOString()};
 })().finally(()=>{running=null});
 return running;
}
