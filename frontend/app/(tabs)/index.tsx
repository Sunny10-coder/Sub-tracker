import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_SPACE } from "./_layout";
import { useInbox, useInsights, useLinks, useMemory, useReminders, useWatchlist } from "@/src/lib/api";
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
  { icon: "eye-check", label: "plans", href: "/watchlist", key: "accentBlue" },
  { icon: "chart-donut", label: "insights", href: "/insights", key: "accentGreen" },
  { icon: "graph", label: "brain map", href: "/tool-brain", key: "accentPurple" },
  { icon: "magnify", label: "search", href: "/search", key: "accentOrange" },
  { icon: "camera", label: "scan", href: "/scan?mode=camera", key: "accentRed" },
  { icon: "link-variant", label: "paste link", href: "/paste-link", key: "accentPink" },
  { icon: "email-plus-outline", label: "paste email", href: "/add-email", key: "accentYellow" },
  { icon: "cog", label: "settings", href: "/settings", key: "accentBlue" },
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
  const rems = useReminders();

  const go = (href: string) => () => router.push(href as never);
  const refetchAll = () => { ins.refetch(); mem.refetch(); review.refetch(); links.refetch(); watch.refetch(); rems.refetch(); };
  const refreshing = ins.isFetching || mem.isFetching;

  const cur = ins.data?.currency || "AED";
  const radar: any[] = mem.data?.cancel_radar ?? [];
  const promos: any[] = mem.data?.promos ?? [];
  const reviewItems: any[] = review.data ?? [];
  const allLinks: any[] = links.data ?? [];
  const repos = allLinks.filter((l) => l.kind === "github" || (typeof l.url==="string" && /^https?:\/\/(www\.)?github\.com\//i.test(l.url)));
  const upcoming = (rems.data ?? []).filter((r: any) => !r.completed).slice(0, 4);
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
          {/* Prioritise the exact Lumia layout selected by the user: two rows of
              2-up memory/link tiles, wide reminder, then the shortcut grid.
              Live values and animations are retained. */}
          <View style={[styles.row, { gap }]}>
            <Tile
              title="my memory" icon="head-snowflake-outline" color={colors.accentPurple} onPress={go("/memory")} testID="tile-memory" delay={900}
              faces={[
                <View key="a"><TileBig>{accounts.filter((a) => a.email !== "unknown").length}</TileBig><TileLine>mail ids with subscriptions</TileLine></View>,
                <View key="m"><TileBig>{missing.length}</TileBig><TileLine>{missing.length === 1 ? "subscription is" : "subscriptions are"} missing a detail</TileLine></View>,
              ]}
            />
            <Tile
              title="saved links" icon="bookmark-multiple" color={colors.accentGreen} onPress={go("/link-vault")} testID="tile-links" delay={1500}
              faces={[
                <View key="n"><TileBig>{allLinks.length}</TileBig><TileLine>links you will not forget</TileLine></View>,
                ...allLinks.slice(0, 2).map((l) => <View key={l.id}><TileLine strong>{l.title}</TileLine><TileLine>{l.collection || l.source}</TileLine></View>),
              ]}
            />
          </View>

          <View style={[styles.row, { gap }]}>
            <Tile
              title="github" icon="github" color={colors.accentYellow} onPress={go("/link-vault?kind=github")} testID="tile-github" delay={700}
              faces={[
                <View key="n"><TileBig>{repos.length}</TileBig><TileLine>repos saved</TileLine></View>,
                ...repos.slice(0, 2).map((l) => <View key={l.id}><TileLine strong>{l.title}</TileLine><TileLine>{(l.use_cases || [])[0] || l.summary}</TileLine></View>),
              ]}
            />
            <Tile
              title="promo codes" icon="ticket-percent-outline" color={colors.accentBlue} onPress={go("/memory?tab=promos")} testID="tile-promos" delay={1800}
              faces={promos.length
                ? [
                  <View key="n"><TileBig>{promos.length}</TileBig><TileLine>codes to use</TileLine></View>,
                  ...promos.slice(0, 2).map((p) => <View key={p.code}><TileLine strong>{p.provider}</TileLine><TileLine>{p.code}{p.days_left !== null ? ` · ${p.days_left}d left` : ""}</TileLine></View>),
                ]
                : [<View key="e"><TileBig>0</TileBig><TileLine>no active promo codes</TileLine></View>]}
            />
          </View>

          <Tile
            wide title="reminders" icon="bell-ring-outline" color={colors.accentOrange} onPress={go("/reminders")} testID="tile-reminders" delay={400} height={square * 0.62}
            faces={upcoming.length
              ? upcoming.map((r: any) => <View key={r.id}><TileLine strong>{formatDate(r.due_date)}</TileLine><TileLine>{r.title}</TileLine></View>)
              : [<View key="e"><TileLine strong>no reminders</TileLine><TileLine>tap to add one</TileLine></View>]}
          />

          {/* Quarter-size shortcuts */}
          <View style={[styles.smallWrap, { gap }]}>
            {SMALL_TILES.map((t) => (
              <Tile key={t.label} small title={t.label} icon={t.icon} color={(colors as any)[t.key]} onPress={go(t.href)} testID={`small-${t.label}`} />
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
