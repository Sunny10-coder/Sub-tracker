import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_SPACE } from "./_layout";
import { useInbox, useInsights, useLinks, useMemory, useReminders, useWatchlist, useSubscriptions, useAccounts, useArchivedSubscriptions } from "@/src/lib/api";
import { cancelByLabel, formatDate, money } from "@/src/lib/format";
import { Icon, Loading, SectionLabel } from "@/src/components/ui";
import { Tile, TileBig, TileLine, TileMid, useTileSize } from "@/src/components/tiles";
import { font, makeStyles, useTheme } from "@/src/theme";

const AI_PROMPTS = [
  "When do I cancel Spotify?",
  "Which email is my Netflix on?",
  "What renews this month?",
  "Do I have any promo codes?",
];

const SMALL_TILES = [
  { icon: "magnify", label: "search", href: "/search", key: "accentOrange" },
  { icon: "camera", label: "scan", href: "/scan?mode=camera", key: "accentRed" },
  { icon: "link-variant", label: "save link", href: "/paste-link", key: "accentPink" },
  { icon: "apps", label: "more tools", href: "/restored-tools", key: "accentYellow" },
] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "good morning";
  return h < 18 ? "good afternoon" : "good evening";
}

export default function Start() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pad, gap, square } = useTileSize();

  const ins = useInsights();
  const mem = useMemory();
  const review = useInbox("needs_review");
  const links = useLinks();
  const watch = useWatchlist();
  const currentPlans=useSubscriptions();
  const serviceAccounts=useAccounts();
  const history=useArchivedSubscriptions();
  const rems = useReminders();

  const go = (href: string) => () => router.push(href as never);
  const refetchAll = () => { ins.refetch(); mem.refetch(); review.refetch(); links.refetch(); watch.refetch(); currentPlans.refetch(); serviceAccounts.refetch(); history.refetch(); rems.refetch(); };
  const refreshing = ins.isFetching || mem.isFetching;

  const cur = ins.data?.currency || "AED";
  const radar: any[] = mem.data?.cancel_radar ?? [];
  const promos: any[] = mem.data?.promos ?? [];
  const reviewItems: any[] = review.data ?? [];
  const allLinks: any[] = links.data ?? [];
  const archivedIds = new Set((history.data ?? []).map((s: any) => String(s.id)));
  const upcoming = (rems.data ?? [])
    .filter((r: any) => !r.completed && !archivedIds.has(String(r.ref_id ?? "")))
    .sort((a: any, b: any) => String(a.due_date ?? "").localeCompare(String(b.due_date ?? "")))
    .slice(0, 4);
  const activeCount = (currentPlans.data ?? []).filter((s: any) =>
    ["Active", "Trial"].includes(String(s.status ?? ""))).length;
  const historyCount = history.data?.length ?? 0;
  const renewalsCount = ins.data?.renewals_30d?.length ?? 0;
  const accounts: any[] = mem.data?.accounts_by_email ?? [];
  const missing: any[] = mem.data?.missing_info ?? [];
  const urgent = mem.data?.urgent_count ?? 0;

  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  if (ins.isLoading && !ins.data) return <View style={styles.container}><Loading /></View>;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: TAB_BAR_SPACE + insets.bottom + 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.brandPrimary} />}
      >
        <View style={[styles.head, { paddingHorizontal: pad + 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appLabel}>SUBMIND</Text>
            <Text style={styles.title} accessibilityRole="header">start</Text>
            <Text style={styles.date}>{greeting()} · {dateStr}</Text>
          </View>
        </View>

        <View style={[styles.grid, { paddingHorizontal: pad, gap }]}>
          {/* Lumia live tiles remain square and animated; detail screens and
              infrequently used tools stay one tap away instead of being repeated. */}
          <View style={[styles.row, { gap }]}>
            <Tile title="my memory" icon="head-snowflake-outline" color={colors.accentPurple}
              onPress={go("/memory")} testID="tile-memory" delay={900}
              faces={[
                <View key="missing"><TileBig>{missing.length}</TileBig><TileLine>{missing.length === 1 ? "record needs" : "records need"} a detail</TileLine></View>,
                <View key="urgent"><TileBig>{urgent}</TileBig><TileLine>urgent cancellation deadlines</TileLine></View>,
              ]} />
            <Tile title="saved links" icon="bookmark-multiple" color={colors.accentGreen}
              onPress={go("/link-vault")} testID="tile-links" delay={1500}
              faces={[
                <View key="total"><TileBig>{allLinks.length}</TileBig><TileLine>saved references</TileLine></View>,
                ...allLinks.slice(0, 2).map((l: any) =>
                  <View key={l.id}><TileLine strong>{l.title || "Saved link"}</TileLine><TileLine>{l.collection || l.source || "Library"}</TileLine></View>),
              ]} />
          </View>

          <View style={[styles.row, { gap }]}>
            <Tile title="subscriptions" icon="wallet-outline" color={colors.accentBlue}
              onPress={go("/(tabs)/subscriptions")} testID="tile-subscriptions" delay={550}
              faces={[
                <View key="active"><TileBig>{activeCount}</TileBig><TileLine>active and trial plans</TileLine></View>,
                <View key="monthly"><TileLine strong>{money(ins.data?.monthly_spend, cur)}</TileLine><TileLine>monthly spending in {cur}</TileLine></View>,
                <View key="renew"><TileBig>{renewalsCount}</TileBig><TileLine>renewals within 30 days</TileLine></View>,
              ]} />
            <Tile title="accounts" icon="account-multiple-outline" color={colors.accentGreen}
              onPress={go("/accounts")} testID="tile-accounts" delay={950}
              faces={[
                <View key="services"><TileBig>{serviceAccounts.data?.length ?? 0}</TileBig><TileLine>registered accounts</TileLine></View>,
                <View key="history"><TileBig>{historyCount}</TileBig><TileLine>cancelled or expired plans in history</TileLine></View>,
              ]} />
          </View>

          <Tile wide title="reminders" icon="bell-ring-outline" color={colors.accentOrange}
            onPress={go("/reminders")} testID="tile-reminders" delay={400} height={square * 0.62}
            faces={upcoming.length
              ? upcoming.map((r: any) => <View key={r.id}><TileLine strong>{formatDate(r.due_date)}</TileLine><TileLine>{r.title}</TileLine></View>)
              : [<View key="clear"><TileLine strong>nothing due</TileLine><TileLine>tap to set a reminder</TileLine></View>]} />

          <View style={[styles.row, { gap }]}>
            <Tile title="offers" icon="ticket-percent-outline" color={colors.accentYellow}
              onPress={go("/promo-vault")} testID="tile-offers" delay={700}
              faces={promos.length ? [
                <View key="count"><TileBig>{promos.length}</TileBig><TileLine>saved promo codes</TileLine></View>,
                ...promos.slice(0, 2).map((p: any) =>
                  <View key={p.id || p.code}><TileLine strong>{p.provider || "Offer"}</TileLine><TileLine>{p.days_left == null ? "Open offers for details" : p.days_left + " days left"}</TileLine></View>),
              ] : [<View key="empty"><TileBig>0</TileBig><TileLine>saved promotional offers</TileLine></View>]} />
            <Tile title="inbox" icon="inbox-arrow-down-outline" color={colors.accentPink}
              onPress={go("/(tabs)/inbox")} testID="tile-inbox" delay={1200}
              badge={reviewItems.length > 0 ? reviewItems.length : null}
              faces={[
                <View key="count"><TileBig>{reviewItems.length}</TileBig><TileLine>items to review</TileLine></View>,
                ...reviewItems.slice(0, 2).map((item: any) =>
                  <View key={item.id}><TileLine strong>{item.extraction?.provider || item.extraction?.product || "New finding"}</TileLine><TileLine>review before adding</TileLine></View>),
              ]} />
          </View>

          <View style={[styles.smallWrap, { gap }]}>
            {SMALL_TILES.map((t) => (
              <Tile key={t.label} small title={t.label} icon={t.icon} color={(colors as any)[t.key]}
                onPress={go(t.href)} testID={`small-${t.label}`} />
            ))}
          </View>
        </View>

        {/* Dashboard strip: the next things to act on */}
        <View style={[styles.section, { paddingHorizontal: pad + 8 }]}>
          <SectionLabel right={<Text style={styles.link} onPress={go("/memory")} accessibilityRole="link">see all</Text>}>{"don't miss"}</SectionLabel>
          {radar.length === 0 ? (
            <Text style={styles.muted}>Nothing is due. When you add a subscription, SubMind tells you when and where to cancel and which mail id it is on.</Text>
          ) : (
            radar.slice(0, 3).map((c) => (
              <Pressable key={c.id} onPress={go(`/subscription/${c.id}`)} style={styles.row2} testID={`dm-${c.id}`}>
                <View style={[styles.bar, { backgroundColor: c.urgency === "later" ? colors.accentBlue : c.urgency === "soon" ? colors.accentOrange : colors.accentRed }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{c.provider} · {cancelByLabel(c.days_left, c.cancel_by)}</Text>
                  <Text style={styles.rowSub} selectable>{money(c.price, c.currency || cur)} {c.is_trial ? "after trial" : "next charge"} · {c.account_email || "mail id not saved"}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{c.where.url ? c.where.url.replace(/^https?:\/\//, "") : c.where.steps}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "flex-end", paddingBottom: 14 },
  appLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 2.5 },
  title: { ...font.thin, color: colors.onSurface, fontSize: 64, lineHeight: 70, letterSpacing: -1 },
  date: { color: colors.muted, fontSize: 14, marginTop: 2 },
  grid: { flexDirection: "column" },
  row: { flexDirection: "row" },
  smallWrap: { flexDirection: "row", flexWrap: "wrap" },
  section: { marginTop: 28 },
  link: { color: colors.brandPrimary, fontSize: 15, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  row2: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, marginBottom: 6, paddingRight: 12 },
  bar: { width: 6, alignSelf: "stretch" },
  rowTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "600", paddingTop: 10 },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
}));
