import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubscriptions } from "@/src/lib/api";
import { money, relativeDate } from "@/src/lib/format";
import { AppHeader, Badge, Card, CategoryDot, ChipRow, EmptyState, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

const FILTERS = ["All", "Active", "Trial", "Paused", "Cancelled", "Expired"];

const statusTone: any = { Active: "success", Trial: "mint", Paused: "warning", Cancelled: "error", Expired: "muted", Unknown: "muted" };

export default function Subscriptions() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState("All");
  const { data, isLoading, isFetching, refetch } = useSubscriptions(filter === "All" ? undefined : filter);

  return (
    <View style={styles.container}>
      <AppHeader
        title="Subscriptions"
        subtitle={data ? `${data.length} ${filter !== "All" ? filter.toLowerCase() : "tracked"}` : undefined}
      />
      <ChipRow items={FILTERS} value={filter} onChange={setFilter} testIDPrefix="sub-filter" />

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <EmptyState
              icon="wallet-outline"
              title="No subscriptions yet"
              message="Add your first subscription, or scan a screenshot to let AI do it for you."
              action={<PrimaryButton title="Add subscription" icon="plus" onPress={() => router.push("/add-subscription")} style={{ marginTop: 8 }} />}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.row} onPress={() => router.push(`/subscription/${item.id}`)} testID={`sub-${item.id}`}>
              <CategoryDot category={item.category} size={46} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.title} numberOfLines={1}>{item.provider}</Text>
                  <Badge label={item.status} tone={statusTone[item.status] || "muted"} />
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.plan ? `${item.plan} · ` : ""}{item.billing_cycle}
                  {item.renewal_date ? ` · ${relativeDate(item.renewal_date)}` : ""}
                </Text>
              </View>
              <Text style={styles.amount}>{money(item.price, item.currency)}</Text>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "800", flex: 1 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 3 },
  amount: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
}));
