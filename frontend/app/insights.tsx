import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInsights } from "@/src/lib/api";
import { money } from "@/src/lib/format";
import { AppHeader, Card, Icon, Loading } from "@/src/components/ui";
import { accentFor, makeStyles, useTheme } from "@/src/theme";

export default function Insights() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useInsights();

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Insights" back /><Loading /></View>;
  const cur = data.currency;
  const maxCat = Math.max(...(data.category_breakdown || []).map((c: any) => c.amount), 1);

  return (
    <View style={styles.container}>
      <AppHeader title="Insights" back />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.spendRow}>
          <View style={[styles.spendCard, { backgroundColor: colors.accentYellow }]}>
            <Text style={styles.spendLabel}>Monthly</Text>
            <Text style={styles.spendValue}>{money(data.monthly_spend, cur)}</Text>
          </View>
          <View style={[styles.spendCard, { backgroundColor: colors.accentGreen }]}>
            <Text style={styles.spendLabel}>Yearly</Text>
            <Text style={styles.spendValue}>{money(data.yearly_spend, cur)}</Text>
          </View>
        </View>

        {data.category_breakdown?.length ? (
          <Card>
            <Text style={styles.h}>Spend by category</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              {data.category_breakdown.map((c: any, i: number) => (
                <View key={c.category}>
                  <View style={styles.barTop}>
                    <Text style={styles.barLabel}>{c.category}</Text>
                    <Text style={styles.barValue}>{money(c.amount, cur)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(6, (c.amount / maxCat) * 100)}%`, backgroundColor: accentFor(colors, c.category || i) }]} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <View style={styles.statRow}>
          <Stat icon="wallet" label="Active subs" value={String(data.active_count)} />
          <Stat icon="star-outline" label="Top category" value={data.top_category || "—"} />
        </View>

        {data.overlaps?.length ? (
          <Card>
            <Text style={styles.h}>Overlapping categories</Text>
            <Text style={styles.sub}>You have multiple subscriptions in these categories.</Text>
            {data.overlaps.map((o: any) => (
              <View key={o.category} style={styles.overlap}>
                <Icon name="alert-circle-outline" size={18} color={colors.warning} />
                <Text style={styles.overlapText}><Text style={{ fontWeight: "800" }}>{o.category}:</Text> {o.providers.join(", ")}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {data.price_increases?.length ? (
          <Card>
            <Text style={styles.h}>Price increases</Text>
            {data.price_increases.map((p: any, i: number) => (
              <View key={i} style={styles.overlap}>
                <Icon name="trending-up" size={18} color={colors.error} />
                <Text style={styles.overlapText}>{p.provider}: {money(p.from, cur)} → {money(p.to, cur)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {data.trials_ending?.length ? (
          <Card>
            <Text style={styles.h}>Trials ending soon</Text>
            {data.trials_ending.map((t: any) => (
              <View key={t.id} style={styles.overlap}>
                <Icon name="clock-alert-outline" size={18} color={colors.brandTertiary} />
                <Text style={styles.overlapText}>{t.provider} · {t.date}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Text style={styles.note}>Insights are informational observations based on your stored data, not financial advice.</Text>
      </ScrollView>
    </View>
  );
}

function Stat({ icon, label, value }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.stat}>
      <Icon name={icon} size={22} color={colors.brandPrimary} />
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  spendRow: { flexDirection: "row", gap: 12 },
  spendCard: { flex: 1, borderRadius: 22, padding: 18 },
  spendLabel: { color: colors.onAccent, opacity: 0.8, fontSize: 13, fontWeight: "800" },
  spendValue: { color: colors.onAccent, fontSize: 24, fontWeight: "800", marginTop: 6 },
  h: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "800" },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  barTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  barValue: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5 },
  statRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, alignItems: "flex-start", gap: 6 },
  statValue: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  overlap: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 },
  overlapText: { color: colors.onSurfaceSecondary, fontSize: 14, flex: 1, lineHeight: 20 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 },
}));
