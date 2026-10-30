import { useRouter } from "expo-router";
import { ScrollView, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, Card, Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const MODULES = [
 {heading:"Brain Map", description:"See connected accounts, subscriptions, tools, and opportunities", icon:"graph", route:"/graph", tone:"brandSecondary"},
 {heading:"Promo Vault", description:"Find, save and check discount codes and benefits", icon:"ticket-percent", route:"/promo-vault", tone:"brandTertiary"},
 {heading:"AI Prompts", description:"Your reusable AI instructions, saved workflows and scripts", icon:"auto-fix", route:"/prompt-vault", tone:"brandPrimary"},
 {heading:"Ask SubMind AI", description:"Ask about your tools, costs, renewals and benefits", icon:"robot-outline", route:"/(tabs)/ai", tone:"brandSecondary"},
 {heading:"Deals & Plans", description:"Research pricing, trials and offers for any tool", icon:"magnify-scan", route:"/deals", tone:"brandTertiary"},
 {heading:"Link Vault", description:"Your saved links, reviews and revisit reminders", icon:"bookmark-multiple-outline", route:"/link-vault", tone:"brandPrimary"},
 {heading:"Watchlist", description:"Compare plans you might subscribe to later", icon:"eye-outline", route:"/watchlist", tone:"brandSecondary"},
 {heading:"Inbox & Capture", description:"Review AI-extracted screenshots and imported text", icon:"inbox-arrow-down-outline", route:"/(tabs)/inbox", tone:"brandTertiary"},
];
export default function VaultAI() {
 const router=useRouter();const {colors}=useTheme();const styles=useStyles();const insets=useSafeAreaInsets();
 return <View style={styles.container}>
  <AppHeader title="Vault & AI" subtitle="Choose the intelligence tool you need" back/>
  <ScrollView contentContainerStyle={{padding:18,paddingBottom:insets.bottom+35,gap:14}}>
    <Card style={styles.hero}>
      <Text style={styles.eyebrow}>SECONDARY WORKSPACE</Text>
      <Text style={styles.title}>Your digital intelligence vault</Text>
      <Text style={styles.sub}>Subscriptions, Accounts, Renewals and Spending stay in your main navigation. These tools are available whenever you choose them.</Text>
    </Card>
    <View style={styles.grid}>{MODULES.map((item)=> <Pressable key={item.heading}
       testID={"vault-"+item.heading} accessibilityRole="button" accessibilityLabel={item.heading}
       onPress={()=>router.push(item.route as any)} style={styles.tile}>
       <View style={[styles.icon,{backgroundColor:(colors as any)[item.tone]+"1C"}]}>
         <Icon name={item.icon} color={(colors as any)[item.tone]} size={28}/>
       </View>
       <Text style={styles.name}>{item.heading}</Text>
       <Text style={styles.desc}>{item.description}</Text>
       <Icon name="arrow-top-right" color={colors.muted} size={16}/>
     </Pressable>)}</View>
  </ScrollView>
 </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 hero:{backgroundColor:c.surfaceSecondary,gap:9,padding:23},
 eyebrow:{color:c.brandPrimary,fontSize:11,fontWeight:"800",letterSpacing:1.2},
 title:{fontSize:24,color:c.onSurface,fontWeight:"800",lineHeight:30},
 sub:{fontSize:13,color:c.muted,lineHeight:19},
 grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:11},
 tile:{width:"48%",minHeight:190,backgroundColor:c.surfaceSecondary,borderRadius:21,borderColor:c.border,borderWidth:1,padding:15,gap:8},
 icon:{width:48,height:48,borderRadius:15,justifyContent:"center",alignItems:"center"},
 name:{fontSize:16,fontWeight:"800",color:c.onSurface},
 desc:{fontSize:11,lineHeight:16,color:c.muted,flex:1},
}));