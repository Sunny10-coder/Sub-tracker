import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_SPACE } from "./_layout";
import { useInsights, useSubscriptions, useVaultDashboard } from "@/src/lib/api";
import { daysUntil, formatDate, money } from "@/src/lib/format";
import { Card, Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const QUICK = [
  { title: "Add Plan", icon: "wallet-plus", route: "/add-subscription" },
  { title: "Add Account", icon: "account-plus", route: "/add-account" },
  { title: "Save Link", icon: "link-variant-plus", route: "/paste-link" },
  { title: "Reminder", icon: "bell-plus-outline", route: "/add-reminder" },
];
const TILES = [
  { title: "Subscriptions", icon: "credit-card-outline", route: "/(tabs)/subscriptions", color: "brandPrimary", sub: "Active plans & trials" },
  { title: "Accounts", icon: "badge-account-outline", route: "/(tabs)/account-hub", color: "brandSecondary", sub: "Every linked email" },
  { title: "Renewals", icon: "calendar-clock-outline", route: "/(tabs)/renewals", color: "brandTertiary", sub: "Next payments & ends" },
  { title: "Spending", icon: "chart-donut", route: "/(tabs)/spending", color: "warning", sub: "Rates & categories" },
] as const;

function dueDate(s: any): string | null {
  const cancelled = s.auto_renew === false || ["Cancelled", "Canceled"].includes(s.status);
  if (cancelled) return s.access_end || s.trial_end || null;
  return s.status === "Trial" ? s.trial_end || s.renewal_date : s.renewal_date || null;
}

export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const insight = useInsights();
  const vault = useVaultDashboard();
  const subs = useSubscriptions();
  const data = insight.data;
  const currencies = Object.entries(vault.data?.monthly_by_currency || data?.monthly_by_currency || {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  const count = data?.active_count ?? 0;
  const total = data?.total_count ?? subs.data?.length ?? 0;
  const accountCount = vault.data?.accounts ?? 0;
  const renewals = data?.renewals_30d?.length ?? 0;
  const trials = data?.trials_ending?.length ?? 0;
  const refreshing = insight.isFetching || vault.isFetching || subs.isFetching;
  const refresh = () => { insight.refetch(); vault.refetch(); subs.refetch(); };
  const events = useMemo(() => (subs.data || []).map((s: any) => {
    const date = dueDate(s);
    const days = daysUntil(date);
    const cancelled = s.auto_renew === false || ["Cancelled", "Canceled"].includes(s.status);
    return { ...s, eventDate: date, days, cancelled, kind: cancelled ? "Access ends" : s.status === "Trial" ? "Trial ends" : "Renews" };
  }).filter((s: any) => s.days !== null && s.days >= 0 && s.days <= 45 && ["Active", "Trial", "Cancelled", "Canceled"].includes(s.status))
    .sort((a: any, b: any) => a.days - b.days).slice(0, 4), [subs.data]);

  return <View style={styles.container}>
    <ScrollView showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brandPrimary}/>}
      contentContainerStyle={{ paddingTop: insets.top + 17, paddingBottom: TAB_BAR_SPACE + insets.bottom + 22 }}>
      <View style={styles.top}>
        <View style={styles.identity}>
          <View style={styles.dot}/>
          <Text style={styles.eyebrow}>YOUR DIGITAL TOOLKIT</Text>
        </View>
        <Pressable onPress={() => router.push("/settings")} accessibilityLabel="Settings" style={styles.settings}>
          <Icon name="cog-outline" color={colors.onSurface} size={21}/>
        </Pressable>
      </View>
      <Text style={styles.headline}>Less clutter.</Text>
      <Text style={styles.headlineAccent}>More control.</Text>
      <Text style={styles.subtitle}>Every plan. Every account. Every perk.</Text>

      <LinearGradient colors={["#222024", "#231B27", "#18272A"]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.hero}>
        <View style={styles.auraPink}/><View style={styles.auraBlue}/>
        <View style={styles.heroHeader}>
          <View style={styles.heroEyebrow}>
            <View style={[styles.dot,{backgroundColor:colors.brandPrimary}]}/>
            <Text style={styles.kicker}>MONTHLY COMMITMENT</Text>
          </View>
          <Pressable onPress={()=>router.push("/(tabs)/spending")} style={styles.arrow}>
            <Icon name="arrow-top-right" color={colors.onSurface} size={19}/>
          </Pressable>
        </View>
        {currencies.length ? currencies.map(([currency,amount],i)=>
          <View key={currency} style={styles.moneyRow}>
            <Text style={[styles.money,{fontSize:i===0?32:25,color:i===0?colors.onSurface:colors.onSurfaceTertiary}]}>{money(Number(amount),currency)}</Text>
            <Text style={styles.period}>/ mo</Text>
          </View>
        ) : <Text style={styles.emptyMoney}>Add your subscription rates to see spending.</Text>}
        <Text style={styles.disclaimer}>Known recurring rates · currencies kept separate</Text>
        <View style={styles.heroFooter}>
          <View style={styles.smallBadge}><Icon name="clock-outline" color={colors.brandSecondary} size={14}/>
            <Text style={[styles.smallBadgeText,{color:colors.brandSecondary}]}>{trials} TRIALS</Text></View>
          <Text style={styles.heroFooterText}>{renewals} RENEWALS / 30 DAYS</Text>
        </View>
      </LinearGradient>

      {total===0 ? <Pressable onPress={()=>router.push("/import-data")} style={styles.importCard} accessibilityRole="button">
        <View style={styles.importIcon}><Icon name="file-import-outline" color={colors.brandSecondary} size={27}/></View>
        <View style={{flex:1,gap:4}}>
          <Text style={styles.importHeading}>Import your private tracker</Text>
          <Text style={styles.importText}>Load your Excel-derived subscriptions, accounts and offers from the private JSON file.</Text>
        </View>
        <Icon name="arrow-right" size={23} color={colors.brandSecondary}/>
      </Pressable> : null}

      <View style={styles.tileGrid}>
        {TILES.map((item,i) => {
          const color = (colors as any)[item.color] || colors.brandPrimary;
          const value = i===0 ? String(total) : i===1 ? String(accountCount) : i===2 ? String(renewals) : currencies.length ? currencies.length + " curr." : "—";
          return <Pressable key={item.title} onPress={()=>router.push(item.route as any)}
            accessibilityRole="button" accessibilityLabel={item.title} style={styles.tile} testID={"kpi-"+item.title}>
            <View style={styles.tileHead}><View style={[styles.tileIcon,{backgroundColor:color+"18"}]}>
              <Icon name={item.icon} color={color} size={23}/></View><Icon name="arrow-top-right" color={colors.muted} size={19}/></View>
            <View><Text style={styles.tileValue}>{value}</Text><Text style={[styles.tileLabel,{color}]}>{item.title.toUpperCase()}</Text>
              <Text style={styles.tileSub}>{item.sub}</Text></View>
          </Pressable>;
        })}
      </View>

      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionMark}/><Text style={styles.sectionTitle}>FAST CAPTURE</Text>
        <Pressable onPress={()=>router.push("/actions")}><Text style={styles.seeAll}>All actions  ↗</Text></Pressable>
      </View>
      <View style={styles.quickGrid}>
        {QUICK.map(item=><Pressable onPress={()=>router.push(item.route as any)} key={item.title} style={styles.quick}>
          <Icon name={item.icon} color={colors.brandSecondary} size={23}/><Text style={styles.quickText}>{item.title}</Text>
        </Pressable>)}
      </View>

      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionMark}/><Text style={styles.sectionTitle}>COMING UP NEXT</Text>
        <Pressable onPress={()=>router.push("/(tabs)/renewals")}><Text style={styles.seeAll}>Calendar  ↗</Text></Pressable>
      </View>
      <View style={styles.events}>
        {events.length?events.map((item:any)=><Pressable key={item.id} onPress={()=>router.push({pathname:"/subscription/[id]",params:{id:item.id}})} style={styles.eventRow}>
          <View style={[styles.eventIcon,{backgroundColor:(item.cancelled?colors.brandSecondary:colors.brandPrimary)+"17"}]}>
            <Icon name={item.cancelled?"shield-check-outline":"calendar-clock-outline"} color={item.cancelled?colors.brandSecondary:colors.brandPrimary} size={22}/>
          </View>
          <View style={{flex:1}}><Text style={styles.eventName} numberOfLines={1}>{item.provider}</Text>
            <Text style={styles.eventMeta} numberOfLines={1}>{item.kind} · {formatDate(item.eventDate)}</Text></View>
          <View style={styles.daysBadge}><Text style={styles.daysText}>{item.days===0?"TODAY":item.days+"d"}</Text></View>
        </Pressable>):<Card><Text style={styles.noEvents}>No due dates coming up. Renewal dates appear here once your tracker is imported.</Text></Card>}
      </View>

      <Pressable onPress={()=>router.push("/vault-ai")} style={styles.vaultCard}>
        <LinearGradient colors={["#263037","#2B2335","#201E25"]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.vaultGradient}>
          <View style={styles.vaultIcon}><Icon name="brain" color={colors.brandSecondary} size={27}/></View>
          <View style={{flex:1,gap:4}}><Text style={styles.vaultHeading}>Vault & AI</Text>
            <Text style={styles.vaultSub}>Brain Map · Promo Vault · AI Prompts · Deals</Text></View>
          <Icon name="arrow-top-right" color={colors.brandSecondary} size={20}/>
        </LinearGradient>
      </Pressable>
      <View style={styles.footerRow}>
        <Pressable onPress={()=>router.push("/import-data")}><Text style={styles.footerLink}>Import data  ↗</Text></Pressable>
        <Text style={styles.buildLabel}>SUBMIND NEXT · V2</Text>
        <Pressable onPress={()=>router.push("/api-keys")}><Text style={styles.footerLink}>API keys  ↗</Text></Pressable>
      </View>
    </ScrollView>
  </View>;
}

