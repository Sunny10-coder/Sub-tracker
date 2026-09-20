import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, useSubscription } from "@/src/lib/api";
import { STATUSES, formatDate, money, relativeDate } from "@/src/lib/format";
import { AppHeader, Card, CategoryDot, Chip, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function SubscriptionDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch } = useSubscription(id!);
  const invalidate = useInvalidateAll();

  const patch = useMutation({ mutationFn: (b: any) => api.updateSubscription(id!, b), onSuccess: () => { refetch(); invalidate(); } });
  const del = useMutation({ mutationFn: () => api.deleteSubscription(id!), onSuccess: () => { invalidate(); router.back(); } });
  const pay = useMutation({ mutationFn: () => api.recordPayment(id!, {}), onSuccess: () => { refetch(); invalidate(); } });

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Subscription" back /><Loading /></View>;

  const s = data;
  return (
    <View style={styles.container}>
      <AppHeader title={s.provider} back />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Card style={styles.head}>
          <CategoryDot category={s.category} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{s.product || s.provider}</Text>
            <Text style={styles.plan}>{s.plan || s.category}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.price}>{money(s.price, s.currency)}</Text>
            <Text style={styles.cycle}>/ {s.billing_cycle}</Text>
          </View>
        </Card>

        <View style={styles.metaGrid}>
          <Meta label="Renewal" value={s.renewal_date ? `${formatDate(s.renewal_date)} · ${relativeDate(s.renewal_date)}` : "—"} />
          {s.trial_end ? <Meta label="Trial ends" value={`${formatDate(s.trial_end)} · ${relativeDate(s.trial_end)}`} /> : null}
          <Meta label="Category" value={s.category} />
          <Meta label="Auto-renew" value={s.auto_renew ? "On" : "Off"} />
          {s.source ? <Meta label="Source" value={s.source} /> : null}
        </View>

        <Text style={styles.sectionLabel}>Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {STATUSES.map((st) => <Chip key={st} label={st} active={s.status === st} onPress={() => patch.mutate({ status: st })} testID={`status-${st}`} />)}
        </ScrollView>

        {s.notes ? <Card><Text style={styles.notes}>{s.notes}</Text></Card> : null}

        {s.payments?.length ? (
          <Card>
            <Text style={styles.sectionLabel}>Payment history</Text>
            {s.payments.map((p: any, i: number) => (
              <View key={i} style={styles.payRow}>
                <Text style={styles.payDate}>{formatDate(p.date)}</Text>
                <Text style={styles.payAmt}>{money(p.amount, p.currency)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={{ gap: 10 }}>
          <PrimaryButton title="Record payment" icon="cash-check" variant="mint" onPress={() => pay.mutate()} loading={pay.isPending} testID="record-payment" />
          <PrimaryButton title="Add reminder" icon="bell-plus" variant="secondary" onPress={() => router.push("/add-reminder")} />
          <PrimaryButton title="Delete" icon="trash-can-outline" variant="secondary" onPress={() => del.mutate()} loading={del.isPending} testID="delete-sub" style={{ backgroundColor: colors.error + "18" }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: any) {
  const styles = useStyles();
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { color: colors.onSurfaceSecondary, fontSize: 20, fontWeight: "800" },
  plan: { color: colors.muted, fontSize: 14, marginTop: 2 },
  price: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  cycle: { color: colors.muted, fontSize: 13 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  meta: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, minWidth: "47%", flexGrow: 1 },
  metaLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  metaValue: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700", marginTop: 4 },
  sectionLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  notes: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  payDate: { color: colors.muted, fontSize: 14 },
  payAmt: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
}));
