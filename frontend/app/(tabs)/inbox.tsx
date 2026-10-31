import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInbox, useInvalidateAll } from "@/src/lib/api";
import { money, formatDate } from "@/src/lib/format";
import { AppHeader, Card, ChipRow, ConfidenceBadge, EmptyState, Icon, Loading } from "@/src/components/ui";
import { font, makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

const TABS = [
  { key: "needs_review", label: "Review" },
  { key: "all", label: "All" },
  { key: "auto_added", label: "Auto added" },
  { key: "duplicates", label: "Duplicates" },
];

const STATUS_LABEL: Record<string, string> = {
  needs_review: "Needs review", needs_confirmation: "Confirm", auto_added: "Auto added",
  duplicate: "Duplicate", added: "Added", ignored: "Ignored", merged: "Merged", saved: "Saved",
};

const PROCESSED = ["added", "ignored", "merged", "saved"];

export default function Inbox() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState("needs_review");
  const { data, isLoading, isFetching, refetch } = useInbox(tab);
  const invalidate = useInvalidateAll();

  const act = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.inboxAction(id, body),
    onSuccess: () => { refetch(); invalidate(); },
  });
  const reanalyze = useMutation({
    mutationFn: (id: string) => api.inboxReanalyze(id),
    onSuccess: () => { refetch(); invalidate(); },
  });

  const send = (id: string, action: string, extra: Record<string, unknown> = {}) => act.mutate({ id, body: { action, ...extra } });

  return (
    <View style={styles.container}>
      <AppHeader title="Inbox" subtitle="Check what was found, then choose where it goes" />
      <ChipRow items={TABS.map((t) => t.label)} value={TABS.find((t) => t.key === tab)?.label}
        onChange={(l: string) => setTab(TABS.find((t) => t.label === l)!.key)} testIDPrefix="inbox-tab" />

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 14, paddingBottom: TAB_BAR_SPACE + insets.bottom + 12, gap: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <EmptyState icon="inbox-arrow-down-outline" title="Inbox zero" message="Nothing to check. Paste an email, share a screenshot or a link and it lands here." />
          }
          renderItem={({ item }) => {
            const ex = item.extraction || {};
            const ver = ex.verified || {};
            const processed = PROCESSED.includes(item.status);
            const suggested: string = item.suggested_destination || ex.suggested_destination || "";
            const doubts: string[] = item.doubts || ex.doubts || [];
            const isDup = item.status === "duplicate" && item.duplicate_of;
            return (
              <Card testID={`inbox-${item.id}`} style={styles.card}>
                <Pressable onPress={() => router.push(`/review/${item.id}`)} accessibilityRole="button" accessibilityLabel={`Review ${ex.provider || ex.product || "item"}`}>
                  <View style={styles.cardTop}>
                    <View style={styles.srcRow}>
                      <Icon name={sourceIcon(item.source)} size={16} color={colors.muted} />
                      <Text style={styles.src}>{item.source}</Text>
                    </View>
                    <ConfidenceBadge value={item.confidence} />
                  </View>

                  <Text style={styles.title}>{ex.provider || ex.product || "Unknown item"}</Text>
                  <Text style={styles.type}>
                    {(ex.content_type || "unknown").toUpperCase()}{ex.plan ? ` · ${ex.plan}` : ""}
                    {suggested ? `  ·  looks like ${suggested === "account" ? "an account" : suggested === "plan" ? "a plan / offer" : suggested}` : ""}
                  </Text>

                  <View style={styles.fields}>
                    {ex.price != null ? <Field label="Price" ok={ver.price} value={`${money(ex.price, ex.currency)}${ex.billing_cycle ? ` / ${ex.billing_cycle}` : ""}`} /> : null}
                    {ex.renewal_date ? <Field label="Renews" ok={ver.renewal_date} value={formatDate(ex.renewal_date)} /> : null}
                    {ex.trial_end ? <Field label="Trial ends" ok={ver.trial_end} value={formatDate(ex.trial_end)} /> : null}
                    {ex.offer_expiry ? <Field label="Offer ends" ok={ver.offer_expiry} value={formatDate(ex.offer_expiry)} /> : null}
                    {ex.promo_code ? <Field label="Promo code" ok accent value={ex.promo_code} /> : null}
                    {ex.discount ? <Field label="Offer" value={ex.discount} /> : null}
                    {ex.account_email ? <Field label="Mail id" ok={ver.account_email} value={ex.account_email} /> : null}
                    {ex.category ? <Field label="Category" value={ex.category} /> : null}
                  </View>

                  {ex.summary ? <Text style={styles.summary}>{ex.summary}</Text> : null}
                  {doubts.length ? (
                    <View style={styles.doubts}>
                      {doubts.slice(0, 3).map((d) => (
                        <View key={d} style={styles.doubtRow}>
                          <Icon name="help-circle-outline" size={15} color={colors.warning} />
                          <Text style={styles.doubtText}>{d}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>

                {processed ? (
                  <View style={styles.statusPill}>
                    <Icon name="check-circle" size={16} color={colors.success} />
                    <Text style={styles.statusText}>{STATUS_LABEL[item.status] || item.status}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.chooseLabel}>{doubts.length || item.confidence < 0.95 ? "Not sure? Choose where it goes:" : "Add it:"}</Text>
                    <View style={styles.actions}>
                      <ActionBtn icon="account-check" label="Add as account" filled={suggested === "account"} tone="brand" onPress={() => send(item.id, "account")} />
                      <ActionBtn icon="tag-outline" label="Add as plan" filled={suggested === "plan"} tone="mint" onPress={() => send(item.id, "plan")} />
                    </View>
                    <View style={styles.actions}>
                      {isDup ? <ActionBtn icon="merge" label="Merge" tone="warning" onPress={() => send(item.id, "merge", { merge_into: item.duplicate_of })} /> : null}
                      <ActionBtn icon="pencil-outline" label="Edit" tone="muted" onPress={() => router.push(`/review/${item.id}`)} />
                      <ActionBtn icon="link-variant" label="Link" tone="muted" onPress={() => send(item.id, "link")} />
                      {item.raw_text ? <ActionBtn icon="refresh" label="Re-scan" tone="muted" onPress={() => reanalyze.mutate(item.id)} /> : null}
                      <ActionBtn icon="close" label="Ignore" tone="muted" onPress={() => send(item.id, "ignore")} />
                    </View>
                  </>
                )}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

function sourceIcon(src: string) {
  if (!src) return "help-circle-outline";
  if (src.includes("email")) return "email-outline";
  if (src.includes("screenshot") || src.includes("image")) return "image";
  if (src.includes("link")) return "link-variant";
  if (src.includes("notification")) return "bell-outline";
  return "gesture-tap";
}

function Field({ label, value, ok, accent }: { label: string; value: string; ok?: boolean; accent?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}{ok ? "  ✓" : ""}</Text>
      <Text style={[styles.fieldValue, accent && { color: colors.brandPrimary }]} selectable>{value}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, tone, filled, onPress }: { icon: string; label: string; tone: string; filled?: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const base: Record<string, string> = { mint: colors.brandSecondary, warning: colors.warning, muted: colors.onSurfaceTertiary, brand: colors.brandPrimary };
  const on: Record<string, string> = { mint: colors.onBrandSecondary, brand: colors.onBrandPrimary, warning: colors.onWarning, muted: colors.surface };
  const c = base[tone] ?? colors.brandPrimary;
  return (
    <Pressable
      onPress={onPress}
      testID={`inbox-action-${label}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.actionBtn, filled ? { backgroundColor: c, borderColor: c } : { borderColor: colors.borderStrong }]}
    >
      <Icon name={icon} size={16} color={filled ? on[tone] : c} />
      <Text style={[styles.actionLabel, { color: filled ? on[tone] : colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  card: { padding: 14 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  srcRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  src: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  title: { ...font.light, color: colors.onSurface, fontSize: 28 },
  type: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  field: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 7 },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  fieldValue: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600", marginTop: 2 },
  summary: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 19, marginTop: 10 },
  doubts: { marginTop: 10, gap: 4 },
  doubtRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  doubtText: { color: colors.warning, fontSize: 12, lineHeight: 17, flex: 1 },
  chooseLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 14 },
  actions: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 42, borderWidth: 2 },
  actionLabel: { fontSize: 13, fontWeight: "600" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  statusText: { color: colors.success, fontSize: 13, fontWeight: "700" },
}));
