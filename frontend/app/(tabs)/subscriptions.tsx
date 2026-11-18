import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscriptions } from "@/src/lib/api";
import { money, formatDate, daysUntil } from "@/src/lib/format";
import { AppHeader, Badge, Card, CategoryDot, ChipRow, EmptyState, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

const FILTERS = ["Current", "Active", "Trial", "Paused"];

const statusTone: any = { Active: "success", Trial: "mint", Paused: "warning", Cancelled: "error", Expired: "muted", Unknown: "muted" };

/** Use the meaningful next date; never claim an expired date is a future renewal. */
export function subscriptionDeadline(item: any): {date:string|null;label:string;days:number|null} {
  const status=String(item?.status||"").toLowerCase();
  const candidates = status==="trial"
    ? [{value:item.trial_end,label:"TRIAL ENDS"},{value:item.renewal_date,label:"RENEWS"}]
    : status==="cancelled"
      ? [{value:item.access_end,label:"ACCESS ENDS"}]
      : status==="expired"
        ? [{value:item.access_end||item.expiry_date,label:"EXPIRED"}]
        : [{value:item.renewal_date,label:item.auto_renew===false?"ACCESS / BILLING DATE":"RENEWS"},
           {value:item.expiry_date,label:"EXPIRES"},{value:item.access_end,label:"ACCESS ENDS"}];
  for(const candidate of candidates){
    const raw=String(candidate.value||"").slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))continue;
    const days=daysUntil(raw);
    if(days!==null)return {date:raw,label:candidate.label,days};
  }
  return {date:null,label:"DATE UNKNOWN",days:null};
}
export function sortedByNearestDeadline(items:any[]):any[] {
  return [...items].sort((a,b)=>{
    const da=subscriptionDeadline(a).days, db=subscriptionDeadline(b).days;
    if(da===null)return db===null?String(a.provider||"").localeCompare(String(b.provider||"")):1;
    if(db===null)return -1;
    // Already overdue dates are urgent, nearest overdue first.
    const rank=(n:number)=>n<0?0:1;
    if(rank(da)!==rank(db))return rank(da)-rank(db);
    if(da!==db)return da<0?db-da:da-db;
    return String(a.provider||"").localeCompare(String(b.provider||""));
  });
}

export default function Subscriptions() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState("Current");
  const { data, isLoading, isFetching, refetch } = useSubscriptions(filter === "Current" ? undefined : filter);
  const visible = sortedByNearestDeadline((data||[]).filter((item:any)=>{
    const status=String(item.status||"").toLowerCase();
    return filter!=="Current" || !["cancelled","expired"].includes(status);
  }));
  const urgency=(days:number|null)=>{
    if(days===null)return {text:"DATE UNKNOWN",color:colors.muted};
    if(days<0)return {text:Math.abs(days)+"D OVERDUE",color:colors.error};
    if(days===0)return {text:"TODAY",color:colors.error};
    if(days<=3)return {text:days+"D LEFT",color:colors.error};
    if(days<=7)return {text:days+"D LEFT",color:colors.warning};
    if(days<=30)return {text:days+"D LEFT",color:colors.brandPrimary};
    return {text:days+"D LEFT",color:colors.success};
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Subscriptions"
        subtitle={data ? `${visible.length} ${filter !== "Current" ? filter.toLowerCase() : "current"} plans · nearest deadline first` : undefined}
      />
      <ChipRow items={FILTERS} value={filter} onChange={setFilter} testIDPrefix="sub-filter" />

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <EmptyState
              icon="wallet-outline"
              title="No subscriptions yet"
              message="Add your first subscription, or scan a screenshot to let AI do it for you."
              action={<PrimaryButton title="Add subscription" icon="plus" onPress={() => router.push("/add-subscription")} style={{ marginTop: 8 }} />}
            />
          }
          renderItem={({ item }) => {
            const deadline=subscriptionDeadline(item);
            const due=urgency(deadline.days);
            return (
              <Card style={styles.card} onPress={() => router.push(`/subscription/${item.id}`)} testID={`sub-${item.id}`}>
                <View style={styles.row}>
                  <CategoryDot category={item.category} size={46} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.title} numberOfLines={1}>{item.provider}</Text>
                      <Badge label={item.status} tone={statusTone[item.status] || "muted"} />
                    </View>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[item.plan,item.billing_cycle].filter(Boolean).join(" · ") || "Plan details unavailable"}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{money(item.price, item.currency)}</Text>
                </View>
                <View style={[styles.deadline,{borderLeftColor:due.color}]}>
                  <View style={{flex:1,gap:3}}>
                    <Text style={styles.deadlineLabel}>{deadline.label}</Text>
                    <Text style={styles.dateText} testID={`sub-date-${item.id}`}>
                      {deadline.date?formatDate(deadline.date):"Add a renewal date"}
                    </Text>
                  </View>
                  <Text style={[styles.countdown,{color:due.color}]} testID={`sub-countdown-${item.id}`}>
                    {due.text}
                  </Text>
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  card:{padding:14,gap:12},
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  deadline:{backgroundColor:colors.surfaceTertiary,paddingHorizontal:13,paddingVertical:10,
    borderLeftWidth:4,flexDirection:"row",alignItems:"center",gap:9},
  deadlineLabel:{color:colors.muted,fontSize:11,fontWeight:"700",letterSpacing:0.7},
  dateText:{color:colors.onSurface,fontSize:19,fontWeight:"800"},
  countdown:{fontSize:19,fontWeight:"900",textAlign:"right",minWidth:75},
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "800", flex: 1 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 3 },
  amount: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
}));
