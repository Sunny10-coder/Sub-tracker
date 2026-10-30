import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, PrimaryButton } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
export default function InspectOffer() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [result, setResult] = useState<any>(null);
  const inspect = useMutation({mutationFn: () => api.inspectDeal(url.trim()), onSuccess: setResult,
    onError: (e: Error) => Alert.alert("Unable to inspect", e.message)});
  const saveCode = useMutation({mutationFn: (c: any) => api.savePromoCode({
    provider: provider.trim() || new URL(result.url).hostname, code: c.code,
    discount_text: c.discount_text, source: "pasted-link", source_url: result.url,
  }), onSuccess: r => {invalidate(); Alert.alert(r.duplicate ? "Already in vault" : "Code saved", "Code validity is not guaranteed until tested at checkout.");},
  onError: (e: Error) => Alert.alert("Save failed", e.message)});
  return <View style={styles.container}>
    <AppHeader title="Inspect offer link" subtitle="Find prices and promo codes from a pasted page" back/>
    <ScrollView contentContainerStyle={{padding: 20, paddingBottom: insets.bottom + 40, gap: 14}}>
      <Card style={{gap: 12}}>
        <Text style={styles.label}>Offer or pricing page URL</Text>
        <TextInput style={styles.input} value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://..." placeholderTextColor="#8a8593"/>
        <PrimaryButton title="Paste URL" variant="secondary" icon="content-paste" onPress={async () => setUrl(await Clipboard.getStringAsync())}/>
        <Text style={styles.label}>Service name (optional)</Text>
        <TextInput style={styles.input} value={provider} onChangeText={setProvider} placeholder="Seedance / OpenAI / Replit" placeholderTextColor="#8a8593"/>
        <PrimaryButton title="Inspect page" icon="magnify-scan" disabled={!url.trim().startsWith("https://")} loading={inspect.isPending} onPress={() => inspect.mutate()}/>
        <Text style={styles.muted}>Reads accessible public HTTPS pages only. Some sites block automated access. No checkout or coupon redemption is performed.</Text>
      </Card>
      {inspect.isPending ? <ActivityIndicator/> : null}
      {result && <Card style={{gap: 12}}>
        <Text style={styles.title}>Findings</Text>
        <Text style={styles.muted}>Checked {new Date(result.checked_at).toLocaleString()} · Unverified</Text>
        {result.prices?.length ? result.prices.map((p: any, i: number) => <View key={i} style={styles.item}>
          <Text style={styles.title}>{p.currency} {p.amount} · {p.period}</Text><Text style={styles.muted}>{p.evidence}</Text>
        </View>) : <Text style={styles.muted}>No explicit prices detected.</Text>}
        {result.codes?.length ? result.codes.map((c: any) => <View key={c.code} style={styles.item}>
          <Text style={styles.title}>{c.code}</Text><Text style={styles.muted}>{c.discount_text || c.evidence}</Text>
          <PrimaryButton title="Save code to vault" variant="secondary" icon="bookmark-plus" loading={saveCode.isPending} onPress={() => saveCode.mutate(c)}/>
        </View>) : <Text style={styles.muted}>No coupon code detected on this page.</Text>}
        <PrimaryButton title="Open original page" icon="open-in-new" onPress={() => WebBrowser.openBrowserAsync(result.url)}/>
      </Card>}
    </ScrollView>
  </View>;
}
const useStyles = makeStyles(c=>({
  container: {flex:1, backgroundColor:c.surface},
  label: {color:c.onSurface, fontSize:13,fontWeight:"800"},
  title: {color:c.onSurface,fontSize:16,fontWeight:"800"},
  input: {backgroundColor:c.surfaceTertiary,color:c.onSurface,borderRadius:14,padding:14},
  muted: {color:c.muted,fontSize:12,lineHeight:19},
  item: {backgroundColor:c.surfaceTertiary,borderRadius:14,padding:12,gap:8},
}));