import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, usePriceHistory } from "@/src/lib/api";
import { AppHeader, Card, Chip, Icon, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const MODES = ["all", "plans", "offers"] as const;
export default function Deals() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q || "");
  const [mode, setMode] = useState<string>("all");
  const [response, setResponse] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [cycle, setCycle] = useState("monthly");
  const invalidate = useInvalidateAll();
  const history = usePriceHistory(selected?.title || "");
  const search = useMutation({
    mutationFn: ({ refresh }: { refresh: boolean }) => api.dealsSearch(query.trim(), mode, refresh),
    onSuccess: setResponse,
    onError: (error: Error) => Alert.alert("Search unavailable", error.message),
  });
  const saveCode = useMutation({
    mutationFn: (p: any) => api.savePromoCode(p),
    onSuccess: (r: any) => { invalidate(); Alert.alert(r.duplicate ? "Already saved" : "Promo saved", "This code is unverified until tested at checkout."); },
    onError: (e: Error) => Alert.alert("Could not save code", e.message),
  });
  const track = useMutation({
    mutationFn: () => api.trackPrice({ provider: selected?.title || "", url: selected?.url,
      amount: Number(amount), currency: currency.trim().toUpperCase(), billing_cycle: cycle,
      source: "user-confirmed" }),
    onSuccess: (r: any) => { invalidate(); Alert.alert(r.duplicate ? "Already tracked" : "Price snapshot saved",
      r.change === null || r.change === undefined ? "Future prices can be compared against this amount." :
      r.change === 0 ? "No rate change recorded." : `Price changed by \${r.change} \${currency}.`); },
    onError: (e: Error) => Alert.alert("Could not track price", e.message),
  });
  useEffect(() => { if (params.q && params.q.length >= 2) search.mutate({ refresh: false }); }, []);
  const items = response?.items || [];
  return <View style={styles.container}>
    <AppHeader title="Deals & Plans" subtitle="Search pricing, trials and promo codes" back />
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 50, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Card style={styles.hero}>
        <Icon name="magnify-scan" color={colors.brandSecondary} size={26}/>
        <Text style={styles.heroTitle}>Find better plans, not just coupons.</Text>
        <Text style={styles.dim}>Search Seedance, Claude, Replit or any subscription. Results show source links and are not guaranteed checkout prices.</Text>
        <View style={styles.searchRow}>
          <TextInput style={styles.searchInput} placeholder="Search Seedance plans and offers…" placeholderTextColor={colors.muted}
            value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => query.trim().length >= 2 && search.mutate({ refresh: false })}/>
          <Pressable disabled={search.isPending || query.trim().length < 2} onPress={() => search.mutate({ refresh: false })} style={styles.searchButton}>
            <Icon name="arrow-right" size={22} color={colors.onAccent}/>
          </Pressable>
        </View>
        <View style={styles.chips}>{MODES.map(m => <Chip key={m} label={m === "all" ? "All" : m === "plans" ? "Plans" : "Offers"} active={mode === m} onPress={() => setMode(m)}/>)}</View>
        <View style={styles.chips}>{["Seedance", "ChatGPT", "Claude", "Replit"].map(q => <Chip key={q} label={q} active={query === q} onPress={() => { setQuery(q); setResponse(null); }}/>)}</View>
      </Card>
      <View style={styles.headerRow}>
        <Text style={styles.section}>Search results {items.length ? `(\${items.length})` : ""}</Text>
        {response?.search_enabled && <Pressable onPress={() => search.mutate({ refresh: true })}><Text style={styles.linkText}>Refresh</Text></Pressable>}
      </View>
      {search.isPending ? <ActivityIndicator size="large" color={colors.brandPrimary}/> : null}
      {response?.message ? <Text style={styles.dim}>{response.message}</Text> : null}
      {response?.checked_at ? <Text style={styles.dim}>Source checked: {new Date(response.checked_at).toLocaleString()} · {response.cached ? "Cached" : "New search"}</Text> : null}
      {!response && !search.isPending ? <Card><Text style={styles.dim}>Start with a product name. SubMind will show source-backed pricing snippets, offers and direct links.</Text></Card> : null}
      {items.map((item: any, i: number) => <Card key={item.canonical_url + i} style={{ gap: 9 }}>
        <View style={styles.headerRow}><Text style={styles.resultTitle}>{item.title || item.site}</Text><Text style={styles.meta}>{item.kind}</Text></View>
        <Text style={styles.dim}>{item.site} · {item.verification || "unverified"}</Text>
        <Text style={styles.description}>{item.description}</Text>
        {item.prices?.map((p: any, ix: number) => <View key={ix} style={styles.priceLine}>
          <Text style={styles.price}>{p.currency} {p.amount}{p.period !== "unknown" ? ` / \${p.period}` : ""}</Text>
          <Text style={styles.meta}>Mentioned, not checkout-verified</Text>
        </View>)}
        {item.codes?.map((c: any) => <View key={c.code} style={styles.codeLine}>
          <Text style={styles.code}>{c.code}</Text><Pressable onPress={() => saveCode.mutate({ provider: item.title || item.site, code: c.code, source_url: item.url, discount_text: c.discount_text, source: "web-search" })}><Text style={styles.linkText}>Save code</Text></Pressable>
        </View>)}
        <View style={styles.chips}>
          <Pressable style={styles.action} onPress={() => WebBrowser.openBrowserAsync(item.url)}><Icon name="open-in-new" size={17} color={colors.brandPrimary}/><Text style={styles.linkText}>Open source</Text></Pressable>
          <Pressable style={styles.action} onPress={() => router.push({pathname: "/paste-link", params: {url: item.url}})}><Icon name="bookmark-plus" size={17} color={colors.brandPrimary}/><Text style={styles.linkText}>Save link</Text></Pressable>
          <Pressable style={styles.action} onPress={() => { setSelected(item); const first = item.prices?.[0]; setAmount(first ? String(first.amount) : ""); setCurrency(first?.currency === "$" ? "USD" : first?.currency || "USD"); setCycle(first?.period === "yearly" ? "yearly" : "monthly"); }}><Icon name="chart-line" size={17} color={colors.brandPrimary}/><Text style={styles.linkText}>Track rate</Text></Pressable>
        </View>
      </Card>)}
      {selected ? <Card style={{ gap: 12 }}>
        <Text style={styles.section}>Track pricing: {selected.title}</Text>
        <Text style={styles.dim}>Confirm the amount against the provider page before saving. Search snippets cannot establish actual billing rates.</Text>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Confirmed price" placeholderTextColor={colors.muted} style={styles.field}/>
        <TextInput value={currency} onChangeText={setCurrency} placeholder="Currency e.g. USD" placeholderTextColor={colors.muted} style={styles.field}/>
        <View style={styles.chips}>{["monthly", "yearly", "weekly", "unknown"].map(x => <Chip key={x} label={x} active={cycle === x} onPress={() => setCycle(x)}/>)}</View>
        <PrimaryButton title="Save confirmed price" icon="check" disabled={!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0} loading={track.isPending} onPress={() => track.mutate()}/>
        <Text style={styles.meta}>Recorded price history: {history.data?.length || 0} entries matching this provider name</Text>
      </Card> : null}
      <PrimaryButton title="Paste offer URL" icon="link-variant" variant="secondary" onPress={() => router.push("/inspect-offer")}/>
      <PrimaryButton title="My promo vault" icon="ticket-percent" variant="secondary" onPress={() => router.push("/promo-vault")}/>
    </ScrollView>
  </View>;
}
const useStyles = makeStyles(c => ({
  container: { flex: 1, backgroundColor: c.surface },
  hero: { gap: 12, borderRadius: 26 },
  heroTitle: { color: c.onSurface, fontSize: 24, fontWeight: "800" },
  dim: { color: c.muted, fontSize: 12, lineHeight: 18 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, color: c.onSurface, fontSize: 15 },
  searchButton: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center", backgroundColor: c.accentYellow },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  section: { color: c.onSurface, fontSize: 17, fontWeight: "800", flexShrink: 1 },
  resultTitle: { color: c.onSurface, fontSize: 15, fontWeight: "800", flex: 1 },
  description: { color: c.onSurfaceTertiary, fontSize: 13, lineHeight: 20 },
  priceLine: { backgroundColor: c.surfaceTertiary, padding: 10, borderRadius: 12, gap: 2 },
  price: { color: c.brandSecondary, fontSize: 17, fontWeight: "800" },
  meta: { color: c.muted, fontSize: 11 },
  codeLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, backgroundColor: c.surfaceTertiary, padding: 12 },
  code: { color: c.onSurface, fontWeight: "800", letterSpacing: 1 },
  action: { flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 7, paddingHorizontal: 6 },
  linkText: { color: c.brandPrimary, fontSize: 13, fontWeight: "800" },
  field: { color: c.onSurface, backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 14 },
}));
