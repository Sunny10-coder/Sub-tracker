import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { METRO, MetroBrand, MetroTile } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";
import { api, useInvalidateAll, useMailboxes, useReviewQueue } from "@/src/lib/api";
import { connectGmail, disconnectGmail, getConnectedGmail, scanConnectedGmail } from "@/src/lib/gmail-sync";
import type { MailType } from "@/src/lib/gmail-classifier";

export default function GmailSync() {
  const router = useRouter();const insets = useSafeAreaInsets();
  const [connected, setConnected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("Sign in to Gmail to scan only the messages relevant to your accounts, billing and offers.");
  const [days, setDays] = useState(180);
  const [kinds,setKinds]=useState<MailType[]>(["subscription","account","promo"]);
  const {data:mailboxes=[]} = useMailboxes();
  const {data:queue=[]} = useReviewQueue();
  const invalidate = useInvalidateAll();
  useEffect(() => { getConnectedGmail().then(setConnected).catch(() => setConnected(null)); }, []);
  const login = async (switchAccount=false) => {
    setBusy(true);
    try {
      const email = await connectGmail(switchAccount);
      setConnected(email);setNotice("Connected to " + email + ". Tap Scan Gmail to import candidates for review.");
    } catch (e:any) { Alert.alert("Google sign-in", e.message || String(e)); }
    finally { setBusy(false); }
  };
  const cleanup = () => Alert.alert("Remove old irrelevant Gmail suggestions?",
    "This removes unreviewed suggestions from the previous broad Gmail parser. Approved accounts, subscriptions, promotions and your original emails remain untouched.",[
    {text:"Cancel",style:"cancel"},
    {text:"Remove old suggestions",style:"destructive",onPress:async()=>{
      try{const result=await api.cleanupLegacyMail();invalidate();setNotice(result.removed+" old unreviewed suggestions cleared. Your approved records were preserved.");}
      catch(e:any){Alert.alert("Cleanup failed",e.message||String(e))}
    }}
  ]);
  const logout = () => Alert.alert("Disconnect Gmail?", "SubMind will stop reading this account. Previously approved records remain on this phone.", [
    {text:"Cancel",style:"cancel"}, {text:"Disconnect",onPress:async()=>{try{await disconnectGmail();setConnected(null);}catch(e:any){Alert.alert("Sign out failed",e.message)}}},
  ]);
  const scan = async () => {
    if(!connected)return;
    setBusy(true);setProgress(0);setNotice("Reading matching Gmail messages on this phone…");
    try {
      const result=await scanConnectedGmail({days,limit:days>=730?200:120,kinds,onProgress:setProgress});
      const imported=await api.autoSyncMail(result.email,result.candidates);
      invalidate();
      setNotice("Auto-organised: "+imported.accountsAdded+" accounts, "+imported.subscriptionsAdded+" subscriptions and "+imported.promosAdded+" promotions. "+imported.updated+" records updated, "+result.rejected+" unrelated emails ignored. No review required."
        +(result.limited?" Scan limit reached. Choose an older range or repeat when needed.":""));
    } catch (e:any) { Alert.alert("Gmail scan failed",e.message || String(e));setNotice("Scan incomplete. No unapproved records were automatically made active."); }
    finally { setBusy(false); }
  };
  const card: any = {padding:17,backgroundColor:"#17171D",borderRadius:14,borderWidth:1,borderColor:"#30303D",gap:12};
  const txt: any = {color:METRO.white};
  return <View style={{flex:1,backgroundColor:METRO.black}}>
    <ScrollView contentContainerStyle={{paddingTop:insets.top+14,paddingHorizontal:18,paddingBottom:insets.bottom+90,gap:15}}>
      <Pressable onPress={()=>router.back()} style={{flexDirection:"row",alignItems:"center",gap:10,marginBottom:3}}>
        <Icon name="arrow-left" color={METRO.white} size={25}/><MetroBrand word="GMAIL"/>
      </Pressable>
      <Text style={{color:METRO.dim,fontSize:13,lineHeight:19}}>Read-only Google access. Your original emails are never uploaded to SubMind servers; extracted fields are stored on this phone.</Text>
      <View style={card}>
        <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
          <View style={{backgroundColor:"#E94A48",padding:12,borderRadius:12}}><Icon name="gmail" size={27} color="#FFFFFF"/></View>
          <View style={{flex:1}}>
            <Text style={{color:METRO.white,fontSize:19,fontWeight:"900"}}>{connected?"CONNECTED MAILBOX":"CONNECT YOUR MAILBOX"}</Text>
            <Text style={{color:METRO.dim,marginTop:4,fontSize:13}}>{connected||"No Google account connected"}</Text>
          </View>
        </View>
        {!connected ?
          <Pressable disabled={busy} onPress={()=>login(false)} style={{backgroundColor:METRO.cyan,padding:14,borderRadius:8,alignItems:"center"}}>
            <Text style={{color:METRO.ink,fontWeight:"900"}}>CONNECT GOOGLE ACCOUNT</Text>
          </Pressable> :
          <View style={{flexDirection:"row",gap:10}}>
            <Pressable disabled={busy} onPress={()=>login(true)} style={{flex:1,borderWidth:1,borderColor:METRO.cyan,padding:12,alignItems:"center",borderRadius:8}}>
              <Text style={{color:METRO.cyan,fontWeight:"800"}}>SWITCH ACCOUNT</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={logout} style={{padding:12,borderWidth:1,borderColor:"#63636B",borderRadius:8}}>
              <Text style={txt}>DISCONNECT</Text>
            </Pressable>
          </View>}
      </View>
      <View style={card}>
        <Text style={{...txt,fontSize:18,fontWeight:"900"}}>SCAN SUBSCRIPTIONS & OFFERS</Text>
        <Text style={{color:METRO.dim,fontSize:12,lineHeight:19}}>Automatic precision mode: checks transactional evidence and ignores newsletters, routine receipts, login codes and incidental marketing text. Strong matches go directly into their correct vault.</Text>
        <View style={{flexDirection:"row",gap:7}}>
          {[30,180,730].map(d=><Pressable key={d} onPress={()=>setDays(d)} style={{flex:1,padding:11,borderRadius:7,alignItems:"center",backgroundColor:days===d?METRO.purple:"#262633"}}>
            <Text style={{color:METRO.white,fontWeight:"800",fontSize:12}}>{d===30?"30 DAYS":d===180?"6 MONTHS":"2 YEARS"}</Text>
          </Pressable>)}
        </View>
        <Text style={{color:METRO.white,fontWeight:"900",fontSize:13}}>ONLY SEARCH FOR</Text>
        <View style={{flexDirection:"row",gap:8,flexWrap:"wrap"}}>
          {([{id:"subscription",name:"RENEWALS & TRIALS"},{id:"account",name:"ACCOUNT CREATION"},{id:"promo",name:"OFFERS & CODES"}] as const).map(k=>
            <Pressable key={k.id} onPress={()=>setKinds(s=>s.includes(k.id)?s.filter(x=>x!==k.id):[...s,k.id])}
              style={{paddingHorizontal:11,paddingVertical:10,borderRadius:7,borderWidth:1,borderColor:kinds.includes(k.id)?METRO.green:"#4B4B56",
                backgroundColor:kinds.includes(k.id)?"#183D31":"#262633"}}>
              <Text style={{color:METRO.white,fontSize:11,fontWeight:"800"}}>{kinds.includes(k.id)?"✓ ":""}{k.name}</Text>
            </Pressable>)}
        </View>
        <Pressable disabled={!connected||busy||!kinds.length} onPress={scan} style={{backgroundColor:!connected||busy?"#39434A":METRO.green,padding:16,alignItems:"center",borderRadius:8,flexDirection:"row",justifyContent:"center",gap:10}}>
          {busy ? <ActivityIndicator color={METRO.white}/> : <Icon name="magnify-scan" color={METRO.white} size={24}/>}
          <Text style={{color:METRO.white,fontWeight:"900"}}>{busy?"READING "+progress+" MESSAGES":"SCAN GMAIL"}</Text>
        </Pressable>
        <Text style={{color:METRO.dim,fontSize:13,lineHeight:20}}>{notice}</Text>
      </View>
      <Pressable onPress={()=>router.push("/mail-review")} style={{backgroundColor:METRO.orange,padding:18,borderRadius:10,flexDirection:"row",alignItems:"center",gap:12}}>
        <Icon name="clipboard-check-outline" size={27} color={METRO.ink}/>
        <View style={{flex:1}}>
          <Text style={{color:METRO.ink,fontSize:19,fontWeight:"900"}}>{queue.length} TO REVIEW</Text>
          <Text style={{color:METRO.ink,fontSize:12}}>Confirm before saving to Accounts, Plans or Promo Vault</Text>
        </View>
        <Icon name="arrow-right" color={METRO.ink} size={22}/>
      </Pressable>
      <Pressable onPress={cleanup} disabled={busy} style={{padding:14,borderRadius:9,borderColor:"#805B3B",borderWidth:1,backgroundColor:"#33261F",flexDirection:"row",alignItems:"center",gap:10}}>
        <Icon name="broom" size={23} color={METRO.orange}/>
        <Text style={{color:METRO.white,fontWeight:"900",fontSize:12,flex:1}}>CLEAN UP OLD IRRELEVANT SUGGESTIONS</Text>
      </Pressable>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:18}}>PREVIOUS MAILBOX SCANS</Text>
      {mailboxes.length===0?<Text style={{color:METRO.dim}}>No mailboxes have been scanned yet.</Text>:mailboxes.map((m:any)=>
        <View key={m.email} style={{...card,padding:13,flexDirection:"row",alignItems:"center"}}>
          <Icon name="email-outline" color={METRO.cyan} size={23}/>
          <View style={{flex:1}}>
            <Text style={{color:METRO.white,fontWeight:"800"}}>{m.email}</Text>
            <Text style={{color:METRO.dim,fontSize:11,marginTop:4}}>Last scan {m.last_synced_at?new Date(m.last_synced_at).toLocaleString():"—"} · {m.last_scan_count||0} candidates</Text>
          </View>
        </View>)}
      <Text style={{color:METRO.dim,fontSize:11,lineHeight:17}}>One Android Google account is authorised at a time. Switch accounts to scan each mailbox. Scanning while the app is closed requires a separately configured cloud workflow. Gmail read-only permission is a restricted Google OAuth scope and may need verification for public distribution.</Text>
    </ScrollView>
  </View>;
}
