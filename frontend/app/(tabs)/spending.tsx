import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSubscriptions } from "@/src/lib/api";
import { money } from "@/src/lib/format";
import { AppHeader, Card, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

function monthlyAmount(sub: any): number | null {
 if (sub.status !== "Active" && !(sub.status === "Trial" && sub.trial_paid === true)) return null;
 if (sub.auto_renew === false || sub.billing_cycle === "one-time" || sub.billing_cycle === "prepaid") return null;
 const amount = typeof sub.price==="number" ? sub.price : typeof sub.price==="string" && sub.price.trim() ? Number(sub.price) : NaN;
 if (!Number.isFinite(amount) || amount < 0) return null;
 switch(String(sub.billing_cycle||"").toLowerCase()){
   case "monthly":return amount;
   case "yearly":return amount/12;
   case "weekly":return amount*52/12;
   default:return null;
 }
}
export default function Spending() {
 const {colors}=useTheme();const styles=useStyles();const insets=useSafeAreaInsets();const router=useRouter();
 const {data=[],isLoading,isFetching,refetch}=useSubscriptions();
 const summary=useMemo(()=>{
  const currencies:Record<string,number>={};const categories:Record<string,{currency:string;category:string;amount:number}>={};
  let unknown=0;let count=0;
  for(const s of data){
   if(s.status!=="Active"&&s.status!=="Trial")continue;
   const amount=monthlyAmount(s);
   if(amount===null){if(s.status==="Active"&&s.auto_renew!==false)unknown++;continue;}
   const cur=String(s.currency||"Unknown").toUpperCase();
   currencies[cur]=(currencies[cur]||0)+amount;
   const key=cur+"|"+String(s.category||"Other");
   if(!categories[key])categories[key]={currency:cur,category:s.category||"Other",amount:0};
   categories[key].amount+=amount;count++;
  }
  return {currencies:Object.entries(currencies).sort((a,b)=>a[0].localeCompare(b[0])),categories:Object.values(categories).sort((a,b)=>b.amount-a.amount),unknown,count};
 },[data]);
 return <View style={styles.container}>
   <AppHeader title="Spending" subtitle="Your subscription cost intelligence" right={<Pressable style={styles.add} onPress={()=>router.push("/insights")} accessibilityLabel="More insights"><Icon name="chart-bar" color={colors.brandPrimary}/></Pressable>}/>
   {isLoading ? <Loading/> : <ScrollView refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary}/>}
     contentContainerStyle={{padding:18,paddingBottom:TAB_BAR_SPACE+insets.bottom,gap:15}}>
     <Card style={styles.hero}>
       <Text style={styles.eyebrow}>KNOWN RECURRING COMMITMENTS</Text>
       {summary.currencies.length?summary.currencies.map(([cur,value])=><View key={cur} style={styles.moneyRow}>
        <Text style={styles.value}>{money(value,cur)}</Text><Text style={styles.mo}>/ month</Text>
       </View>):<Text style={styles.value}>No confirmed rates</Text>}
       <Text style={styles.hint}>{summary.count} priced active plans · {summary.unknown} active plans with unknown / usage-based pricing</Text>
       <Text style={styles.hint}>Currencies are never added together without a verified exchange rate.</Text>
     </Card>
     <View style={styles.bento}>
       <Card style={styles.stat}><Icon name="wallet" color={colors.brandSecondary} size={22}/>
         <Text style={styles.statNumber}>{summary.count}</Text><Text style={styles.statLabel}>Priced plans</Text></Card>
       <Card style={styles.stat}><Icon name="help-circle-outline" color={colors.brandTertiary} size={22}/>
         <Text style={styles.statNumber}>{summary.unknown}</Text><Text style={styles.statLabel}>Need rates</Text></Card>
     </View>
     <Text style={styles.heading}>Where your money goes</Text>
     {summary.categories.map((item)=>{
       const max=Math.max(...summary.categories.filter(x=>x.currency===item.currency).map(x=>x.amount),1);
       return <Card key={item.currency+"|"+item.category} style={{gap:8}}>
         <View style={styles.line}><Text style={styles.category}>{item.category}</Text>
           <Text style={styles.categoryAmount}>{money(item.amount,item.currency)}</Text></View>
         <View style={styles.track}><View style={[styles.bar,{width:(Math.max(3,item.amount/max*100)+"%") as any}]}/></View>
       </Card>;
     })}
     <Card style={{gap:8}}><Text style={styles.heading}>Rate tracking</Text><Text style={styles.hint}>Price history is stored by subscription. Discounts, one-off credits, trials and canceled plans are excluded from recurring totals.</Text>
       <PrimaryButton title="Find plans & offers" icon="magnify" variant="secondary" onPress={()=>router.push("/deals")}/></Card>
   </ScrollView>}
 </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 add:{height:42,width:42,alignItems:"center",justifyContent:"center",backgroundColor:c.surfaceTertiary,borderRadius:15},
 hero:{backgroundColor:c.surfaceSecondary,gap:9,padding:22},
 eyebrow:{color:c.brandPrimary,fontSize:11,fontWeight:"800",letterSpacing:1.3},
 value:{fontSize:31,fontWeight:"800",color:c.onSurface,letterSpacing:-.7},
 mo:{color:c.muted,fontSize:13},
 moneyRow:{flexDirection:"row",alignItems:"baseline",gap:8},
 hint:{color:c.muted,fontSize:12,lineHeight:18},
 bento:{flexDirection:"row",gap:12},stat:{flex:1,gap:5,minHeight:105},
 statNumber:{color:c.onSurface,fontSize:23,fontWeight:"800"},statLabel:{color:c.muted,fontSize:12},
 heading:{color:c.onSurface,fontSize:17,fontWeight:"800"},
 line:{flexDirection:"row",justifyContent:"space-between",gap:12},
 category:{color:c.onSurfaceSecondary,fontSize:13,fontWeight:"700"},
 categoryAmount:{color:c.onSurface,fontSize:13,fontWeight:"800"},
 track:{height:8,borderRadius:6,backgroundColor:c.surfaceTertiary,overflow:"hidden"},
 bar:{height:8,backgroundColor:c.brandSecondary,borderRadius:5},
}));