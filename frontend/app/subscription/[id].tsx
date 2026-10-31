import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, useMemory, useSubscription } from "@/src/lib/api";
import { STATUSES, cancelByLabel, formatDate, money, relativeDate } from "@/src/lib/format";
import { AppHeader, Card, CategoryDot, Chip, Loading, PrimaryButton, SectionLabel } from "@/src/components/ui";
import { TextField } from "@/src/components/form";
import { font, makeStyles, useTheme } from "@/src/theme";

export default function SubscriptionDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch } = useSubscription(id!);
  const invalidate = useInvalidateAll();
  const mem = useMemory();
  // Drafts hold only what the user typed; untouched fields show the saved value.
  const [draft, setDraft] = useState<{ mail?: string; cancelUrl?: string; promo?: string }>({});
  const [copied, setCopied] = useState(false);
  const mail = draft.mail ?? data?.account_email ?? "";
  const cancelUrl = draft.cancelUrl ?? data?.cancel_url ?? "";
  const promo = draft.promo ?? data?.promo_code ?? "";
  const setMail = (v: string) => setDraft((d) => ({ ...d, mail: v }));
  const setCancelUrl = (v: string) => setDraft((d) => ({ ...d, cancelUrl: v }));
  const setPromo = (v: string) => setDraft((d) => ({ ...d, promo: v }));

  const patch = useMutation({ mutationFn: (b: any) => api.updateSubscription(id!, b), onSuccess: () => { setDraft({}); refetch(); invalidate(); } });
  const del = useMutation({ mutationFn: () => api.deleteSubscription(id!), onSuccess: () => { invalidate(); router.back(); } });

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Subscription" back /><Loading /></View>;

  const s = data;
  // The cancel plan (cancel-by date, where, which mail id) comes from the memory dashboard.
  const plan = (mem.data?.cancel_radar ?? []).find((c: { id: string }) => c.id === s.id);
  const dirty = mail !== (s.account_email || "") || cancelUrl !== (s.cancel_url || "") || promo !== (s.promo_code || "");
  const copyMail = async () => { await Clipboard.setStringAsync(s.account_email); setCopied(true); setTimeout(() => setCopied(false), 1500); };
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

        {plan ? (
          <View style={styles.cancelBox} testID="cancel-plan">
            <Text style={styles.cancelWhen}>{cancelByLabel(plan.days_left, plan.cancel_by)}</Text>
            <Text style={styles.cancelSub}>
              {plan.is_trial ? "Trial converts" : "Next charge"} {formatDate(plan.charge_date)} · {money(plan.price, plan.currency)}
            </Text>
            <Text style={styles.cancelLabel}>where to cancel</Text>
            <Text style={styles.cancelText} selectable>{plan.where.steps}</Text>
            {plan.where.url ? <PrimaryButton title="Open cancel page" icon="open-in-new" variant="secondary" onPress={() => Linking.openURL(plan.where.url)} style={{ marginTop: 8 }} testID="open-cancel" /> : null}
            <Text style={styles.cancelLabel}>account mail id</Text>
            <Text style={styles.cancelText} selectable onPress={s.account_email ? copyMail : undefined}>
              {s.account_email ? `${s.account_email}${copied ? "  (copied)" : "  (tap to copy)"}` : "Not saved yet. Add it below."}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <SectionLabel>remember</SectionLabel>
          <TextField label="Account mail id" value={mail} onChangeText={setMail} placeholder="the email this account uses" keyboardType="email-address" testID="sub-mail" />
          <TextField label="Cancel page" value={cancelUrl} onChangeText={setCancelUrl} placeholder="https://… (we suggest one for well-known services)" testID="sub-cancel-url" />
          <TextField label="Promo code" value={promo} onChangeText={setPromo} placeholder="SAVE20" testID="sub-promo" />
          {dirty ? (
            <PrimaryButton title="Save details" icon="content-save-outline" onPress={() => patch.mutate({ account_email: mail.trim().toLowerCase(), cancel_url: cancelUrl.trim(), promo_code: promo.trim().toUpperCase() })} loading={patch.isPending} testID="sub-save-memory" />
          ) : null}
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
          <PrimaryButton title="Record payment" icon="cash-check" variant="mint" onPress={() => router.push({pathname:"/record-payment",params:{id:String(id)}})} testID="record-payment" />
          <PrimaryButton title="Add reminder" icon="bell-plus" variant="secondary" onPress={() => router.push("/add-reminder")} />
          <PrimaryButton title="Delete" icon="trash-can-outline" variant="secondary" onPress={() => Alert.alert("Delete subscription?","This removes the saved record and its local payment history. It does not cancel the provider subscription.",[
            {text:"Keep",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>del.mutate()}
          ])} loading={del.isPending} testID="delete-sub" style={{ backgroundColor: colors.error + "18" }} />
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
  meta: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: 14, minWidth: "47%", flexGrow: 1 },
  metaLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  metaValue: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700", marginTop: 4 },
  sectionLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  cancelBox: { backgroundColor: colors.accentRed, padding: 16, gap: 2 },
  cancelWhen: { ...font.light, color: colors.onAccent, fontSize: 30 },
  cancelSub: { color: colors.onAccent, fontSize: 14, marginTop: 2 },
  cancelLabel: { color: colors.onAccent, opacity: 0.85, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 14 },
  cancelText: { color: colors.onAccent, fontSize: 15, lineHeight: 21, marginTop: 3 },
  notes: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  payDate: { color: colors.muted, fontSize: 14 },
  payAmt: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
}));
