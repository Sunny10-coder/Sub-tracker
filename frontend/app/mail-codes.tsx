import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, PrimaryButton } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

function extractMailCodes(text: string) {
  const rx = /(?:promo(?:tional)? code|coupon code|discount code|voucher code|(?:use|apply|enter) (?:the )?code)\s*(?:is|:|=|-)?\s*["'“]?([A-Z0-9][A-Z0-9_-]{3,24})\b/gi;
  const blocked = new Set(["CODE", "CLICK", "HERE", "TODAY", "PROMO", "OFFER", "DISCOUNT", "COUPON"]);
  const out = new Map<string, { code: string; evidence: string }>();
  for (const m of text.matchAll(rx)) {
    const code = m[1].toUpperCase();
    if (!blocked.has(code) && !/^\d+$/.test(code)) out.set(code, { code, evidence: text.slice(Math.max(0, m.index! - 65), m.index! + m[0].length + 95).replace(/\s+/g, " ") });
  }
  return [...out.values()].slice(0, 20);
}
export default function MailCodes() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [text, setText] = useState("");
  const [provider, setProvider] = useState("");
  const [email, setEmail] = useState("");
  const codes = useMemo(() => extractMailCodes(text), [text]);
  const save = useMutation({ mutationFn: (code: string) => api.savePromoCode({
    provider: provider.trim(), account_email: email.trim(), code, source: "pasted-email",
  }), onSuccess: r => { invalidate(); Alert.alert(r.duplicate ? "Code already exists" : "Promo saved",
    "Only this selected promo code and the details you entered were saved; the email text was not uploaded."); },
    onError: (e: Error) => Alert.alert("Could not save", e.message) });
  return <View style={styles.container}>
    <AppHeader title="Find codes in email" subtitle="Private, local extraction from pasted mail" back/>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 14 }}>
      <Card style={{ gap: 12 }}>
        <Text style={styles.heading}>Paste a promotional email</Text>
        <Text style={styles.muted}>Copy the relevant part of an email and paste it here. Codes are detected on your device; no raw email content is sent to the backend. Direct Gmail scanning is not connected.</Text>
        <PrimaryButton title="Paste from clipboard" icon="content-paste" variant="secondary" onPress={async () => setText(await Clipboard.getStringAsync())}/>
        <TextInput style={[styles.input, {height: 145, textAlignVertical: "top"}]} multiline value={text} onChangeText={setText} placeholder="Paste offer email text here…" placeholderTextColor="#908a94"/>
        <Text style={styles.label}>Service / provider (required to save)</Text>
        <TextInput style={styles.input} value={provider} onChangeText={setProvider} placeholder="Example: Seedance, Replit" placeholderTextColor="#908a94"/>
        <Text style={styles.label}>Email account (optional)</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@gmail.com" placeholderTextColor="#908a94"/>
      </Card>
      <Text style={styles.heading}>{codes.length} promo codes detected</Text>
      {codes.length === 0 ? <Card><Text style={styles.muted}>No codes detected. Try copying the line that says “Use code ...” or “Promo code: ...”.</Text></Card> : null}
      {codes.map(c => <Card key={c.code} style={{gap:10}}>
        <Text style={styles.code}>{c.code}</Text>
        <Text style={styles.muted}>{c.evidence}</Text>
        <PrimaryButton title="Save this promo" icon="bookmark-plus" disabled={!provider.trim()} loading={save.isPending} onPress={() => save.mutate(c.code)}/>
      </Card>)}
    </ScrollView>
  </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 heading:{fontSize:18,fontWeight:"800",color:c.onSurface},
 label:{fontSize:13,fontWeight:"800",color:c.onSurfaceSecondary},
 muted:{color:c.muted,fontSize:13,lineHeight:20},
 input:{backgroundColor:c.surfaceTertiary,borderRadius:14,color:c.onSurface,padding:14,fontSize:14},
 code:{fontSize:23,fontWeight:"800",color:c.brandSecondary,letterSpacing:2},
}));