/**
 * SubMind Metro: unified personal intelligence hub.
 * Five main workspaces remain one tap away in the bottom navigator.
 */
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { autoSyncGmailOnLaunch } from "@/src/lib/automatic-mail-sync";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccounts, useLinks, useMailboxes, usePromoCodes, usePrompts, useReviewQueue, useSubscriptions, useWatchlist, useGraph } from "@/src/lib/api";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand, MetroSection, MetroTile, useLiveMetroIndex } from "@/src/components/metro-tiles";

const PAD=14,GAP=8;
function MiniAction({icon,title,route,color="#FFFFFF"}:{icon:string;title:string;route:string;color?:string}) {
 const router=useRouter();
 return <Pressable onPress={()=>router.push(route as any)} style={{backgroundColor:"#1C2030",borderWidth:1,borderColor:"#35394A",
   flex:1,minHeight:82,borderRadius:11,padding:12,justifyContent:"space-between",gap:7}}>
   <Icon name={icon} size={26} color={color}/>
   <Text style={{color:METRO.white,fontSize:12,fontWeight:"800"}}>{title.toUpperCase()}</Text>
 </Pressable>;
}
export default function VaultAI() {
 const router=useRouter();const insets=useSafeAreaInsets();
 const links=useLinks();const promos=usePromoCodes();const accounts=useAccounts();const watches=useWatchlist();
 const prompts=usePrompts();const mailboxes=useMailboxes();const pending=useReviewQueue();const subs=useSubscriptions();const graph=useGraph();
 useFocusEffect(useCallback(()=>{
   let visible=true;
   autoSyncGmailOnLaunch().then(result=>{
     if(visible&&!result.skipped){accounts.refetch();subs.refetch();promos.refetch();mailboxes.refetch();}
   });
   return()=>{visible=false};
 },[]));
 const live=useLiveMetroIndex(3,9000);
 const refreshing=[links,promos,accounts,watches,prompts,mailboxes,pending,subs,graph].some(q=>q.isFetching);
 const refresh=()=>[links,promos,accounts,watches,prompts,mailboxes,pending,subs,graph].forEach(q=>q.refetch());
 const open=(path:string)=>router.push(path as any);
 const active=(subs.data||[]).filter((s:any)=>["Active","Trial"].includes(s.status)).length;
 const reviewCount=pending.data?.length||0;
 const headline=["YOUR DIGITAL LIFE. CONNECTED.","YOUR ACCOUNTS. YOUR IDEAS.","EVERY LINK HAS A PLACE."][live];
 return <View style={{flex:1,backgroundColor:METRO.black}}>
  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingTop:insets.top+8,paddingHorizontal:PAD,paddingBottom:insets.bottom+118}}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={METRO.cyan}/>}>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
     <View><MetroBrand word="SUBMIND"/><Text style={{color:"#92A3BC",fontSize:10,fontWeight:"800",letterSpacing:2}}>PERSONAL INTELLIGENCE SPACE</Text></View>
     <View style={{flexDirection:"row",gap:8}}>
       <Pressable onPress={()=>open("/search")} accessibilityLabel="Search SubMind" style={{backgroundColor:"#1E2531",padding:12,borderRadius:12,borderWidth:1,borderColor:"#333F54"}}>
         <Icon name="magnify" color={METRO.cyan} size={23}/>
       </Pressable>
       <Pressable onPress={()=>open("/settings")} accessibilityLabel="SubMind Settings" style={{backgroundColor:"#1E2531",padding:12,borderRadius:12,borderWidth:1,borderColor:"#333F54"}}>
         <Icon name="cog-outline" color={METRO.white} size={23}/>
       </Pressable>
     </View>
   </View>
   <LinearGradient colors={["#243964","#1A2245","#17182D"]} start={{x:0,y:0}} end={{x:1,y:1}}
      style={{minHeight:175,borderRadius:17,marginBottom:GAP,padding:20,overflow:"hidden",borderWidth:1,borderColor:"#405987"}}>
     <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"}}>
       <View style={{flex:1}}>
         <Text style={{color:"#B0F3FF",fontSize:11,fontWeight:"900",letterSpacing:2}}>YOUR SMART SPACE</Text>
         <Text style={{color:METRO.white,fontSize:28,fontFamily:"sans-serif-condensed",fontWeight:"900",lineHeight:34,marginTop:9}}>{headline}</Text>
       </View>
       <Icon name="brain" size={46} color="#81D9F7"/>
     </View>
     <Text style={{color:"#C8D4EF",fontSize:12,lineHeight:18,marginTop:13}}>{String(accounts.data?.length||0)} accounts · {active} active plans · {links.data?.length||0} saved links · {prompts.data?.length||0} prompts</Text>
     <View style={{flexDirection:"row",alignItems:"center",gap:8,marginTop:11}}>
       <View style={{width:7,height:7,borderRadius:4,backgroundColor:METRO.green}}/>
       <Text style={{color:"#B8D7E8",fontSize:11}}>Local-first storage · Your data, your device</Text>
     </View>
   </LinearGradient>
   <View style={{flexDirection:"row",gap:GAP,marginBottom:GAP}}>
     <MetroTile title="ACCOUNTS" color={METRO.cyan} textColor={METRO.ink} value={accounts.data?.length||0} height={152}
       style={{flex:1}} onPress={()=>open("/(tabs)/account-hub")} testID="home-accounts"/>
     <MetroTile title="ACTIVE PLANS" color={METRO.orange} textColor={METRO.ink} value={active} height={152}
       style={{flex:1}} onPress={()=>open("/(tabs)/subscriptions")} testID="home-plans"/>
   </View>
   <View style={{flexDirection:"row",gap:GAP,marginBottom:GAP}}>
     <MetroTile title="AI PROMPTS" color={METRO.purple} value={prompts.data?.length||0} height={167}
       style={{flex:1}} onPress={()=>open("/(tabs)/prompts")} testID="home-prompts"/>
     <MetroTile title="BRAIN MAP" color={METRO.cobalt} value={graph.data?.edges?.length||0}
       subtitle="Connected ideas" height={167} style={{flex:1}}
       onPress={()=>open("/(tabs)/brain")} testID="home-brain"/>
   </View>
   <View style={{flexDirection:"row",gap:GAP}}>
     <MetroTile title="PROMO VAULT" color={METRO.pink} value={promos.data?.length||0} height={163}
       style={{flex:1}} onPress={()=>open("/promo-vault")} testID="home-promos"/>
     <MetroTile title="LINK VAULT" color={METRO.teal} value={links.data?.length||0} height={163}
       style={{flex:1}} onPress={()=>open("/link-vault")} testID="home-links"/>
   </View>
   <MetroSection title="Your connections"/>
   <Pressable onPress={()=>open("/gmail-sync")} style={{borderRadius:14,overflow:"hidden",marginBottom:10}}>
     <LinearGradient colors={["#C33343","#9F2549","#492248"]} start={{x:0,y:0}} end={{x:1,y:1}}
       style={{minHeight:123,padding:17,flexDirection:"row",alignItems:"center",gap:15}}>
       <Icon name="gmail" color={METRO.white} size={42}/>
       <View style={{flex:1}}>
         <Text style={{color:METRO.white,fontSize:21,fontWeight:"900"}}>GMAIL SYNC</Text>
         <Text style={{color:"#FFE3EC",fontSize:12,lineHeight:17,marginTop:3}}>{mailboxes.data?.length?
           mailboxes.data.length+" mailbox(es) previously scanned":"Connect Gmail to discover accounts, trials and offers"}</Text>
       </View>
       <Icon name="arrow-right" size={25} color={METRO.white}/>
     </LinearGradient>
   </Pressable>
   <View style={{flexDirection:"row",gap:GAP}}>
      <Pressable onPress={()=>open("/mail-review")} style={{flex:1,borderRadius:12,backgroundColor:"#2D2233",borderWidth:1,borderColor:"#55435E",padding:14,gap:9,minHeight:114}}>
       <Icon name="clipboard-check-outline" color={METRO.orange} size={27}/>
       <Text style={{color:METRO.white,fontSize:15,fontWeight:"900"}}>{reviewCount} FOR REVIEW</Text>
       <Text style={{color:METRO.dim,fontSize:11}}>Verify imports before saving</Text>
      </Pressable>
      <Pressable onPress={()=>open("/import-data")} style={{flex:1,borderRadius:12,backgroundColor:"#18303C",borderWidth:1,borderColor:"#31566A",padding:14,gap:9,minHeight:114}}>
       <Icon name="file-import-outline" color={METRO.cyan} size={27}/>
       <Text style={{color:METRO.white,fontSize:15,fontWeight:"900"}}>IMPORT JSON</Text>
       <Text style={{color:METRO.dim,fontSize:11}}>Restore your private records</Text>
      </Pressable>
   </View>
   <MetroSection title="Capture anything"/>
   <View style={{flexDirection:"row",gap:GAP}}>
     <MiniAction title="Paste link" icon="link-plus" route="/paste-link" color={METRO.teal}/>
     <MiniAction title="Screenshot" icon="image-search-outline" route="/scan" color={METRO.purple}/>
     <MiniAction title="Add plan" icon="plus-circle-outline" route="/add-subscription" color={METRO.orange}/>
   </View>
   <View style={{flexDirection:"row",gap:GAP,marginTop:GAP}}>
     <MiniAction title="Watch deals" icon="tag-heart-outline" route="/promo-vault" color={METRO.pink}/>
     <MiniAction title="Ask AI" icon="robot-outline" route="/(tabs)/ai" color={METRO.green}/>
     <MiniAction title="API keys" icon="shield-key-outline" route="/api-keys" color={METRO.cyan}/>
   </View>
   <MetroSection title="Tracking & insights"/>
   <View style={{flexDirection:"row",gap:GAP}}>
     <MetroTile title="RENEWALS" color="#EA8940" icon="calendar-clock-outline" height={125} style={{flex:1}}
       onPress={()=>open("/(tabs)/renewals")}/>
     <MetroTile title="WATCHLIST" color="#4967B8" icon="eye-outline" value={watches.data?.length||0} height={125} style={{flex:1}}
       onPress={()=>open("/watchlist")}/>
   </View>
   <View style={{height:GAP}}/>
   <MetroTile title="SPENDING & INSIGHTS" color="#2B857D" icon="chart-timeline-variant" horizontal height={98}
     onPress={()=>open("/(tabs)/spending")}/>
   <Text style={{color:"#717A8E",fontSize:10,textAlign:"center",letterSpacing:1.6,marginTop:24}}>SUBMIND METRO · ALL YOUR IDEAS, CONNECTED</Text>
  </ScrollView>
 </View>;
}
