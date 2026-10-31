import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { api, useAccounts, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading } = useAccounts();
  const invalidate = useInvalidateAll();
  const account = data?.find((a: any) => a.id === id);
  const [busy, setBusy] = useState(false);
  const update = useMutation({ mutationFn: (b: any) => api.updateAccount(id!, b), onSuccess: invalidate });
  const remove = async () => { setBusy(true); try { await api.deleteAccount(id!); invalidate(); router.replace("/accounts"); } catch (e: any) { Alert.alert("Unable to delete", e.message); } finally { setBusy(false); } };
  if (isLoading) return <View style={styles.container}><AppHeader title="Account" back /><Loading/></View>;
  if (!account) return <View style={styles.container}><AppHeader title="Account not found" back/></View>;
  return <View style={styles.container}>
    <AppHeader title={account.provider} subtitle="Account identity" back/>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Card><Text style={styles.cap}>SIGN-IN EMAIL</Text><Text selectable style={styles.email}>{account.email}</Text>
        <Text style={styles.small}>This is an account identifier, not a connected inbox.</Text></Card>
      <Card>
        <Text style={styles.cap}>ACCOUNT DETAILS</Text>
        <Text style={styles.detail}>Nickname: {account.display_name || "Not set"}</Text>
        <Text style={styles.detail}>Login URL: {account.login_url || "Not set"}</Text>
        <Text style={styles.detail}>Status: {account.status || "Active"}</Text>
        {account.notes ? <Text style={styles.detail}>Notes: {account.notes}</Text> : null}
      </Card>
      <Text style={styles.heading}>Linked subscriptions</Text>
      {account.plans?.length ? account.plans.map((p: any) => <Card key={p.id} onPress={() => router.push({ pathname: "/subscription/[id]", params: { id: p.id } })}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.detail}>{p.plan || account.provider}</Text><Text style={styles.small}>{p.status}</Text>
        </View></Card>) : <Card><Text style={styles.small}>No linked plans yet. Enter this email when creating a subscription.</Text></Card>}
      <PrimaryButton title={account.status === "Archived" ? "Reactivate account" : "Archive account"} variant="secondary" icon="archive-outline"
        loading={update.isPending} onPress={() => update.mutate({ status: account.status === "Archived" ? "Active" : "Archived" })} />
      <PrimaryButton title="Delete account record" variant="secondary" icon="trash-can-outline" disabled={busy} onPress={() => Alert.alert("Delete account record?", "Subscriptions and payment history will be retained.", [
        { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: remove },
      ])}/>
    </ScrollView>
  </View>;
}
const useStyles = makeStyles(c => ({
  container: { flex: 1, backgroundColor: c.surface },
  heading: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  cap: { fontSize: 11, fontWeight: "800", color: c.brandPrimary, letterSpacing: 1 },
  email: { fontSize: 18, fontWeight: "800", color: c.onSurface, marginTop: 8 },
  detail: { fontSize: 14, color: c.onSurfaceSecondary, marginTop: 8 },
  small: { fontSize: 12, color: c.muted, marginTop: 5 },
}));