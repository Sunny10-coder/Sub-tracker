import { METRO } from "@/src/components/metro-tiles";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_SPACE } from "./(tabs)/_layout";
import { useAccounts } from "@/src/lib/api";
import { AppHeader, Card, EmptyState, Icon, Loading, PrimaryButton, ChipRow } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const FILTERS = ["All", "With plans", "Without plans"];
export default function Accounts() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState("All");
  const { data = [], isLoading, isFetching, refetch } = useAccounts();
  const rows = data.filter((a: any) => filter === "All" || (filter === "With plans" ? a.active_plans > 0 : !a.active_plans));
  return <View style={styles.container}>
    <AppHeader title="Accounts" subtitle="One identity, every plan and perk" right={<PrimaryButton title="Add" icon="plus" onPress={() => router.push("/add-account")} />} />
    <ChipRow items={FILTERS} value={filter} onChange={setFilter} />
    {isLoading ? <Loading /> : <FlatList
      data={rows} keyExtractor={(a: any) => a.id}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 12 }}
      ListEmptyComponent={<EmptyState icon="account-circle-outline" title="Accounts live here" message="Each login email is linked to its service and subscriptions, even after a plan expires." action={<PrimaryButton title="Create account" icon="plus" onPress={() => router.push("/add-account")} />} />}
      renderItem={({ item }: any) => <Card onPress={() => router.push({ pathname: "/account/[id]", params: { id: item.id } })} style={[styles.row,{backgroundColor:"#191919",borderRadius:1,borderWidth:0}]}>
        <View style={styles.avatar}><Icon name="account-key-outline" color={METRO.white} size={23}/></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.provider}</Text>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          <Text style={styles.meta}>{item.active_plans || 0} active plans · {item.status || "Active"}</Text>
        </View>
        <Icon name="chevron-right" color={colors.muted}/>
      </Card>}
    />}
  </View>;
}
const useStyles = makeStyles(c => ({
  container: { flex: 1, backgroundColor: METRO.black },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: METRO.cyan, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 17, color: METRO.white, fontWeight: "800" },
  email: { fontSize: 13, color: c.onSurfaceTertiary, marginTop: 2 },
  meta: { color: c.muted, fontSize: 12, marginTop: 4 },
}));