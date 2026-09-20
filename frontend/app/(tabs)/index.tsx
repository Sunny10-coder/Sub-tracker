import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_SPACE } from "./_layout";
import { useInsights, useLinks, useSubscriptions, useWatchlist } from "@/src/lib/api";
import { money, relativeDate } from "@/src/lib/format";
import { Card, Icon, Loading } from "@/src/components/ui";
import { accentFor, makeStyles, useTheme } from "@/src/theme";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const QUICK = [
  { icon: "camera", label: "Scan", href: "/scan?mode=camera", key: "accentRed" },
  { icon: "link-variant", label: "Paste", href: "/paste-link", key: "accentBlue" },
  { icon: "chat-processing", label: "Ask AI", href: "/(tabs)/ai", key: "accentPurple" },
  { icon: "wallet-plus", label: "Add", href: "/add-subscription", key: "accentGreen" },
];

const SHORTCUTS = [
  { icon: "bookmark-multiple", label: "Link Vault", href: "/link-vault" },
  { icon: "eye-check", label: "Watchlist", href: "/watchlist" },
  { icon: "bell", label: "Reminders", href: "/reminders" },
  { icon: "chart-donut", label: "Insights", href: "/insights" },
  { icon: "graph", label: "Brain Map", href: "/graph" },
];

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ins = useInsights();
  const links = useLinks();
  const watch = useWatchlist();
  const subs = useSubscriptions();

  const data = ins.data;
  const cur = data?.currency || "AED";
  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const weekday = today.toLocaleDateString(undefined, { weekday: "long" });

  const refreshing = ins.isFetching || links.isFetching || watch.isFetching;
  const refetchAll = () => { ins.refetch(); links.refetch(); watch.refetch(); subs.refetch(); };

  const renews = data?.renewals_30d?.length ?? 0;
  const trials = data?.trials_ending?.length ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.topRow}>
          <Text style={styles.hi}>{greeting()}</Text>
          <View style={styles.dateBox}>
            <View style={styles.dateDot} />
            <Text style={styles.dateText}>{dateStr}  ·  {weekday}</Text>
          </View>
        </View>
        <Text style={styles.brand}>SubMind</Text>

        {ins.isLoading ? (
          <Loading />
        ) : (
          <>
            {/* Expressive dark hero card */}
            <View style={styles.hero}>
              <Text style={styles.heroLead}>Here is your money memory today.</Text>
              <Text style={styles.heroBig}>
                You are spending{" "}
                <Text style={[styles.hl, { color: colors.accentYellow }]}>{money(data?.monthly_spend, cur)}</Text>
                <Text style={styles.heroBig}> a month across </Text>
                <Text style={[styles.hl, { color: colors.accentGreen }]}>{data?.active_count ?? 0} subs</Text>
                <Text style={styles.heroBig}>. </Text>
                <Text style={[styles.hl, { color: colors.accentOrange }]}>{renews}</Text>
                <Text style={styles.heroBig}> renew soon and </Text>
                <Text style={[styles.hl, { color: colors.accentPink }]}>{trials} trials</Text>
                <Text style={styles.heroBig}> are ending.</Text>
              </Text>
              <View style={styles.heroChips}>
                <View style={styles.heroChip}><Text style={styles.heroChipLabel}>Yearly</Text><Text style={styles.heroChipValue}>{money(data?.yearly_spend, cur)}</Text></View>
                <View style={styles.heroChip}><Text style={styles.heroChipLabel}>Renews 30d</Text><Text style={styles.heroChipValue}>{renews}</Text></View>
              </View>
            </View>

            {/* Quick actions */}
            <View style={styles.quickRow}>
              {QUICK.map((q) => (
                <Card key={q.label} style={[styles.quick, { backgroundColor: (colors as any)[q.key] }]} onPress={() => router.push(q.href as any)} testID={`quick-${q.label}`}>
                  <Icon name={q.icon} size={24} color={colors.onAccent} />
                  <Text style={styles.quickLabel}>{q.label}</Text>
                </Card>
              ))}
            </View>

            {/* Shortcuts */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutRow}>
              {SHORTCUTS.map((s) => (
                <Card key={s.label} style={styles.shortcut} onPress={() => router.push(s.href as any)} testID={`shortcut-${s.label}`}>
                  <Icon name={s.icon} size={18} color={colors.onSurface} />
                  <Text style={styles.shortcutLabel}>{s.label}</Text>
                </Card>
              ))}
            </ScrollView>

            {/* Upcoming renewals */}
            <Section title="Upcoming renewals" onSeeAll={() => router.push("/(tabs)/subscriptions")}>
              {data?.renewals_30d?.length ? (
                data.renewals_30d.slice(0, 4).map((r: any, i: number) => (
                  <Pressable key={r.id} testID={`renew-${r.id}`} onPress={() => router.push(`/subscription/${r.id}`)} style={[styles.bubble, { backgroundColor: accentFor(colors, r.provider || i) }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bubbleTitle} numberOfLines={1}>{r.provider}</Text>
                      <Text style={styles.bubbleSub}>Renews {relativeDate(r.date)}</Text>
                    </View>
                    <Text style={styles.bubbleAmount}>{money(r.price, r.currency || cur)}</Text>
                    <Icon name="chevron-right" size={22} color={colors.onAccent} />
                  </Pressable>
                ))
              ) : (
                <EmptyRow text="No renewals in the next 30 days." />
              )}
            </Section>

            {/* Recent links */}
            <Section title="Recent saved links" onSeeAll={() => router.push("/link-vault")}>
              {links.data?.length ? (
                links.data.slice(0, 3).map((l: any, i: number) => (
                  <Card key={l.id} style={styles.linkRow} onPress={() => router.push(`/link/${l.id}`)}>
                    <View style={[styles.linkIcon, { backgroundColor: accentFor(colors, l.title || i) }]}>
                      <Icon name="link-variant" size={20} color={colors.onAccent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkTitle} numberOfLines={1}>{l.title}</Text>
                      <Text style={styles.linkSub} numberOfLines={1}>{l.source} · {l.category}</Text>
                    </View>
                  </Card>
                ))
              ) : (
                <EmptyRow text="Share a link to SubMind to start your vault." />
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Lightweight helpers for the home sections.
function EmptyRow({ text }: { text: string }) {
  const styles = useStyles();
  return <Card><Text style={styles.muted}>{text}</Text></Card>;
}

function Section({ title, children, onSeeAll }: any) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onSeeAll ? <Text style={styles.seeAll} onPress={onSeeAll}>See all</Text> : null}
      </View>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 22 },
  hi: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  dateBox: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentOrange },
  dateText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  brand: { color: colors.onSurface, fontSize: 40, fontWeight: "800", letterSpacing: -1.2, paddingHorizontal: 22, marginTop: 2 },
  hero: { backgroundColor: colors.surfaceInverse, marginHorizontal: 18, marginTop: 16, borderRadius: 30, padding: 24 },
  heroLead: { color: "#FFFFFF99", fontSize: 14, fontWeight: "700", marginBottom: 10 },
  heroBig: { color: colors.onSurfaceInverse, fontSize: 25, fontWeight: "800", lineHeight: 34, letterSpacing: -0.5 },
  hl: { fontSize: 25, fontWeight: "800", lineHeight: 34, letterSpacing: -0.5 },
  heroChips: { flexDirection: "row", gap: 10, marginTop: 20 },
  heroChip: { backgroundColor: "#FFFFFF14", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, flex: 1 },
  heroChipLabel: { color: "#FFFFFF99", fontSize: 12, fontWeight: "700" },
  heroChipValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  quickRow: { flexDirection: "row", gap: 10, paddingHorizontal: 18, marginTop: 18 },
  quick: { flex: 1, alignItems: "center", gap: 8, paddingVertical: 16, paddingHorizontal: 4, borderWidth: 0, borderRadius: 22 },
  quickLabel: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  shortcutRow: { gap: 10, paddingHorizontal: 18, marginTop: 16 },
  shortcut: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999 },
  shortcutLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  section: { marginTop: 26, paddingHorizontal: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  seeAll: { color: colors.brandPrimary, fontSize: 14, fontWeight: "800" },
  bubble: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16 },
  bubbleTitle: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  bubbleSub: { color: colors.onAccent, opacity: 0.75, fontSize: 13, marginTop: 2, fontWeight: "600" },
  bubbleAmount: { color: colors.onAccent, fontSize: 16, fontWeight: "800" },
  bubblePress: { ...{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  linkIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  linkTitle: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  linkSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  muted: { color: colors.muted, fontSize: 14 },
}));
