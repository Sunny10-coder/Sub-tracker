// "My memory": the personal dashboard — when to cancel, where to cancel, which mail id,
// promo codes worth using, and links you asked not to forget.
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMemory } from "@/src/lib/api";
import { KIND_ICON, cancelByLabel, formatDate, money } from "@/src/lib/format";
import { AppHeader, Card, ChipRow, EmptyState, Icon, Loading, PrimaryButton, SectionLabel } from "@/src/components/ui";
import { font, makeStyles, useTheme } from "@/src/theme";

const TABS = ["cancel", "accounts", "promos", "links"];

export default function Memory() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(TABS.includes(params.tab || "") ? (params.tab as string) : "cancel");
  const [copied, setCopied] = useState<string | null>(null);
  const { data, isLoading, isFetching, refetch } = useMemory();

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(text);
    setTimeout(() => setCopied((c) => (c === text ? null : c)), 1600);
  };

  const urgencyColor = (u: string) => (u === "later" ? colors.accentBlue : u === "soon" ? colors.accentOrange : colors.accentRed);

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="My memory" back /><Loading /></View>;

  const cur = data.currency;
  const radar: any[] = data.cancel_radar;

  return (
    <View style={styles.container}>
      <AppHeader title="My memory" subtitle="When, where and which mail id" back />
      <ChipRow items={TABS} value={tab} onChange={setTab} testIDPrefix="mem-tab" />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      >
        {tab === "cancel" ? (
          <>
            {data.missing_info.length ? (
              <Card style={styles.warn}>
                <Icon name="alert-circle-outline" size={20} color={colors.warning} />
                <Text style={styles.warnText}>
                  {data.missing_info.length} subscription{data.missing_info.length > 1 ? "s are" : " is"} missing details:{" "}
                  {data.missing_info.slice(0, 3).map((m: any) => `${m.provider} (${m.missing.map((f: string) => (f === "account_email" ? "mail id" : "renewal date")).join(", ")})`).join("; ")}.
                  Open it to fill in, so cancel reminders are exact.
                </Text>
              </Card>
            ) : null}
            {radar.length === 0 ? (
              <EmptyState icon="check-circle-outline" title="Nothing to cancel" message="Add a subscription or review your inbox. SubMind will tell you when and where to cancel." />
            ) : (
              radar.map((c) => (
                <View key={c.id} style={styles.cancelCard} testID={`cancel-${c.id}`}>
                  <View style={[styles.bar, { backgroundColor: urgencyColor(c.urgency) }]} />
                  <View style={styles.cancelBody}>
                    <Pressable onPress={() => router.push(`/subscription/${c.id}`)}>
                      <Text style={styles.cancelWhen}>{cancelByLabel(c.days_left, c.cancel_by)}</Text>
                      <Text style={styles.cancelName}>{c.provider}{c.plan ? ` · ${c.plan}` : ""}</Text>
                    </Pressable>
                    <Text style={styles.sub}>
                      {c.is_trial ? "Trial converts on" : "Next charge on"} {formatDate(c.charge_date)} · {money(c.price, c.currency || cur)}
                    </Text>

                    <Text style={styles.label}>where to cancel</Text>
                    <Text style={styles.value} selectable>{c.where.steps}</Text>
                    {c.where.url ? (
                      <PrimaryButton title="Open cancel page" icon="open-in-new" variant="secondary" onPress={() => Linking.openURL(c.where.url)} style={{ marginTop: 8 }} testID={`open-cancel-${c.id}`} />
                    ) : null}
                    {c.where.source === "directory" ? <Text style={styles.fine}>Suggested path for {c.provider}. Check it matches your account.</Text> : null}

                    <Text style={styles.label}>account mail id</Text>
                    {c.account_email ? (
                      <Pressable onPress={() => copy(c.account_email)} style={styles.copyRow} accessibilityRole="button" accessibilityLabel={`Copy ${c.account_email}`}>
                        <Text style={styles.value} selectable>{c.account_email}</Text>
                        <Icon name={copied === c.account_email ? "check" : "content-copy"} size={16} color={colors.brandPrimary} />
                      </Pressable>
                    ) : (
                      <Text style={[styles.value, { color: colors.warning }]} onPress={() => router.push(`/subscription/${c.id}`)}>Not saved — tap to add</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}

        {tab === "accounts" ? (
          data.accounts_by_email.length === 0 ? (
            <EmptyState icon="email-outline" title="No accounts yet" message="Subscriptions you add are grouped here by the mail id they were bought with." />
          ) : (
            data.accounts_by_email.map((g: any) => (
              <Card key={g.email} style={{ gap: 8 }} testID={`acct-${g.email}`}>
                <Pressable onPress={() => g.email !== "unknown" && copy(g.email)} style={styles.copyRow}>
                  <Icon name="email-outline" size={18} color={colors.brandPrimary} />
                  <Text style={[styles.acctEmail, { flex: 1 }]} selectable>{g.email === "unknown" ? "mail id not saved" : g.email}</Text>
                  {g.email !== "unknown" ? <Icon name={copied === g.email ? "check" : "content-copy"} size={16} color={colors.muted} /> : null}
                </Pressable>
                <Text style={styles.fine}>{g.subscriptions.length} subscription{g.subscriptions.length > 1 ? "s" : ""} · {money(g.monthly_total, cur)} a month</Text>
                {g.subscriptions.map((s: any) => (
                  <Pressable key={s.id} onPress={() => router.push(`/subscription/${s.id}`)} style={styles.subRow}>
                    <Text style={styles.subName}>{s.provider}{s.plan ? ` · ${s.plan}` : ""}</Text>
                    <Text style={styles.subPrice}>{money(s.price, s.currency || cur)}</Text>
                  </Pressable>
                ))}
              </Card>
            ))
          )
        ) : null}

        {tab === "promos" ? (
          data.promos.length === 0 ? (
            <EmptyState icon="ticket-percent-outline" title="No promo codes" message="Codes found in your emails are kept here until they expire." />
          ) : (
            data.promos.map((p: any) => (
              <Card key={`${p.ref_id}-${p.code}`} style={styles.promo} testID={`promo-${p.code}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{p.provider || "promo"}</Text>
                  <Text style={styles.code} selectable>{p.code}</Text>
                  {p.description ? <Text style={styles.sub}>{p.description}</Text> : null}
                  <Text style={styles.fine}>{p.expires ? `Valid until ${formatDate(p.expires)}${p.days_left !== null ? ` (${p.days_left}d left)` : ""}` : "No expiry found"}</Text>
                </View>
                <PrimaryButton title={copied === p.code ? "Copied" : "Copy"} icon={copied === p.code ? "check" : "content-copy"} variant="secondary" onPress={() => copy(p.code)} style={{ minHeight: 44 }} />
              </Card>
            ))
          )
        ) : null}

        {tab === "links" ? (
          <>
            <SectionLabel>{"don't forget"}</SectionLabel>
            {data.dont_forget.length === 0 ? (
              <EmptyState icon="bookmark-check-outline" title="All caught up" message="Links with a reminder, and ones you saved but never reopened, show up here." />
            ) : (
              data.dont_forget.map((f: any) => (
                <Card key={f.id} style={styles.linkRow} onPress={() => router.push(`/link/${f.id}`)} testID={`forget-${f.id}`}>
                  <Icon name={KIND_ICON[f.kind] || "link-variant"} size={22} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName} numberOfLines={2}>{f.title}</Text>
                    <Text style={styles.fine}>
                      {f.reason === "reminder"
                        ? `Reminder ${f.days_left === 0 ? "today" : f.days_left !== null && f.days_left < 0 ? `${-f.days_left}d overdue` : `in ${f.days_left}d`} · ${formatDate(f.due_date)}`
                        : `Saved ${f.age_days} days ago, never opened`}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  warn: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  warnText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
  cancelCard: { flexDirection: "row", backgroundColor: colors.surfaceSecondary },
  bar: { width: 8 },
  cancelBody: { flex: 1, padding: 14, gap: 2 },
  cancelWhen: { ...font.light, color: colors.onSurface, fontSize: 28 },
  cancelName: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "600", marginTop: 2 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 14 },
  value: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 21, marginTop: 3 },
  fine: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  acctEmail: { color: colors.onSurface, fontSize: 17, fontWeight: "600" },
  subRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  subName: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  subPrice: { color: colors.muted, fontSize: 14 },
  promo: { flexDirection: "row", alignItems: "center", gap: 12 },
  code: { ...font.light, color: colors.brandPrimary, fontSize: 30, letterSpacing: 1, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
}));
