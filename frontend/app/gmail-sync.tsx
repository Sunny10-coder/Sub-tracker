import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { METRO, MetroBrand } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";
import { useInvalidateAll, useMailboxes, useReviewQueue } from "@/src/lib/api";
import { connectGmail, disconnectGmail, forgetMailbox, getConnectedGmail, getRegisteredMailboxes } from "@/src/lib/gmail-sync";
import { autoSyncGmailOnLaunch, lastGmailScan, type SyncReport } from "@/src/lib/automatic-mail-sync";

const card:any={padding:16,backgroundColor:"#1B1D29",borderRadius:15,borderWidth:1,borderColor:"#333849",gap:12};
const muted:any={color:"#9FAEC0",fontSize:12,lineHeight:19};
const button=(color:string):any=>({padding:14,borderRadius:10,backgroundColor:color,
 flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8});
export default function GmailSync(){
 const router=useRouter(),insets=useSafeAreaInsets(),invalidate=useInvalidateAll();
 const [registered,setRegistered]=useState<string[]>([]);
 const [active,setActive]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState<{email:string;count:number}|null>(null);
 const [status,setStatus]=useState<SyncReport|null>(null);
 const [notice,setNotice]=useState("SubMind checks your authorised Gmail accounts when the app is open. No sorting or approving required for clear evidence.");
 const [lastSeen,setLastSeen]=useState<Record<string,number>>({});
 const {data:mailboxes=[]}=useMailboxes();
 const {data:review=[]}=useReviewQueue();
 const refresh=async()=>{
   const [list,email]=await Promise.all([getRegisteredMailboxes(),getConnectedGmail().catch(()=>null)]);
   setRegistered(list);setActive(email);const times:Record<string,number>={};
   for(const address of list)times[address]=await lastGmailScan(address);
   setLastSeen(times);
 };
 const run=async(options:{force?:boolean;one?:string;initialDays?:number}={})=>{
   setBusy(true);setProgress(null);
   try{
     const report=await autoSyncGmailOnLaunch({...options,
       onProgress:(email,count)=>setProgress({email,count})});
     setStatus(report);
     const totals=report.results.reduce((a,x)=>({
       added:a.added+x.added,updated:a.updated+x.updated,
       review:a.review+x.review
     }),{added:0,updated:0,review:0});
     setNotice(totals.added+" added · "+totals.updated+" updated · "+
       totals.review+" doubtful for later review. No duplicate subscriptions created.");
     invalidate();await refresh();
   }catch(e:any){setNotice("Could not finish Gmail sync: "+String(e?.message||e));}
   finally{setBusy(false);setProgress(null)}
 };
 useEffect(()=>{
   let live=true;
   Promise.all([getRegisteredMailboxes(),getConnectedGmail().catch(()=>null)]).then(async([list,email])=>{
     if(!live)return;
     setRegistered(list);setActive(email);
     if(email||list.length)await run();
   }).catch(e=>{if(live)setNotice(String(e?.message||e))});
   return()=>{live=false};
 },[]);
 const add=async()=>{
   setBusy(true);
   try{
     const email=await connectGmail(true);
     await refresh();
     setNotice(email+" authorised. Scanning the most recent seven days.");
     await run({one:email,force:true,initialDays:7});
   }catch(e:any){Alert.alert("Connect Gmail",String(e?.message||e));}
   finally{setBusy(false)}
 };
 const remove=(email:string)=>Alert.alert("Stop scanning "+email+"?",
   "SubMind will stop future scans of this account. It will not delete your saved subscriptions, promotional codes or email messages.",
   [{text:"Cancel",style:"cancel"},{text:"Remove from sync",style:"destructive",
     onPress:async()=>{try{
       await forgetMailbox(email);
       if(active===email)await disconnectGmail();
       await refresh();setStatus(null);
     }catch(e:any){Alert.alert("Could not remove mailbox",String(e?.message||e))}}}]);
 const list=registered.length?registered:active?[active]:[];
 return <View style={{flex:1,backgroundColor:METRO.black}}>
  <ScrollView contentContainerStyle={{paddingTop:insets.top+12,paddingHorizontal:15,
    paddingBottom:insets.bottom+85,gap:13}}>
    <Pressable onPress={()=>router.back()} style={{flexDirection:"row",alignItems:"center",gap:9}}>
      <Icon name="arrow-left" size={26} color={METRO.white}/>
      <MetroBrand word="GMAIL SYNC"/>
    </Pressable>
    <Text style={muted}>Read-only Gmail permission. Message content is classified on your phone; saved results are kept in SubMind's private local vault.</Text>
    <View style={{...card,backgroundColor:"#19273A",borderColor:"#34557C"}}>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:24}}>THREE MAILBOXES. ONE VAULT.</Text>
      <Text style={{color:METRO.dim,fontSize:13,lineHeight:20}}>Authorise each address once. SubMind attempts to scan all three sequentially and verifies the Google identity before reading any message.</Text>
      <View style={{flexDirection:"row",gap:9}}>
        {[0,1,2].map(i=><View key={i} style={{height:8,flex:1,borderRadius:5,
          backgroundColor:i<registered.length?METRO.green:"#475269"}}/>)}
      </View>
      <Text style={{color:METRO.cyan,fontWeight:"900",fontSize:15}}>{registered.length} / 3 registered Google accounts</Text>
      {registered.length<3?<Pressable disabled={busy} onPress={add} style={button(METRO.cyan)}>
        <Icon name="plus" size={22} color={METRO.ink}/>
        <Text style={{color:METRO.ink,fontWeight:"900"}}>{registered.length?"AUTHORISE ANOTHER GMAIL":"AUTHORISE FIRST GMAIL"}</Text>
      </Pressable>:null}
    </View>
    {list.map(email=>{
      const info=mailboxes.find((m:any)=>String(m.email).toLowerCase()===email);
      const latest=status?.results.find(x=>x.email===email);
      const previous=lastSeen[email]||0;
      return <View key={email} style={card}>
        <View style={{flexDirection:"row",alignItems:"center",gap:11}}>
          <Icon name="gmail" color="#F4888C" size={25}/>
          <View style={{flex:1,gap:3}}>
            <Text style={{color:METRO.white,fontWeight:"900",fontSize:14}}>{email}</Text>
            <Text style={muted}>Last complete scan: {previous?new Date(previous).toLocaleString():"Not yet completed"}</Text>
          </View>
          <Pressable onPress={()=>remove(email)} accessibilityLabel={"Remove "+email} disabled={busy}>
            <Icon name="close-circle-outline" color="#BDA5AD" size={22}/>
          </Pressable>
        </View>
        <Text style={{color:latest?.status==="error"||latest?.status==="needs_authorisation"?METRO.orange:METRO.green,
          fontWeight:"800",fontSize:12}}>
          {latest?latest.status==="needs_authorisation"?"Reconnect needed · tap Authorise another Gmail and choose this account":
           latest.message:info?.last_synced_at?"Stored scan history available":"Awaiting first scan"}
        </Text>
        {latest&&latest.status==="scanned"?<Text style={muted}>
          {latest.scanned} checked · {latest.added} added · {latest.updated} updated · {latest.review} for review
        </Text>:null}
        <Pressable disabled={busy} onPress={async()=>{
          try{const selected=await connectGmail(true);await refresh();
            if(selected!==email){setNotice("You selected "+selected+". Choose "+email+" to reconnect this mailbox.");return;}
            await run({one:email,force:true,initialDays:7});
          }catch(e:any){Alert.alert("Gmail access",String(e?.message||e))}
        }} style={{alignSelf:"flex-start",padding:8}}>
          <Text style={{color:METRO.cyan,fontSize:11,fontWeight:"900"}}>RECONNECT / SCAN THIS ACCOUNT</Text>
        </Pressable>
      </View>;
    })}
    <View style={card}>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:19}}>DAILY INTELLIGENCE</Text>
      <Text style={muted}>By default SubMind scans the last 7 days, once daily per authorised mailbox while the app is running. Overlap catches delayed emails and message IDs prevent duplication. After an extended absence it checks up to 30 days.</Text>
      <View style={{flexDirection:"row",gap:9}}>
        <Pressable disabled={busy||!registered.length} onPress={()=>run({force:true,initialDays:7})}
          style={{...button(METRO.green),flex:1}}>
          {busy?<ActivityIndicator color={METRO.white}/>:<Icon name="refresh" color={METRO.white}/>}
          <Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>{busy?"SCANNING":"SCAN 7 DAYS"}</Text>
        </Pressable>
        <Pressable disabled={busy||!registered.length} onPress={()=>run({force:true,initialDays:30})}
          style={{...button("#36405B"),flex:1}}>
          <Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>30-DAY CATCH-UP</Text>
        </Pressable>
      </View>
      {progress?<Text style={{color:METRO.cyan,fontSize:12}}>Checking {progress.email} · {progress.count} messages</Text>:null}
      <Text style={muted}>{notice}</Text>
    </View>
    <Pressable onPress={()=>router.push("/mail-review")} style={{...card,
      borderColor:METRO.purple+"AA",flexDirection:"row",alignItems:"center",gap:13}}>
      <Icon name="clipboard-text-clock-outline" color={METRO.purple} size={32}/>
      <View style={{flex:1}}>
        <Text style={{color:METRO.white,fontWeight:"900",fontSize:17}}>REVIEW WHEN FREE</Text>
        <Text style={muted}>{review.length} doubtful matches · grouped by day · last 7 days or all</Text>
      </View>
      <Icon name="chevron-right" size={23} color={METRO.purple}/>
    </Pressable>
    <Text style={{...muted,fontSize:11,textAlign:"center"}}>Read-only access. No emails are deleted. Google sign-in supports one current native session; if Android cannot silently restore another account, it will be flagged for reconnection rather than reading the wrong inbox. Fully closed-app monitoring is not provided.</Text>
  </ScrollView>
 </View>;
}
