import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { api, useInvalidateAll, usePromoCodes, usePromoFindings, usePromoSources } from "@/src/lib/api";
import { expiryFromText } from "@/src/lib/vault-intelligence";
import { METRO, MetroBrand, MetroTile } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";
import { key } from "@/src/lib/direct-providers";

type Mode="saved"|"sources"|"discover";
const MODES:{id:Mode;title:string}[]=[{id:"saved",title:"SAVED"},{id:"sources",title:"MONITOR"},{id:"discover",title:"DISCOVER"}];
const OFFER_RE=/(?:promo|discount|coupon|giveaway|offer|free credits?|free trial|voucher|limited time|deal|sale|redeem|save \d+%)/i;
const card:any={backgroundColor:"#1A1D28",borderWidth:1,borderColor:"#34394C",borderRadius:13,padding:15,gap:11};
const dim:any={color:"#A7AFBD",fontSize:12,lineHeight:19};
const input:any={backgroundColor:"#292C39",borderRadius:9,paddingHorizontal:13,paddingVertical:13,color:"#FFFFFF",fontSize:14};
const btn=(backgroundColor:string):any=>({backgroundColor,paddingHorizontal:15,paddingVertical:14,borderRadius:9,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8});
function remaining(date:unknown):number|null {
 if(!date||!/^\d{4}-\d\d-\d\d$/.test(String(date)))return null;
 const t=Date.parse(String(date)+"T00:00:00Z");if(!Number.isFinite(t))return null;
 const now=new Date();const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
 return Math.round((t-today)/86400000);
}
export default function PromoVault() {
 const router=useRouter(),insets=useSafeAreaInsets(),invalidate=useInvalidateAll();
 const codes=usePromoCodes(),sources=usePromoSources(),findings=usePromoFindings();
 const [mode,setMode]=useState<Mode>("saved");
 const [provider,setProvider]=useState("");
 const [keywords,setKeywords]=useState("");
 const [q,setQ]=useState("");
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [results,setResults]=useState<any[]>([]);
 const [scannedSources,setScannedSources]=useState<string[]>([]);
 const sourceList=sources.data||[],codeList=codes.data||[],findingList=findings.data||[];
 const expiring=[...codeList,...findingList].filter((x:any)=>{
  const days=remaining(x.expiry_date||x.expires_at||x.valid_until);
  return days!==null&&days>=0&&days<=7;
 }).length;
 const saved=useMemo(()=>[...codeList.map((c:any)=>({...c,kind:"coupon"})),...findingList.map((f:any)=>({...f,kind:"finding"}))]
   .filter((x:any)=>!q.trim()||[x.provider,x.title,x.code,x.description,x.discount_text].join(" ").toLowerCase().includes(q.toLowerCase()))
   .sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))),[codeList,findingList,q]);
 const refresh=()=>{invalidate();codes.refetch();sources.refetch();findings.refetch()};
 const addSource=async()=>{
  if(!provider.trim())return;
  setBusy("add");
  try {
    await api.addPromoSource({provider:provider.trim(),keywords:keywords.trim()});
    setProvider("");setKeywords("");refresh();setMessage("Monitoring source saved. Scan it whenever you want fresh offers.");
  }catch(e:any){Alert.alert("Cannot save source",e.message)}
  finally{setBusy("")}
 };
 const removeSource=(s:any)=>Alert.alert("Remove monitoring source?","Existing saved offers will stay in your Promo Vault.",[
  {text:"Cancel",style:"cancel"},{text:"Remove",style:"destructive",onPress:async()=>{await api.deletePromoSource(s.id);refresh();}}
 ]);
 const saveResults=async (items:any[],source:any)=>{
  let count=0;
  for(const item of items.slice(0,12)){
    const description=String(item.description||"");
    const title=String(item.title||"");
    if(!OFFER_RE.test(title+" "+description))continue;
    const url=String(item.url||"");
    if(!/^https?:\/\//i.test(url))continue;
    try{
      const result=await api.savePromoFinding({provider:source.provider,
        title:title.slice(0,220),description:description.slice(0,700),
        source_url:url,source_name:source.provider,source_id:source.id,expiry_date:expiryFromText(title+" "+description),
        checked_at:new Date().toISOString(),verification:"unverified",is_giveaway:/giveaway|free credits?/i.test(title+" "+description)});
      if(!result.duplicate)count++;
    }catch{ /* Skip individually invalid URLs without losing the remainder. */ }
  }
  return count;
 };
 const scanSource=async (source:any)=>{
   setBusy(source.id);setMessage("Checking "+source.provider+"…");setResults([]);
   try{
     const brave=await key("brave");
     if(!brave)throw Error("Add a working Brave Search API key under Settings → API Keys before monitoring sources.");
     const query=[source.provider,source.keywords,"promotions discounts giveaways coupon offers"].filter(Boolean).join(" ");
     const data=await api.dealsSearch(query);
     const items=data.items||[];
     const added=await saveResults(items,source);
     setResults(items);
     setScannedSources(v=>[source.id,...v.filter(x=>x!==source.id)]);
     await api.updatePromoSource(source.id,{last_checked_at:new Date().toISOString(),last_result_count:items.length});
     refresh();
     setMessage(items.length+" results checked for "+source.provider+". "+added+" new source-backed offers saved for review. All offers remain unverified.");
     setMode("discover");
   }catch(e:any){Alert.alert("Monitoring unavailable",e.message||String(e));setMessage("The scan could not complete.");}
   finally{setBusy("")}
 };
 const scanAll=async()=>{
   if(!sourceList.length)return;
   setBusy("all");setMessage("Scanning selected sources sequentially…");setResults([]);
   try{
     if(!await key("brave"))throw Error("Configure a Brave Search API key first.");
     let checked=0,added=0;const all:any[]=[];
     for(const source of sourceList.filter((s:any)=>s.enabled!==false).slice(0,6)){
       const data=await api.dealsSearch([source.provider,source.keywords,"giveaway discount promo offers"].filter(Boolean).join(" "));
       const items=data.items||[];checked++;
       added+=await saveResults(items,source);all.push(...items);
       await api.updatePromoSource(source.id,{last_checked_at:new Date().toISOString(),last_result_count:items.length});
     }
     setResults(all.slice(0,50));setMessage("Checked "+checked+" sources; "+added+" new offers saved (unverified).");setMode("discover");refresh();
   }catch(e:any){Alert.alert("Some scans did not complete",e.message||String(e));refresh();}
   finally{setBusy("")}
 };
 const openSource=(raw:string)=>{
  if(/^https?:\/\//i.test(raw))WebBrowser.openBrowserAsync(raw).catch(e=>Alert.alert("Open failed",String(e)));
 };
 const remainingLabel=(date:any)=>{
   const d=remaining(date);
   return d===null?"Expiry not confirmed":d<0?"Expired "+Math.abs(d)+" days ago":d===0?"Expires today":d<=7?"Expires in "+d+" days":"Expires "+String(date);
 };
 return <View style={{flex:1,backgroundColor:METRO.black}}>
  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{paddingTop:insets.top+10,paddingHorizontal:15,paddingBottom:insets.bottom+55,gap:13}}>
   <Pressable onPress={()=>router.back()} style={{flexDirection:"row",alignItems:"center",gap:10}}>
     <Icon name="arrow-left" color={METRO.white} size={26}/><MetroBrand word="PROMO VAULT"/>
   </Pressable>
   <Text style={{...dim,letterSpacing:0.2}}>Offers, giveaways, redeemable codes and expiry dates. Every source stays visible.</Text>
   <View style={{flexDirection:"row",gap:8}}>
     <MetroTile title="CODES" value={codeList.length} color={METRO.purple} height={143} style={{flex:1}} onPress={()=>setMode("saved")}/>
     <MetroTile title="OFFERS" value={findingList.length} color={METRO.pink} height={143} style={{flex:1}} onPress={()=>setMode("saved")}/>
     <MetroTile title="ENDING SOON" value={expiring} color={METRO.orange} textColor={METRO.ink} height={143} style={{flex:1}} onPress={()=>setMode("saved")}/>
   </View>
   <View style={{flexDirection:"row",gap:7}}>
    {MODES.map(tab=><Pressable key={tab.id} onPress={()=>setMode(tab.id)}
      style={{flex:1,alignItems:"center",paddingVertical:13,borderRadius:8,backgroundColor:mode===tab.id?METRO.purple:"#232636"}}>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>{tab.title}</Text>
    </Pressable>)}
   </View>
   {message?<Text style={{color:METRO.cyan,fontSize:12,lineHeight:18}}>{message}</Text>:null}
   {mode==="sources"?<>
      <View style={card}>
       <Text style={{color:METRO.white,fontWeight:"900",fontSize:20}}>MONITOR A SOURCE</Text>
       <Text style={dim}>Track a provider, specific website or offer category. A live search is performed only when you tap Scan. It doesn't continuously run while the app is closed.</Text>
       <TextInput value={provider} onChangeText={setProvider} style={input} placeholder="Provider e.g. Higgsfield, Replit, Seedance" placeholderTextColor="#9AA0AE"/>
       <TextInput value={keywords} onChangeText={setKeywords} style={input} placeholder="Keywords, optional: student, 50%, free credits" placeholderTextColor="#9AA0AE"/>
       <Pressable disabled={!provider.trim()||!!busy} onPress={addSource} style={btn(METRO.green)}>
        <Icon name="plus-circle" color={METRO.white} size={19}/><Text style={{color:METRO.white,fontWeight:"900"}}>ADD MONITOR</Text>
       </Pressable>
      </View>
      {sourceList.length>0?<Pressable disabled={!!busy} onPress={scanAll} style={btn(METRO.cobalt)}>
       {busy==="all"?<ActivityIndicator color={METRO.white}/>:<Icon name="radar" color={METRO.white} size={21}/>}
       <Text style={{color:METRO.white,fontWeight:"900"}}>{busy==="all"?"SCANNING…":"SCAN ALL SOURCES (UP TO 6)"}</Text>
      </Pressable>:null}
      {sourceList.length===0?<View style={card}><Text style={dim}>No sources yet. Add the platforms you want to monitor. You can edit your list any time.</Text></View>:sourceList.map((s:any)=>
        <View key={s.id} style={card}>
          <View style={{flexDirection:"row",alignItems:"center",gap:10}}>
           <View style={{backgroundColor:"#452B5A",padding:12,borderRadius:10}}><Icon name="radar" color="#E6B5FF" size={26}/></View>
           <View style={{flex:1}}>
             <Text style={{color:METRO.white,fontWeight:"900",fontSize:17}}>{s.provider}</Text>
             <Text style={dim}>{s.keywords||"Offers, promo codes, giveaways"}</Text>
             <Text style={{color:METRO.dim,fontSize:11}}>Last check: {s.last_checked_at?new Date(s.last_checked_at).toLocaleString():"Not checked"}</Text>
           </View>
          </View>
          <View style={{flexDirection:"row",gap:8}}>
           <Pressable disabled={!!busy} onPress={()=>scanSource(s)} style={{...btn(METRO.purple),flex:1}}>
            {busy===s.id?<ActivityIndicator color={METRO.white}/>:<Icon name="magnify-scan" color={METRO.white} size={20}/>}
            <Text style={{color:METRO.white,fontWeight:"900"}}>{busy===s.id?"CHECKING…":"SCAN OFFERS"}</Text>
           </Pressable>
           <Pressable disabled={!!busy} onPress={()=>removeSource(s)} style={btn("#303342")}>
            <Icon name="trash-can-outline" color="#FFABB4" size={19}/>
           </Pressable>
          </View>
        </View>
      )}
   </>:null}
   {mode==="saved"?<>
     <TextInput value={q} onChangeText={setQ} placeholder="Search codes, providers or saved offers…" placeholderTextColor="#9299A8" style={input}/>
     <Text style={{color:METRO.dim,fontSize:12}}>{saved.length} SAVED ITEMS · UNVERIFIED UNTIL CHECKED AT SOURCE</Text>
     {!saved.length?<View style={card}>
       <Icon name="ticket-percent-outline" size={40} color={METRO.purple}/>
       <Text style={{color:METRO.white,fontSize:19,fontWeight:"900"}}>YOUR PROMO COLLECTION</Text>
       <Text style={dim}>Gmail promotions and discovered offers appear here after scanning. Use Monitor to add selected providers or Discover to browse current offers.</Text>
       <Pressable onPress={()=>setMode("sources")} style={btn(METRO.purple)}><Text style={{color:METRO.white,fontWeight:"900"}}>ADD A SOURCE</Text></Pressable>
     </View>:saved.map((c:any)=><View key={c.id+"-"+c.kind} style={{...card,borderColor:c.kind==="coupon"?"#6B3F8A":"#6A3151"}}>
       <View style={{flexDirection:"row",gap:10,alignItems:"center"}}>
        <Icon name={c.kind==="coupon"?"ticket-percent":"gift-outline"} size={25} color={c.kind==="coupon"?METRO.purple:METRO.pink}/>
        <Text style={{color:METRO.white,flex:1,fontSize:17,fontWeight:"900"}}>{c.provider||c.title||"Saved offer"}</Text>
        <Text style={{color:"#FFC0C2",fontSize:10,fontWeight:"900"}}>UNVERIFIED</Text>
       </View>
       {c.kind==="finding"&&c.title?<Text style={{color:METRO.white,fontWeight:"700",fontSize:14,lineHeight:19}}>{c.title}</Text>:null}
       {c.code?<Pressable onPress={()=>Clipboard.setStringAsync(c.code)} style={{backgroundColor:"#29283A",padding:13,borderRadius:8,flexDirection:"row",justifyContent:"space-between"}}>
        <Text style={{color:"#E2B5FA",fontSize:18,fontWeight:"900",letterSpacing:1}}>{c.code}</Text><Icon name="content-copy" color={METRO.cyan}/>
       </Pressable>:null}
       {c.discount_text||c.description?<Text style={dim}>{c.discount_text||c.description}</Text>:null}
       <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
         <Icon name="calendar-alert-outline" color={remaining(c.expiry_date||c.expires_at||c.valid_until)!==null&&remaining(c.expiry_date||c.expires_at||c.valid_until)!<=7?METRO.orange:METRO.dim} size={18}/>
         <Text style={{color:METRO.orange,fontSize:12,fontWeight:"800"}}>{remainingLabel(c.expiry_date||c.expires_at||c.valid_until)}</Text>
       </View>
       <Text style={{color:METRO.dim,fontSize:11}}>Source: {c.source_name||c.source||"unknown"} · {String(c.created_at||"").slice(0,10)}</Text>
       {c.source_url?<Pressable onPress={()=>openSource(c.source_url)} style={btn("#303E57")}>
        <Icon name="open-in-new" color={METRO.cyan} size={20}/>
        <Text style={{color:METRO.white,fontWeight:"900"}}>VERIFY SOURCE & TERMS</Text>
       </Pressable>:null}
     </View>)}
     <Pressable onPress={()=>setMode("sources")} style={btn("#292A37")}><Icon name="radar" color={METRO.cyan}/><Text style={{color:METRO.white,fontWeight:"900"}}>MANAGE MONITORED SOURCES</Text></Pressable>
   </>:null}
   {mode==="discover"?<>
     <View style={card}>
       <Text style={{color:METRO.white,fontSize:18,fontWeight:"900"}}>SEARCH LIVE OFFERS</Text>
       <Text style={dim}>Requires your Brave Search API key. Search results can be outdated or misleading; verify prices, eligibility and actual redemption at checkout.</Text>
       <Pressable onPress={()=>router.push("/deals")} style={btn(METRO.cyan)}>
        <Icon name="magnify" color={METRO.ink} size={20}/><Text style={{color:METRO.ink,fontWeight:"900"}}>FIND PLANS & CODES</Text>
       </Pressable>
       <Pressable onPress={()=>router.push("/gmail-sync")} style={btn("#3F324A")}>
        <Icon name="gmail" color={METRO.white} size={20}/><Text style={{color:METRO.white,fontWeight:"900"}}>SCAN MY GMAIL OFFERS</Text>
       </Pressable>
     </View>
     <Text style={{color:METRO.white,fontWeight:"900",fontSize:16}}>RECENT SCAN RESULTS</Text>
     {results.length===0?<Text style={dim}>Scan one or more monitored sources to populate recent results and save relevant offers in the vault.</Text>:results.slice(0,28).map((r:any,i:number)=>
       <Pressable key={String(r.url||"")+i} onPress={()=>openSource(String(r.url||""))} style={card}>
         <Text style={{color:METRO.white,fontWeight:"800",fontSize:15}}>{r.title}</Text>
         <Text style={dim} numberOfLines={3}>{r.description}</Text>
         <View style={{flexDirection:"row",gap:9,alignItems:"center"}}>
           <Text style={{color:METRO.pink,fontWeight:"800",fontSize:11}}>WEB RESULT · UNVERIFIED</Text>
           <Icon name="open-in-new" color={METRO.cyan} size={17}/>
         </View>
       </Pressable>)}
   </>:null}
   <Text style={{...dim,fontSize:10,textAlign:"center"}}>Search requires a connected API key and an internet connection. Continuous monitoring needs an optional automation. Offers never count as verified until you confirm them.</Text>
  </ScrollView>
 </View>;
}
