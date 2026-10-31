import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { METRO, MetroBrand, MetroTile } from "@/src/components/metro-tiles";
import { TAB_BAR_SPACE } from "./_layout";
import { useInsights, useSubscriptions } from "@/src/lib/api";
import { money, relativeDate } from "@/src/lib/format";
import { Icon } from "@/src/components/ui";
const FILTERS=["All","Active","Trial","Paused","Cancelled","Expired","Unknown"];
const SEVERITY:Record<string,string>={Active:METRO.green,Trial:METRO.orange,Paused:METRO.purple,
  Cancelled:"#C86183",Expired:"#787F93",Unknown:METRO.cobalt};
function daysUntil(value:any):number|null {
 if(!value||!/^\d{4}-\d\d-\d\d/.test(String(value)))return null;
 const t=Date.parse(String(value).slice(0,10)+"T00:00:00Z");if(!Number.isFinite(t))return null;
 const d=new Date();return Math.round((t-Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
}
function nextDate(s:any):any{
 if(s.status==="Trial")return s.trial_end||s.renewal_date||s.access_end;
 if(s.auto_renew===false||["Cancelled","Expired"].includes(s.status))return s.access_end||null;
 return s.renewal_date||null;
}
export default function Subscriptions() {
 const router=useRouter(),insets=useSafeAreaInsets();
 const [filter,setFilter]=useState("All");
 const subs=useSubscriptions();const insights=useInsights();
 const list=subs.data||[];
 const active=list.filter((x:any)=>["Active","Trial"].includes(x.status)).length;
 const trials=list.filter((x:any)=>x.status==="Trial").length;
 const urgent=list.filter((x:any)=> {
   const d=daysUntil(nextDate(x));
   return d!==null&&d>=0&&d<=7&&["Active","Trial"].includes(x.status);
 }).length;
 const rows=useMemo(()=>list.filter((x:any)=>filter==="All"||x.status===filter)
   .sort((a:any,b:any)=>{
     const at=nextDate(a)?Date.parse(String(nextDate(a))):Infinity;
     const bt=nextDate(b)?Date.parse(String(nextDate(b))):Infinity;
     return at-bt;
   }),[list,filter]);
 const refresh=()=>{subs.refetch();insights.refetch()};
 const totals=Object.entries(insights.data?.monthly_by_currency||{});
 return <View style={{flex:1,backgroundColor:METRO.black}}>
   <ScrollView showsVerticalScrollIndicator={false}
     refreshControl={<RefreshControl refreshing={subs.isFetching||insights.isFetching} onRefresh={refresh} tintColor={METRO.orange}/>}
     contentContainerStyle={{paddingTop:insets.top+10,paddingHorizontal:14,paddingBottom:insets.bottom+TAB_BAR_SPACE,gap:12}}>
     <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
       <View><MetroBrand word="PLANS"/><Text style={{color:METRO.dim,fontSize:11,letterSpacing:1.5}}>SUBSCRIPTIONS & RENEWALS</Text></View>
       <Pressable onPress={()=>router.push("/add-subscription")} accessibilityLabel="Add subscription"
         style={{backgroundColor:METRO.orange,borderRadius:12,width:48,height:48,alignItems:"center",justifyContent:"center"}}>
         <Icon name="plus" size={28} color={METRO.ink}/>
       </Pressable>
     </View>
     <View style={{flexDirection:"row",gap:8}}>
       <MetroTile color={METRO.orange} textColor={METRO.ink} title="ACTIVE" value={active} height={147} style={{flex:1}} onPress={()=>setFilter("Active")}/>
       <MetroTile color={METRO.purple} title="TRIALS" value={trials} height={147} style={{flex:1}} onPress={()=>setFilter("Trial")}/>
       <MetroTile color={METRO.red} title="DUE IN 7D" value={urgent} height={147} style={{flex:1}} onPress={()=>router.push("/(tabs)/renewals")}/>
     </View>
     <View style={{backgroundColor:"#1A2131",padding:15,borderRadius:12,borderWidth:1,borderColor:"#36465E",gap:11}}>
       <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
         <Text style={{color:METRO.white,fontSize:16,fontWeight:"900"}}>ESTIMATED MONTHLY SPENDING</Text>
         <Icon name="chart-line" color={METRO.cyan} size={25}/>
       </View>
       {totals.length?<View style={{gap:7}}>{totals.map(([c,value])=><View key={c} style={{flexDirection:"row",alignItems:"baseline",gap:8}}>
         <Text style={{color:METRO.cyan,fontSize:24,fontWeight:"900"}}>{money(Number(value),c)}</Text><Text style={{color:METRO.dim,fontSize:11}}>per month</Text>
       </View>)}</View>:<Text style={{color:METRO.dim,fontSize:13}}>No confirmed recurring prices yet. Unknown, unverified and trial-only charges are excluded.</Text>}
       <Pressable onPress={()=>router.push("/(tabs)/spending")} style={{flexDirection:"row",alignItems:"center",gap:6}}>
         <Text style={{color:METRO.cyan,fontWeight:"900",fontSize:12}}>VIEW SPENDING ANALYSIS</Text>
         <Icon name="arrow-right" color={METRO.cyan} size={18}/>
       </Pressable>
     </View>
     <View style={{flexDirection:"row",gap:8}}>
       <Pressable onPress={()=>router.push("/gmail-sync")} style={{backgroundColor:"#4A2536",padding:14,flex:1,borderRadius:11,flexDirection:"row",alignItems:"center",gap:9}}>
         <Icon name="gmail" size={25} color="#FFBDC7"/>
         <Text style={{color:METRO.white,fontWeight:"900",fontSize:12,flex:1}}>SCAN GMAIL</Text>
       </Pressable>
       <Pressable onPress={()=>router.push("/scan")} style={{backgroundColor:"#293C53",padding:14,flex:1,borderRadius:11,flexDirection:"row",alignItems:"center",gap:9}}>
         <Icon name="image-search-outline" size={25} color={METRO.cyan}/>
         <Text style={{color:METRO.white,fontWeight:"900",fontSize:12,flex:1}}>SCAN RECEIPT</Text>
       </Pressable>
     </View>
     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
       {FILTERS.map(x=><Pressable key={x} onPress={()=>setFilter(x)} style={{paddingHorizontal:14,paddingVertical:11,
         backgroundColor:filter===x?METRO.orange:"#252938",borderRadius:8}}>
         <Text style={{color:filter===x?METRO.ink:METRO.white,fontSize:12,fontWeight:"900"}}>{x.toUpperCase()}</Text>
       </Pressable>)}
     </ScrollView>
     <Text style={{color:METRO.white,fontWeight:"900",fontSize:17}}>{rows.length} {filter==="All"?"TRACKED PLANS":filter.toUpperCase()+" PLANS"}</Text>
     {!rows.length?<View style={{backgroundColor:"#1B1C25",padding:25,borderRadius:13,borderWidth:1,borderColor:"#363946",gap:11,alignItems:"center"}}>
       <Icon name="credit-card-clock-outline" color={METRO.orange} size={46}/>
       <Text style={{color:METRO.white,fontSize:19,fontWeight:"900"}}>NO MATCHING PLANS</Text>
       <Text style={{color:METRO.dim,fontSize:13,textAlign:"center",lineHeight:20}}>Add a subscription manually, scan a receipt, or scan Gmail. Extracted email matches are reviewed before becoming records.</Text>
       <Pressable onPress={()=>router.push("/add-subscription")} style={{backgroundColor:METRO.orange,padding:14,borderRadius:8}}>
         <Text style={{color:METRO.ink,fontWeight:"900"}}>ADD SUBSCRIPTION</Text>
       </Pressable>
     </View>:rows.map((item:any)=>{
       const date=nextDate(item),delta=daysUntil(date),status=String(item.status||"Unknown");
       const color=SEVERITY[status]||METRO.cobalt;
       return <Pressable key={item.id} onPress={()=>router.push(("/subscription/"+item.id) as any)}
         style={{backgroundColor:"#1B1D27",borderRadius:13,borderWidth:1,borderColor:"#353B49",overflow:"hidden"}}>
         <View style={{flexDirection:"row",gap:13,padding:15,alignItems:"center"}}>
           <View style={{width:5,alignSelf:"stretch",backgroundColor:color,borderRadius:3}}/>
           <View style={{flex:1,gap:6}}>
             <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
               <Text style={{color:METRO.white,fontWeight:"900",fontSize:18,flex:1}} numberOfLines={1}>{item.provider||"Unknown"}</Text>
               <Text style={{color,fontSize:10,fontWeight:"900",backgroundColor:color+"2B",paddingHorizontal:8,paddingVertical:6,borderRadius:5}}>{status.toUpperCase()}</Text>
             </View>
             <Text style={{color:METRO.dim,fontSize:12}}>{[item.plan,item.billing_cycle,item.account_email].filter(Boolean).join(" · ")}</Text>
             <View style={{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap"}}>
               <Text style={{color:METRO.white,fontWeight:"900",fontSize:16}}>{item.price==null?"PRICE UNKNOWN":money(item.price,item.currency)}</Text>
               {date?<Text style={{color:delta!==null&&delta>=0&&delta<=7?METRO.orange:METRO.dim,fontSize:11}}>
                 {status==="Trial"?"Trial ends":item.auto_renew===false?"Access ends":"Next date"}: {relativeDate(date)}
               </Text>:null}
             </View>
             {item.review_required?<Text style={{color:METRO.orange,fontSize:11,fontWeight:"800"}}>REQUIRES BILLING REVIEW</Text>:null}
           </View>
           <Icon name="chevron-right" color={METRO.dim} size={22}/>
         </View>
       </Pressable>;
     })}
     <Pressable onPress={()=>router.push("/(tabs)/renewals")} style={{backgroundColor:"#312637",borderRadius:10,padding:15,flexDirection:"row",alignItems:"center",gap:12}}>
       <Icon name="calendar-alert-outline" size={25} color={METRO.orange}/>
       <Text style={{color:METRO.white,fontWeight:"900",flex:1}}>RENEWALS & TRIAL DEADLINES</Text>
       <Icon name="arrow-right" color={METRO.orange}/>
     </Pressable>
     <Text style={{color:METRO.dim,textAlign:"center",fontSize:11,lineHeight:18}}>Never infer a paid subscription solely from a receipt or welcome email. Confirm billing, status and cancellation dates in the actual provider account.</Text>
   </ScrollView>
 </View>;
}
