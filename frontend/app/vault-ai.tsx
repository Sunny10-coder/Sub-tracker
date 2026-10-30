import { useRouter } from "expo-router";
import { ScrollView, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand, MetroSection, MetroTile, useLiveMetroIndex } from "@/src/components/metro-tiles";

export default function VaultAI() {
 const router=useRouter(); const insets=useSafeAreaInsets(); const live=useLiveMetroIndex(3,11800);
 const open=(s:string)=>router.push(s as any);
 const aiHints=["Ask about costs, renewals and benefits","Find subscriptions with overlapping features","Explore your saved tools and ideas"];
 return <View style={{flex:1,backgroundColor:METRO.black}}>
  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingTop:insets.top+10,paddingHorizontal:14,paddingBottom:insets.bottom+35}}>
   <View style={{flexDirection:"row",alignItems:"center",gap:12,marginBottom:12}}>
     <Pressable onPress={()=>router.canGoBack()?router.back():open("/(tabs)")} accessibilityLabel="Back" style={{height:42,width:35,justifyContent:"center"}}>
       <Icon name="chevron-left" color={METRO.white} size={32}/>
     </Pressable><MetroBrand word="VAULT & AI"/>
   </View>
   <Text style={{color:METRO.dim,fontSize:13,marginBottom:20}}>Your intelligence tools, one tap away.</Text>
   <MetroTile color={METRO.green} title="ASK SUBMIND AI" icon="robot-outline"
     subtitle={aiHints[live]} liveKey={live} horizontal height={138} onPress={()=>open("/(tabs)/ai")}
     testID="metro-vault-ai"/>
   <View style={{height:METRO.gap}}/>
   <View style={{flexDirection:"row",gap:METRO.gap}}>
    <MetroTile color={METRO.cyan} textColor={METRO.ink} icon="auto-fix" title="AI PROMPTS" subtitle="Save and reuse instructions" height={173} style={{flex:1}} onPress={()=>open("/prompt-vault")}/>
    <MetroTile color={METRO.purple} icon="graph" title="BRAIN MAP" subtitle="Connections and insights" height={173} style={{flex:1}} onPress={()=>open("/graph")}/>
   </View>
   <View style={{height:METRO.gap}}/>
   <MetroTile color={METRO.orange} textColor={METRO.ink} title="PROMO VAULT" icon="ticket-percent-outline"
     subtitle="Codes, discounts, credits and benefits" horizontal height={118} onPress={()=>open("/promo-vault")}/>
   <View style={{height:METRO.gap}}/>
   <MetroTile color={METRO.cobalt} title="LINK VAULT" icon="bookmark-multiple-outline"
     subtitle="Links, collections and revisit reminders" horizontal height={118} onPress={()=>open("/link-vault")}/>
   <MetroSection title="Explore"/>
   <View style={{flexDirection:"row",gap:METRO.gap}}>
     <MetroTile color={METRO.pink} title="DEALS & PLANS" icon="sale" height={132} style={{flex:1}} onPress={()=>open("/deals")}/>
     <MetroTile color={METRO.teal} title="WATCHLIST" icon="eye-outline" height={132} style={{flex:1}} onPress={()=>open("/watchlist")}/>
   </View>
   <View style={{height:METRO.gap}}/>
   <MetroTile color={METRO.purple} title="INBOX & CAPTURE" icon="inbox-arrow-down-outline"
      subtitle="Review screenshots and imported items" horizontal height={109} onPress={()=>open("/(tabs)/inbox")}/>
   <View style={{height:METRO.gap}}/>
   <MetroTile color={METRO.cyan} textColor={METRO.ink} title="SAVE ANYTHING" icon="plus"
      subtitle="Capture link, subscription or a note" horizontal height={100} onPress={()=>open("/actions")}/>
   <Text style={{textAlign:"center",color:"#858585",letterSpacing:1,marginTop:20,fontSize:10}}>SUBMIND METRO · YOUR DIGITAL VAULT</Text>
  </ScrollView>
 </View>
}