const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 top:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:21,marginBottom:14},
 identity:{flexDirection:"row",gap:8,alignItems:"center"},
 dot:{width:7,height:7,borderRadius:4,backgroundColor:c.brandTertiary},
 eyebrow:{fontSize:10,letterSpacing:1.5,color:c.brandTertiary,fontWeight:"800"},
 settings:{width:39,height:39,borderRadius:13,backgroundColor:c.surfaceSecondary,alignItems:"center",justifyContent:"center"},
 headline:{fontSize:32,fontWeight:"800",color:c.onSurface,letterSpacing:-1,paddingHorizontal:21,lineHeight:36},
 headlineAccent:{fontSize:34,fontWeight:"800",color:c.brandPrimary,letterSpacing:-1.1,paddingHorizontal:21,lineHeight:39},
 subtitle:{fontSize:13,color:c.onSurfaceTertiary,paddingHorizontal:21,marginTop:7,marginBottom:20},
 hero:{marginHorizontal:16,borderRadius:24,overflow:"hidden",paddingHorizontal:19,paddingTop:18,paddingBottom:0,borderWidth:1,borderColor:c.borderStrong},
 auraPink:{position:"absolute",width:120,height:120,borderRadius:60,backgroundColor:"#E5091430",right:-38,top:-55},
 auraBlue:{position:"absolute",width:130,height:130,borderRadius:65,backgroundColor:"#00DBE91F",left:-60,bottom:-48},
 heroHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:15},
 heroEyebrow:{flexDirection:"row",alignItems:"center",gap:8},
 kicker:{color:c.onSurfaceTertiary,fontSize:10,fontWeight:"800",letterSpacing:1.3},
 arrow:{width:32,height:32,borderRadius:16,backgroundColor:"#FFFFFF15",alignItems:"center",justifyContent:"center"},
 moneyRow:{flexDirection:"row",alignItems:"baseline",gap:8,marginBottom:2},
 money:{fontWeight:"800",letterSpacing:-.6},period:{color:c.onSurfaceTertiary,fontSize:12},
 emptyMoney:{color:c.onSurface,fontSize:22,fontWeight:"800",lineHeight:29},
 disclaimer:{fontSize:11,color:c.muted,marginTop:8,marginBottom:20},
 heroFooter:{marginHorizontal:-19,flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:"#1212178A",paddingVertical:13,paddingHorizontal:19},
 smallBadge:{flexDirection:"row",gap:5,alignItems:"center",backgroundColor:"#00DBE919",borderRadius:20,paddingVertical:5,paddingHorizontal:8},
 smallBadgeText:{fontSize:10,fontWeight:"800",letterSpacing:.6},
 heroFooterText:{color:c.onSurfaceTertiary,fontSize:10,fontWeight:"800",letterSpacing:.5},
 importCard:{marginHorizontal:16,marginTop:14,borderWidth:1,borderColor:c.brandSecondary+"66",borderRadius:19,padding:14,flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#00DBE908"},
 importIcon:{width:46,height:46,borderRadius:14,justifyContent:"center",alignItems:"center",backgroundColor:c.brandSecondary+"22"},
 importHeading:{fontSize:14,color:c.onSurface,fontWeight:"800"},
 importText:{fontSize:11,lineHeight:16,color:c.onSurfaceTertiary},
 tileGrid:{flexDirection:"row",flexWrap:"wrap",gap:11,marginHorizontal:16,marginTop:15,justifyContent:"space-between"},
 tile:{width:"48%",backgroundColor:c.surfaceSecondary,borderRadius:19,borderColor:c.border,borderWidth:1,minHeight:154,padding:15,justifyContent:"space-between"},
 tileHead:{flexDirection:"row",justifyContent:"space-between"},
 tileIcon:{width:37,height:37,borderRadius:12,alignItems:"center",justifyContent:"center"},
 tileValue:{fontSize:30,fontWeight:"800",color:c.onSurface,lineHeight:36},
 tileLabel:{fontSize:10,letterSpacing:.8,fontWeight:"800"},
 tileSub:{fontSize:11,color:c.muted,marginTop:4},
 sectionTitleRow:{flexDirection:"row",alignItems:"center",gap:7,marginHorizontal:18,marginTop:25,marginBottom:11},
 sectionMark:{height:7,width:7,borderRadius:4,backgroundColor:c.brandPrimary},
 sectionTitle:{flex:1,fontSize:11,letterSpacing:1.3,fontWeight:"800",color:c.onSurface},
 seeAll:{fontSize:11,color:c.brandPrimary,fontWeight:"800"},
 quickGrid:{flexDirection:"row",marginHorizontal:16,gap:8},
 quick:{flex:1,backgroundColor:c.surfaceSecondary,borderRadius:15,borderWidth:1,borderColor:c.border,minHeight:75,paddingVertical:10,paddingHorizontal:3,alignItems:"center",justifyContent:"center",gap:8},
 quickText:{fontSize:10,color:c.onSurfaceSecondary,fontWeight:"700",textAlign:"center"},
 events:{marginHorizontal:16,gap:9},
 eventRow:{padding:11,flexDirection:"row",alignItems:"center",gap:11,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surfaceSecondary},
 eventIcon:{width:44,height:44,borderRadius:13,alignItems:"center",justifyContent:"center"},
 eventName:{color:c.onSurface,fontSize:14,fontWeight:"800"},
 eventMeta:{color:c.onSurfaceTertiary,fontSize:11,marginTop:3},
 daysBadge:{paddingVertical:6,paddingHorizontal:10,backgroundColor:c.brandPrimary+"18",borderRadius:12},
 daysText:{color:c.brandPrimary,fontWeight:"800",fontSize:11},
 noEvents:{color:c.muted,fontSize:13},
 vaultCard:{marginHorizontal:16,marginTop:23},
 vaultGradient:{borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:c.brandSecondary+"36",padding:15,flexDirection:"row",alignItems:"center",gap:12},
 vaultIcon:{width:46,height:46,borderRadius:15,backgroundColor:c.brandSecondary+"19",alignItems:"center",justifyContent:"center"},
 vaultHeading:{color:c.onSurface,fontWeight:"800",fontSize:18},
 vaultSub:{color:c.onSurfaceTertiary,fontSize:11,lineHeight:16},
 footerRow:{marginHorizontal:21,marginTop:21,justifyContent:"space-between",alignItems:"center",flexDirection:"row"},
 footerLink:{fontSize:11,color:c.brandSecondary,fontWeight:"700"},
 buildLabel:{fontSize:9,color:c.muted,fontWeight:"800",letterSpacing:1},
}));