// Review one inbox item: see exactly what was read, fix anything, then decide where it goes.
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInboxItem, useInvalidateAll } from "@/src/lib/api";
import { CATEGORIES, CURRENCIES, CYCLES } from "@/src/lib/format";
import { AppHeader, Card, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { FormScroll, SelectField, TextField } from "@/src/components/form";
import { font, makeStyles, useTheme } from "@/src/theme";

type Form = Record<string, string>;

const FIELDS = ["provider", "plan", "price", "currency", "billing_cycle", "category", "renewal_date", "trial_end", "offer_expiry", "promo_code", "discount", "account_email", "cancel_url"];

export default function Review() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch } = useInboxItem(id!);
  // User edits only; every other field shows what was read from the item.
  const [edits, setEdits] = useState<Form>({});
  const [showText, setShowText] = useState(false);

  const read: Form = {};
  FIELDS.forEach((k) => {
    const v = data?.extraction?.[k];
    read[k] = v === null || v === undefined ? "" : String(v);
  });
  const f: Form = { ...read, ...edits };

  const set = (k: string) => (v: string) => setEdits((s) => ({ ...s, [k]: v }));

  const done = () => { invalidate(); router.back(); };
  const act = useMutation({
    mutationFn: (action: string) => api.inboxAction(id!, { action, edits: f }),
    onSuccess: done,
  });
  const rescan = useMutation({ mutationFn: () => api.inboxReanalyze(id!), onSuccess: () => { refetch(); invalidate(); } });

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Review" back /><Loading /></View>;

  const ex = data.extraction || {};
  const ver = ex.verified || {};
  const doubts: string[] = data.doubts || ex.doubts || [];
  const suggested: string = data.suggested_destination || ex.suggested_destination || "";
  const busy = act.isPending;
  const processed = ["added", "ignored", "merged", "saved"].includes(data.status);
  const verifiedKeys = Object.keys(ver).filter((k) => ver[k]);

  return (
    <View style={styles.container}>
      <AppHeader title="Review" subtitle={`${data.source} · ${Math.round((data.confidence || 0) * 100)}% match`} back />
      <FormScroll>
        {doubts.length ? (
          <Card style={styles.note}>
            <Icon name="help-circle-outline" size={20} color={colors.warning} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.noteTitle}>Please check</Text>
              {doubts.map((d) => <Text key={d} style={styles.noteText}>• {d}</Text>)}
            </View>
          </Card>
        ) : null}
        {verifiedKeys.length ? (
          <Text style={styles.fine}>Confirmed in the original text: {verifiedKeys.map((k) => k.replace(/_/g, " ")).join(", ")}.</Text>
        ) : null}
        {suggested ? <Text style={styles.fine}>Looks like {suggested === "account" ? "an account you already pay for" : suggested === "plan" ? "a plan or offer to consider" : suggested}.</Text> : null}

        <TextField label="Provider" value={f.provider} onChangeText={set("provider")} placeholder="Netflix" testID="rv-provider" />
        <TextField label="Plan" value={f.plan} onChangeText={set("plan")} placeholder="Standard" testID="rv-plan" />
        <TextField label="Price" value={f.price} onChangeText={set("price")} keyboardType="decimal-pad" placeholder="56" testID="rv-price" />
        <SelectField label="Currency" options={CURRENCIES} value={f.currency} onChange={set("currency")} testID="rv-currency" />
        <SelectField label="Billing cycle" options={CYCLES} value={f.billing_cycle} onChange={set("billing_cycle")} testID="rv-cycle" />
        <SelectField label="Category" options={CATEGORIES} value={f.category} onChange={set("category")} testID="rv-category" />
        <TextField label="Renewal date" value={f.renewal_date} onChangeText={set("renewal_date")} placeholder="YYYY-MM-DD" testID="rv-renewal" />
        <TextField label="Trial ends" value={f.trial_end} onChangeText={set("trial_end")} placeholder="YYYY-MM-DD" testID="rv-trial" />
        <TextField label="Offer ends" value={f.offer_expiry} onChangeText={set("offer_expiry")} placeholder="YYYY-MM-DD" testID="rv-offer" />
        <TextField label="Promo code" value={f.promo_code} onChangeText={set("promo_code")} placeholder="SAVE20" testID="rv-promo" />
        <TextField label="Offer / discount" value={f.discount} onChangeText={set("discount")} placeholder="50% off for 3 months" testID="rv-discount" />
        <TextField label="Account mail id" value={f.account_email} onChangeText={set("account_email")} placeholder="you@example.com" keyboardType="email-address" testID="rv-email" />
        <TextField label="Cancel page (optional)" value={f.cancel_url} onChangeText={set("cancel_url")} placeholder="https://…" testID="rv-cancel" />

        {data.raw_text ? (
          <View style={{ gap: 8 }}>
            <Pressable onPress={() => setShowText((v) => !v)} style={styles.toggle} accessibilityRole="button">
              <Icon name={showText ? "chevron-up" : "chevron-down"} size={20} color={colors.brandPrimary} />
              <Text style={styles.toggleText}>{showText ? "Hide" : "Show"} the original text</Text>
            </Pressable>
            {showText ? <Card><Text style={styles.raw} selectable>{data.raw_text}</Text></Card> : null}
            <PrimaryButton title="Re-scan the text" icon="refresh" variant="secondary" onPress={() => rescan.mutate()} loading={rescan.isPending} testID="rv-rescan" />
          </View>
        ) : null}
      </FormScroll>

      {processed ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.fine}>Already handled ({data.status}).</Text>
        </View>
      ) : (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.barRow}>
            <PrimaryButton title="Add as account" icon="account-check" onPress={() => act.mutate("account")} disabled={busy || !f.provider} style={{ flex: 1 }} testID="rv-account" />
            <PrimaryButton title="Add as plan" icon="tag-outline" variant="mint" onPress={() => act.mutate("plan")} disabled={busy || !f.provider} style={{ flex: 1 }} testID="rv-plan-btn" />
          </View>
          <View style={styles.barRow}>
            <PrimaryButton title="Save as link" icon="link-variant" variant="secondary" onPress={() => act.mutate("link")} disabled={busy} style={{ flex: 1 }} testID="rv-link" />
            <PrimaryButton title="Ignore" icon="close" variant="secondary" onPress={() => act.mutate("ignore")} disabled={busy} style={{ flex: 1 }} testID="rv-ignore" />
          </View>
          {!f.provider ? <Text style={styles.fine}>Enter the provider above to add it as an account or plan.</Text> : null}
          {act.isError ? <Text style={[styles.fine, { color: colors.error }]}>Could not save. Check your server connection and try again.</Text> : null}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  note: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  noteTitle: { ...font.light, color: colors.onSurface, fontSize: 20 },
  noteText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  fine: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  toggleText: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600" },
  raw: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  bar: { paddingHorizontal: 16, paddingTop: 10, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  barRow: { flexDirection: "row", gap: 8 },
}));
