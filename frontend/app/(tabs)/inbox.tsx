import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInbox, useInvalidateAll } from "@/src/lib/api";
import { money, formatDate } from "@/src/lib/format";
import { AppHeader, Card, ChipRow, ConfidenceBadge, EmptyState, Icon, Loading } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

const TABS = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs Review" },
  { key: "auto_added", label: "Auto Added" },
  { key: "duplicates", label: "Duplicates" },
];

export default function Inbox() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("all");
  const { data, isLoading, isFetching, refetch } = useInbox(tab);
  const invalidate = useInvalidateAll();

  const act = useMutation({
    mutationFn: ({ id, body }: any) => api.inboxAction(id, body),
    onSuccess: () => { refetch(); invalidate(); },
  });

  const labelMap: any = {
    needs_review: "Needs review", needs_confirmation: "Confirm", auto_added: "Auto added",
    duplicate: "Duplicate", added: "Added", ignored: "Ignored", merged: "Merged", saved: "Saved",
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Smart Inbox" subtitle="AI-processed items to triage" />
      <ChipRow items={TABS.map((t) => t.label)} value={TABS.find((t) => t.key === tab)?.label}
        onChange={(l: string) => setTab(TABS.find((t) => t.label === l)!.key)} testIDPrefix="inbox-tab" />

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <EmptyState icon="inbox-arrow-down-outline" title="Inbox Zero!" message="All items processed. Share a screenshot or link and it will land here for review." />
          }
          renderItem={({ item }) => {
            const ex = item.extraction || {};
            const processed = ["added", "ignored", "merged", "saved"].includes(item.status);
            return (
              <Card testID={`inbox-${item.id}`}>
                <View style={styles.cardTop}>
                  <View style={styles.srcRow}>
                    <Icon name={sourceIcon(item.source)} size={16} color={colors.muted} />
                    <Text style={styles.src}>{item.source}</Text>
                  </View>
                  <ConfidenceBadge value={item.confidence} />
                </View>

                <Text style={styles.title}>{ex.provider || ex.product || "Unknown item"}</Text>
                <Text style={styles.type}>{(ex.content_type || "unknown").toUpperCase()}{ex.plan ? ` · ${ex.plan}` : ""}</Text>

                <View style={styles.fields}>
                  {ex.price != null ? <Field label="Price" value={`${money(ex.price, ex.currency)} / ${ex.billing_cycle || "—"}`} /> : null}
                  {ex.renewal_date ? <Field label="Renews" value={formatDate(ex.renewal_date)} /> : null}
                  {ex.trial_end ? <Field label="Trial ends" value={formatDate(ex.trial_end)} /> : null}
                  {ex.category ? <Field label="Category" value={ex.category} /> : null}
                </View>

                {ex.summary ? <Text style={styles.summary}>{ex.summary}</Text> : null}

                {processed ? (
                  <View style={styles.statusPill}>
                    <Icon name="check-circle" size={16} color={colors.success} />
                    <Text style={styles.statusText}>{labelMap[item.status] || item.status}</Text>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    {item.status === "duplicate" && item.duplicate_of ? (
                      <ActionBtn icon="merge" label="Merge" tone="warning" onPress={() => act.mutate({ id: item.id, body: { action: "merge", merge_into: item.duplicate_of } })} />
                    ) : null}
                    <ActionBtn icon="check" label="Add" tone="mint" onPress={() => act.mutate({ id: item.id, body: { action: "add" } })} />
                    <ActionBtn icon="eye-plus" label="Watch" tone="brand" onPress={() => act.mutate({ id: item.id, body: { action: "watchlist" } })} />
                    <ActionBtn icon="close" label="Ignore" tone="muted" onPress={() => act.mutate({ id: item.id, body: { action: "ignore" } })} />
                  </View>
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
  if (src.includes("screenshot") || src.includes("image")) return "image";
  if (src.includes("link")) return "link-variant";
  if (src.includes("notification")) return "bell-outline";
  return "gesture-tap";
}

function Field({ label, value }: any) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, tone, onPress }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = tone === "mint" ? colors.brandSecondary : tone === "warning" ? colors.warning : tone === "muted" ? colors.muted : colors.brandPrimary;
  return (
    <Pressable onPress={onPress} testID={`inbox-action-${label}`} style={[styles.actionBtn, { backgroundColor: c + "18" }]}>
      <Icon name={icon} size={16} color={c} />
      <Text style={[styles.actionLabel, { color: c }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  srcRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  src: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  title: { color: colors.onSurfaceSecondary, fontSize: 18, fontWeight: "800" },
  type: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  field: { backgroundColor: colors.surfaceTertiary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  fieldValue: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700", marginTop: 2 },
  summary: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 19, marginTop: 12 },
  actions: { flexDirection: "row", gap: 8, marginTop: 16, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  actionLabel: { fontSize: 13, fontWeight: "800" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  statusText: { color: colors.success, fontSize: 13, fontWeight: "700" },
}));
