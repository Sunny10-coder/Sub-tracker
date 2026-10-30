import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/ui";
import { useAccounts, useLinks, usePromoCodes, useWatchlist } from "@/src/lib/api";
import { METRO, MetroBrand, MetroSection, MetroTile, useLiveMetroIndex } from "@/src/components/metro-tiles";

const GAP=METRO.gap;
const FEATURES=[
 {title:"ASK SUBMIND AI",subtitle:"Your personal subscriptions assistant",icon:"robot-outline",color:METRO.green,route:"/(tabs)/ai"},
 {title:"AI PROMPTS",subtitle:"Reusable prompts and scripts",icon:"auto-fix",color:METRO.teal,route:"/prompt-vault"},
 {title:"BRAIN MAP",subtitle:"Connected accounts and tools",icon:"graph",color:METRO.cobalt,route:"/graph"},
 {title:"PROMO VAULT",subtitle:"Discounts and credits",icon:"ticket-percent-outline",color:METRO.purple,route:"/promo-vault"},
 {title:"LINK VAULT",subtitle:"Bookmarks and reminders",icon:"bookmark-multiple-outline",color:METRO.orange,route:"/link-vault"},
] as const;
export default function VaultAI(){
 const router=useRouter();const insets=useSafeAreaInsets();
 const links=useLinks();const promos=usePromoCodes();const accounts=useAccounts();const watches=useWatchlist();
 const i=useLiveMetroIndex(3,10500);
 const questions=["What can I do with my existing plans?","Which promo codes should I check?","What benefits do I already own?"];
 const open=(s:string)=>router.push(s as any);
 return <View style={{flex:1,backgroundColor:METRO.black}}>
 <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:14,paddingTop:insets.top+10,paddingBottom:110}}>
  <View style={{flexDirection:"row",alignItems:"center",gap:13,marginBottom:16}}>
   <Pressable accessibilityLabel="Go back" onPress={()=>router.back()} style={{padding:8}}>
    <Icon name="arrow-left" color={METRO.white} size={29}/>
   </Pressable>
   <View><MetroBrand word="VAULT & AI"/><Text style={{color:METRO.dim,fontSize:12}}>EVERY TOOL, ONE TAP AWAY</Text></View>
  </View>
  <MetroTile color={METRO.green} title="ASK SUBMIND AI" subtitle={questions[i]} icon="robot-outline"
    horizontal height={166} liveKey={i} onPress={()=>open("/(tabs)/ai")} testID="metro-vault-ai"/>
  <View style={{height:GAP}}/>
  <View style={{flexDirection:"row",gap:GAP}}>
   <MetroTile color={METRO.teal} title="AI PROMPTS" icon="auto-fix" height={170} style={{flex:1}}
     onPress={()=>open("/prompt-vault")} testID="metro-vault-prompts"/>
   <MetroTile color={METRO.cobalt} title="BRAIN MAP" icon="graph" height={170} style={{flex:1}}
     onPress={()=>open("/graph")} testID="metro-vault-graph"/>
  </View>
  <View style={{height:GAP}}/>
  <View style={{flexDirection:"row",gap:GAP}}>
   <MetroTile color={METRO.purple} title="PROMO VAULT" icon="ticket-percent" value={promos.data?.length||0} height={185} style={{flex:1}}
     onPress={()=>open("/promo-vault")} testID="metro-vault-promos"/>
   <MetroTile color={METRO.orange} textColor={METRO.ink} title="LINK VAULT" icon="bookmark-multiple" value={links.data?.length||0}
     height={185} style={{flex:1}} onPress={()=>open("/link-vault")} testID="metro-vault-links"/>
  </View>
  <MetroSection title="Explore more"/>
  <MetroTile color={METRO.cyan} textColor={METRO.ink} icon="magnify" title="DEALS & PLANS" horizontal height={112}
    subtitle="Search current plan rates, discounts and offers" onPress={()=>open("/deals")} testID="metro-vault-deals"/>
  <View style={{height:GAP}}/>
  <View style={{flexDirection:"row",gap:GAP}}>
   <MetroTile color={METRO.pink} title="WATCHLIST" icon="eye-outline" value={watches.data?.length||0} height={155} style={{flex:1}}
     onPress={()=>open("/watchlist")}/>
   <MetroTile color={METRO.purple} title="INBOX & CAPTURE" icon="inbox-arrow-down-outline" height={155} style={{flex:1}}
     onPress={()=>open("/(tabs)/inbox")}/>
  </View>
  <MetroSection title="Connections"/>
  <MetroTile color={METRO.cobalt} title="ACCOUNTS" icon="account-multiple" horizontal height={95}
    subtitle={String(accounts.data?.length||0)+" account identities"} onPress={()=>open("/(tabs)/account-hub")}/>
  <Text style={{color:METRO.dim,marginTop:18,fontSize:11,textAlign:"center"}}>SUBMIND METRO · LIVE VAULT</Text>
 </ScrollView></View>;
}
