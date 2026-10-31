import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_SPACE } from "./(tabs)/_layout";
import { useAccounts, useMailboxes, useReviewQueue, useSubscriptions } from "@/src/lib/api";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand, MetroTile } from "@/src/components/metro-tiles";

const FILTERS=["All","With plans","Without plans","Expired plans"];
const BG="#090A0F";
export default function Accounts() {
 const router=useRouter();const insets=useSafeAreaInsets();
 const [filter,setFilter]=useState("All"),[search,setSearch]=useState("");
 const accounts=useAccounts(),subscriptions=useSubscriptions(),mailboxes=useMailboxes(),reviews=useReviewQueue();
 const data=accounts.data||[],subs=subscriptions.data||[];
 const active=data.filter((a:any)=>a.active_plans>0).length;
 const expiredAccounts=data.filter((a:any)=>subs.some((s:any)=>
   String(s.account_email||"").toLowerCase()===String(a.email||"").toLowerCase()&&
   String(s.provider||"").toLowerCase()===String(a.provider||"").toLowerCase()&&
   ["Expired","Cancelled"].includes(s.status))).length;
 const rows=useMemo(()=>data.filter((a:any)=>{
  const match=!search.trim()||[a.provider,a.email,a.status].join(" ").toLowerCase().includes(search.toLowerCase());
  if(!match)return false;
  if(filter==="With plans")return a.active_plans>0;
  if(filter==="Without plans")return !a.active_plans;
  if(filter==="Expired plans")return subs.some((s:any)=>String(s.account_email||"").toLowerCase()===String(a.email||"").toLowerCase()&&
    String(s.provider||"").toLowerCase()===String(a.provider||"").toLowerCase()&&["Expired","Cancelled"].includes(s.status));
  return true;
 }),[data,subs,search,filter]);
 const refreshing=[accounts,subscriptions,mailboxes,reviews].some(x=>x.isFetching);
 const refresh=()=>[accounts,subscriptions,mailboxes,reviews].forEach(x=>x.refetch());
 return <View style={{flex:1,backgroundColor:BG}}>
   <ScrollView showsVerticalScrollIndicator={false}
     refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={METRO.cyan}/>}
     contentContainerStyle={{paddingTop:insets.top+10,paddingHorizontal:14,paddingBottom:insets.bottom+TAB_BAR_SPACE,gap:13}}>
     <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
       <View><MetroBrand word="ACCOUNTS"/><Text style={{color:METRO.dim,fontSize:11,letterSpacing:1.6}}>ONE IDENTITY, EVERY PLAN & PERK</Text></View>
       <Pressable onPress={()=>router.push("/add-account")} accessibilityLabel="Add account" style={{backgroundColor:METRO.cyan,width:48,height:48,alignItems:"center",justifyContent:"center",borderRadius:12}}>
         <Icon name="plus" size={28} color={METRO.ink}/>
       </Pressable>
     </View>
     <View style={{flexDirection:"row",gap:8}}>
       <MetroTile title="ACCOUNTS" value={data.length} color={METRO.cyan} textColor={METRO.ink} height={148} style={{flex:1}} onPress={()=>setFilter("All")}/>
       <MetroTile title="WITH PLANS" value={active} color={METRO.green} height={148} style={{flex:1}} onPress={()=>setFilter("With plans")}/>
       <MetroTile title="PAST PLANS" value={expiredAccounts} color={METRO.purple} height={148} style={{flex:1}} onPress={()=>setFilter("Expired plans")}/>
     </View>
     <Pressable onPress={()=>router.push("/gmail-sync")} style={{backgroundColor:"#283547",borderWidth:1,borderColor:"#42617D",padding:15,borderRadius:11,
       flexDirection:"row",alignItems:"center",gap:12}}>
       <Icon name="gmail" size={31} color="#FF8689"/>
       <View style={{flex:1,gap:4}}>
         <Text style={{color:METRO.white,fontWeight:"900",fontSize:16}}>DISCOVER ACCOUNTS WITH GMAIL</Text>
         <Text style={{color:"#A9BECF",fontSize:12}}>{mailboxes.data?.length||0} mailboxes scanned · {reviews.data?.length||0} records awaiting review</Text>
       </View>
       <Icon name="arrow-right" color={METRO.cyan} size={22}/>
     </Pressable>
     <View style={{backgroundColor:"#1C2130",borderRadius:11,paddingHorizontal:13,flexDirection:"row",alignItems:"center",gap:9}}>
       <Icon name="magnify" color="#95A3B6" size={21}/>
       <TextInput placeholder="Search a service or sign-in email" placeholderTextColor="#8994A4" value={search} onChangeText={setSearch}
         style={{color:METRO.white,flex:1,paddingVertical:15,fontSize:14,autoCapitalize:"none"} as any}/>
     </View>
     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
       {FILTERS.map(f=><Pressable key={f} onPress={()=>setFilter(f)}
         style={{paddingHorizontal:14,paddingVertical:11,backgroundColor:filter===f?METRO.cobalt:"#252A37",borderRadius:8}}>
         <Text style={{color:METRO.white,fontSize:12,fontWeight:"900"}}>{f.toUpperCase()}</Text>
       </Pressable>)}
     </ScrollView>
     <Text style={{color:METRO.white,fontWeight:"900",fontSize:17}}>{rows.length} MATCHING ACCOUNTS</Text>
     {rows.length===0?<View style={{backgroundColor:"#191C25",borderWidth:1,borderColor:"#343C4D",padding:25,borderRadius:14,alignItems:"center",gap:12}}>
       <Icon name="account-key-outline" size={45} color={METRO.cyan}/>
       <Text style={{color:METRO.white,fontSize:19,fontWeight:"900"}}>NO ACCOUNTS YET</Text>
       <Text style={{color:METRO.dim,textAlign:"center",lineHeight:20}}>Create an account record or scan Gmail for account-creation emails. Expired subscriptions can stay linked to their original accounts.</Text>
       <Pressable onPress={()=>router.push("/add-account")} style={{backgroundColor:METRO.cyan,padding:14,borderRadius:9}}>
         <Text style={{color:METRO.ink,fontWeight:"900"}}>ADD ACCOUNT</Text>
       </Pressable>
     </View>:rows.map((a:any,i:number)=>{
       const accent=[METRO.cyan,METRO.purple,METRO.green,METRO.orange][i%4];
       const linkedPlans=subs.filter((s:any)=>String(s.account_email||"").toLowerCase()===String(a.email||"").toLowerCase()&&
         String(s.provider||"").toLowerCase()===String(a.provider||"").toLowerCase());
       return <Pressable key={a.id} onPress={()=>router.push({pathname:"/account/[id]",params:{id:a.id}})}
         style={{backgroundColor:"#1B1E28",borderRadius:12,overflow:"hidden",borderWidth:1,borderColor:"#363B4D"}}>
         <View style={{flexDirection:"row",gap:12,padding:15,alignItems:"center"}}>
           <View style={{width:53,height:53,borderRadius:12,backgroundColor:accent+"30",alignItems:"center",justifyContent:"center",
             borderWidth:1,borderColor:accent+"80"}}>
             <Icon name="account-key-outline" size={28} color={accent}/>
           </View>
           <View style={{flex:1,gap:5}}>
             <Text numberOfLines={1} style={{color:METRO.white,fontSize:17,fontWeight:"900"}}>{a.provider}</Text>
             <Text numberOfLines={1} style={{color:"#AEB8C9",fontSize:12}}>{a.email}</Text>
             <View style={{flexDirection:"row",gap:10}}>
               <Text style={{color:accent,fontSize:11,fontWeight:"800"}}>{a.active_plans||0} ACTIVE</Text>
               <Text style={{color:METRO.dim,fontSize:11}}>{linkedPlans.length} TOTAL PLANS</Text>
             </View>
           </View>
           <Icon name="chevron-right" size={22} color={METRO.dim}/>
         </View>
         {linkedPlans.length?<View style={{borderTopWidth:1,borderColor:"#343B49",flexDirection:"row",paddingHorizontal:15,paddingVertical:10,gap:8,flexWrap:"wrap"}}>
           {linkedPlans.slice(0,3).map((s:any)=><View key={s.id} style={{backgroundColor:"#2D3341",paddingHorizontal:9,paddingVertical:6,borderRadius:6}}>
             <Text style={{color:METRO.white,fontSize:10,fontWeight:"800"}}>{s.plan||"Plan"} · {s.status}</Text>
           </View>)}
         </View>:null}
       </Pressable>;
     })}
     <View style={{flexDirection:"row",gap:8}}>
       <Pressable onPress={()=>router.push("/import-data")} style={{backgroundColor:"#252A39",flex:1,padding:14,borderRadius:10,flexDirection:"row",gap:7,alignItems:"center",justifyContent:"center"}}>
         <Icon name="file-import-outline" color={METRO.cyan}/><Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>IMPORT JSON</Text>
       </Pressable>
       <Pressable onPress={()=>router.push("/mail-review")} style={{backgroundColor:"#252A39",flex:1,padding:14,borderRadius:10,flexDirection:"row",gap:7,alignItems:"center",justifyContent:"center"}}>
         <Icon name="clipboard-check-outline" color={METRO.orange}/><Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>REVIEW MAIL</Text>
       </Pressable>
     </View>
   </ScrollView>
 </View>;
}
