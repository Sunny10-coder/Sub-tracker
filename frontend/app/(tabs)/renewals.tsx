import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscriptions } from "@/src/lib/api";
import { daysUntil, formatDate, money } from "@/src/lib/format";
import { AppHeader, Badge, Card, ChipRow, EmptyState, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

const FILTERS = ["Next 7d", "Next 30d", "All upcoming", "Needs dates"];
function isLive(sub: any) {
  const s = String(sub.status || "").toLowerCase();
  return ["active", "trial", "cancelled", "canceled"].includes(s);
}
function targetDate(sub: any): string | null {
  const canceled = ["canceled", "cancelled"].includes(String(sub.status || "").toLowerCase()) || sub.auto_renew === false;
  return canceled ? sub.access_end || sub.trial_end || sub.renewal_date || null
                  : (sub.status === "Trial" && sub.trial_end) || sub.renewal_date || sub.trial_end || null;
}
function isCancellation(sub: any) {
 return sub.auto_renew === false || ["canceled", "cancelled"].includes(String(sub.status || "").toLowerCase());
}
export default function Renewals() {
 const styles = useStyles(); const {colors} = useTheme(); const insets = useSafeAreaInsets();
 const router = useRouter(); const [filter,setFilter] = useState("Next 30d");
 const {data = [],isLoading,isFetching,refetch} = useSubscriptions();
 const rows = useMemo(() => data.filter(isLive).map((s:any)=>{
   const date = targetDate(s); const days = daysUntil(date); const cancelled = isCancellation(s);
   return {...s, deadline:date, days, cancelled, action_label: cancelled ? "Access ends" : s.status === "Trial" ? "Trial ends" : "Renews"};
 }).filter((s:any) => filter === "Needs dates" ? s.days === null :
    s.days !== null && s.days >= 0 && (filter === "Next 7d" ? s.days <= 7 : filter === "Next 30d" ? s.days <= 30 : true))
   .sort((a:any,b:any)=>(a.days ?? 99999)-(b.days ?? 99999)),[data,filter]);
 const dueSoon = data.filter(isLive).filter((s:any)=>{const d=daysUntil(targetDate(s));return d!==null&&d>=0&&d<=7;}).length;
 return <View style={styles.container}>
   <AppHeader title="Renewals" subtitle="Know before you are charged" right={<Pressable accessibilityLabel="Add reminder" onPress={()=>router.push("/add-reminder")} style={styles.add}><Icon name="bell-plus" color={colors.brandPrimary}/></Pressable>}/>
   <View style={styles.top}>
     <Card style={styles.hero}>
       <Icon name="calendar-alert" color={colors.brandPrimary} size={24}/>
       <Text style={styles.heroNumber}>{dueSoon}</Text>
       <Text style={styles.heroLabel}>due in the next 7 days</Text>
       <Text style={styles.sub}>Canceled plans appear as access endings, never as future charges.</Text>
     </Card>
   </View>
   <ChipRow items={FILTERS} value={filter} onChange={setFilter}/>
   {isLoading ? <Loading/> : <FlatList data={rows} keyExtractor={(item:any)=>item.id}
     contentContainerStyle={{padding:18,paddingBottom:TAB_BAR_SPACE+insets.bottom,gap:11}}
     refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary}/>}
     ListEmptyComponent={<EmptyState icon="calendar-check" title={filter==="Needs dates"?"Every live plan has a date":"Nothing due in this range"}
       message="Keep trial end dates and renewal dates updated to receive accurate reminders."
       action={<PrimaryButton title="Add reminder" icon="bell-plus" onPress={()=>router.push("/add-reminder")}/>}/>}
     renderItem={({item}:any)=><Card onPress={()=>router.push({pathname:"/subscription/[id]",params:{id:item.id}})} style={styles.card}>
       <View style={styles.row}>
         <View style={[styles.circle,{backgroundColor:(item.days!==null && item.days<=3?colors.error:colors.brandSecondary)+"20"}]}>
           <Icon name={item.cancelled?"shield-check-outline":item.status==="Trial"?"clock-alert-outline":"calendar-clock"} color={item.days!==null&&item.days<=3?colors.error:colors.brandSecondary} size={23}/>
         </View>
         <View style={{flex:1,gap:3}}>
           <Text style={styles.name} numberOfLines={1}>{item.provider}</Text>
           <Text style={styles.sub} numberOfLines={1}>{item.plan || "Subscription"} · {item.action_label} {formatDate(item.deadline)}</Text>
           <Text style={styles.email} numberOfLines={1}>{item.account_email || "Sign-in email not confirmed"}</Text>
         </View>
         <View style={{alignItems:"flex-end",gap:5}}>
           <Badge label={item.days===null?"Unknown":item.days===0?"Today":item.days+"d"} tone={item.days!==null&&item.days<=3?"warning":"mint"}/>
           {!item.cancelled ? <Text style={styles.amount}>{money(item.price,item.currency)}</Text> : <Text style={styles.ended}>No renewal</Text>}
         </View>
       </View>
     </Card>}
   />}
 </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},top:{paddingHorizontal:18,paddingBottom:12},
 hero:{gap:6,backgroundColor:c.surfaceSecondary,borderColor:c.border},
 heroNumber:{color:c.onSurface,fontSize:38,fontWeight:"800"},heroLabel:{color:c.onSurface,fontSize:15,fontWeight:"800"},
 name:{color:c.onSurface,fontSize:16,fontWeight:"800"},sub:{color:c.muted,fontSize:12,lineHeight:18},
 email:{color:c.onSurfaceTertiary,fontSize:11},
 amount:{color:c.onSurface,fontSize:13,fontWeight:"800"},
 ended:{color:c.success,fontSize:11,fontWeight:"700"},
 circle:{width:47,height:47,borderRadius:15,justifyContent:"center",alignItems:"center"},
 card:{padding:13},row:{flexDirection:"row",alignItems:"center",gap:10},
 add:{width:42,height:42,justifyContent:"center",alignItems:"center",borderRadius:15,backgroundColor:c.surfaceTertiary},
}));