/** SubMind Metro Home: genuine data, animated live tiles, no mock metrics. */
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_SPACE } from "./_layout";
import { useInsights, useSubscriptions, useVaultDashboard } from "@/src/lib/api";
import { daysUntil, formatDate, money } from "@/src/lib/format";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand, MetroSection, MetroTile, useLiveMetroIndex } from "@/src/components/metro-tiles";

const GAP = METRO.gap;
const ACTIONS = [
  { label: "ADD PLAN", icon: "plus-circle-outline", route: "/add-subscription" },
  { label: "ACCOUNT", icon: "account-plus", route: "/add-account" },
  { label: "SAVE LINK", icon: "bookmark-plus-outline", route: "/paste-link" },
  { label: "IMPORT", icon: "file-import-outline", route: "/import-data" },
] as const;
const AI_QUESTIONS = [
  "What renews next week?",
  "Which credits expire soon?",
  "Find unused subscriptions.",
];
function nextDate(sub: any): string | null {
  const ending = sub.auto_renew === false || ["Cancelled", "Canceled"].includes(sub.status);
  return ending ? sub.access_end || sub.trial_end || null :
    sub.status === "Trial" ? sub.trial_end || sub.renewal_date || null : sub.renewal_date || null;
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const insights = useInsights();
  const vault = useVaultDashboard();
  const subscriptions = useSubscriptions();
  const live = useLiveMetroIndex(3, 10400);
  const data = insights.data;
  const subs = subscriptions.data || [];
  const total = data?.total_count ?? subs.length;
  const active = data?.active_count ?? subs.filter((x: any) => ["Active", "Trial"].includes(x.status)).length;
  const accounts = vault.data?.accounts ?? 0;
  const trialCount = data?.trials_ending?.length ?? 0;
  const renewals = data?.renewals_30d?.length ?? 0;
  const moneyRows = Object.entries(vault.data?.monthly_by_currency || data?.monthly_by_currency || {})
    .filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount));
  const upcoming = useMemo(() => subs
    .map((s: any) => ({ ...s, nextDate: nextDate(s) }))
    .map((s: any) => ({ ...s, days: daysUntil(s.nextDate) }))
    .filter((s: any) => s.days !== null && s.days >= 0 && s.days <= 30)
    .sort((a: any, b: any) => a.days - b.days).slice(0, 4), [subscriptions.data]);
  const urgent = upcoming.filter((s: any) => s.days <= 7 && s.auto_renew !== false &&
    !["Cancelled", "Canceled"].includes(s.status)).length;
  const selected = upcoming.length ? upcoming[live % upcoming.length] : null;
  const refreshing = insights.isFetching || vault.isFetching || subscriptions.isFetching;
  const refresh = () => { insights.refetch(); vault.refetch(); subscriptions.refetch(); };
  const open = (route: string) => router.push(route as any);

  return <View style={{ flex: 1, backgroundColor: METRO.black }}>
    <ScrollView showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 14, paddingBottom: TAB_BAR_SPACE + insets.bottom + 28 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={METRO.cyan}/>}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 19, paddingHorizontal: 3 }}>
        <View>
          <MetroBrand/>
          <Text style={{ color: METRO.dim, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginTop: 2 }}>
            YOUR SUBSCRIPTIONS AT A GLANCE
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={() => open("/(tabs)/ai")} accessibilityLabel="Ask SubMind AI"
            style={{ backgroundColor: METRO.cyan, width: 41, height: 36, alignItems: "center", justifyContent: "center" }}>
            <Icon name="robot-outline" color={METRO.white} size={25}/>
          </Pressable>
          <Pressable onPress={() => open("/reminders")} accessibilityLabel="View reminders"
            style={{ width: 42, height: 39, justifyContent: "center", alignItems: "center" }}>
            <Icon name="bell-outline" color={METRO.white} size={27}/>
            {urgent > 0 ? <View style={{ backgroundColor: METRO.red, paddingHorizontal: 5, position: "absolute", top: 0, right: 0 }}>
              <Text style={{ color: METRO.white, fontSize: 10, fontWeight: "900" }}>{urgent > 99 ? "99+" : urgent}</Text>
            </View> : null}
          </Pressable>
          <Pressable onPress={() => open("/settings")} accessibilityLabel="Settings"
            style={{ borderWidth: 2, borderColor: METRO.cyan, height: 42, width: 42, borderRadius: 21,
              justifyContent: "center", alignItems: "center" }}>
            <Icon name="cog-outline" color={METRO.white} size={25}/>
          </Pressable>
        </View>
      </View>
      <MetroTile color={METRO.cyan} textColor={METRO.ink} value={active}
        title="Active subscriptions"
        subtitle={active ? String(total) + " tracked plans and historical records" : "Ready to load your personal tracker"}
        caption="Tap to open subscriptions" height={224}
        onPress={() => open("/(tabs)/subscriptions")} testID="metro-active-subscriptions"/>
      <View style={{ height: GAP }}/>
      <View style={{ flexDirection: "row", gap: GAP }}>
        <MetroTile color={METRO.orange} textColor={METRO.ink} title="Upcoming renewals"
          value={renewals} subtitle="Next 30 days" caption="Review before billing"
          height={210} style={{ flex: 1 }} onPress={() => open("/(tabs)/renewals")} testID="metro-renewals"/>
        <MetroTile color={METRO.red} title="Trials ending" value={trialCount}
          subtitle={urgent > 0 ? String(urgent) + " action(s) in 7 days" : "Review before charge"}
          height={210} style={{ flex: 1 }} onPress={() => open("/(tabs)/renewals")} testID="metro-trials"/>
      </View>
      <View style={{ height: GAP }}/>
      <MetroTile color={METRO.purple} title="Accounts & emails" icon="account-multiple-outline"
        subtitle={String(accounts) + " account identities · sign-ins · benefits"}
        horizontal height={116} onPress={() => open("/(tabs)/account-hub")} testID="metro-accounts"/>
      <View style={{ height: GAP }}/>
      <MetroTile color={METRO.green} title="Ask SubMind AI" icon="auto-fix"
        subtitle={AI_QUESTIONS[live]} liveKey={live} horizontal height={125}
        onPress={() => open("/(tabs)/ai")} testID="metro-ai"/>
      <View style={{ height: GAP }}/>
      <View style={{ flexDirection: "row", gap: GAP }}>
        <MetroTile color={METRO.cobalt} icon="graph" title="Brain Map" height={134}
          style={{ flex: 1 }} onPress={() => open("/graph")} testID="metro-brain-map"/>
        <MetroTile color={METRO.pink} icon="ticket-percent-outline" title="Promo Vault" height={134}
          style={{ flex: 1 }} onPress={() => open("/promo-vault")} testID="metro-promo-vault"/>
      </View>
      <View style={{ height: GAP }}/>
      <View style={{ flexDirection: "row", gap: GAP }}>
        <MetroTile color={METRO.teal} icon="auto-fix" title="AI Prompts" height={128}
          style={{ flex: 1 }} onPress={() => open("/prompt-vault")} testID="metro-ai-prompts"/>
        <MetroTile color={METRO.purple} icon="bookmark-multiple-outline" title="Link Vault" height={128}
          style={{ flex: 1 }} onPress={() => open("/link-vault")} testID="metro-link-vault"/>
      </View>

      <MetroSection title="Quick actions" trailing={
        <Pressable onPress={() => open("/actions")} accessibilityLabel="All quick actions">
          <Text style={{ color: METRO.cyan, fontWeight: "800", fontSize: 13 }}>ALL ACTIONS  →</Text>
        </Pressable>
      }/>
      <View style={{ flexDirection: "row", gap: GAP }}>
        {ACTIONS.map((a, i) => <Pressable key={a.label} onPress={() => open(a.route)}
          style={{ backgroundColor: [METRO.cyan, METRO.purple, METRO.orange, METRO.green][i], flex: 1,
            height: 74, justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 4, alignItems: "center" }}>
          <Icon name={a.icon} size={24} color={i === 0 || i === 2 ? METRO.ink : METRO.white}/>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: i === 0 || i === 2 ? METRO.ink : METRO.white,
            fontSize: 10, fontFamily: "sans-serif-condensed", fontWeight: "900" }}>{a.label}</Text>
        </Pressable>)}
      </View>

      <MetroSection title="Live activity"/>
      <MetroTile color={METRO.cobalt} title={selected ? selected.provider : "Upcoming activity"}
        subtitle={selected ? (selected.auto_renew === false ? "Access ends " : "Review by ") +
          formatDate(selected.nextDate) + " · " + (selected.days === 0 ? "today" : String(selected.days) + " days") :
          "Renewals and trial endings appear here when dates are available."}
        icon={selected ? "calendar-clock" : "calendar-check"} liveKey={live} horizontal height={116}
        onPress={() => selected ? open("/subscription/" + selected.id) : open("/(tabs)/renewals")}
        testID="metro-live-activity"/>
      <View style={{ height: GAP }}/>
      <MetroTile color={METRO.orange} textColor={METRO.ink} icon="chart-donut" title="Spending overview"
        subtitle={moneyRows.length ? moneyRows.map(([c, a]) => money(Number(a), c)).join(" · ") + " per month" :
          "No confirmed recurring rates yet"}
        horizontal height={115} onPress={() => open("/(tabs)/spending")} testID="metro-spending"/>

      <MetroSection title="More"/>
      <MetroTile color={METRO.purple} icon="view-dashboard" title="Vault & AI"
        subtitle="AI · Prompts · Brain Map · Promo codes · Saved links"
        horizontal height={110} onPress={() => open("/vault-ai")} testID="metro-vault-home"/>
      {total === 0 ? <Pressable onPress={() => open("/import-data")}
        style={{ marginTop: 12, padding: 13, backgroundColor: "#171717", borderWidth: 1, borderColor: METRO.cyan }}>
        <Text style={{ color: METRO.cyan, fontWeight: "900", fontSize: 15 }}>IMPORT YOUR PRIVATE TRACKER  →</Text>
        <Text style={{ color: METRO.white, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
          Load subscriptions, accounts and promo codes from your private JSON file.
        </Text>
      </Pressable> : null}
      <Text style={{ color: METRO.dim, fontSize: 10, letterSpacing: 1.2, textAlign: "center", marginTop: 21 }}>
        SUBMIND METRO · LIVE TILES · PRIVATE BY DESIGN
      </Text>
    </ScrollView>
  </View>;
}
