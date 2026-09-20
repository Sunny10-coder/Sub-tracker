import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, useWatchlist } from "@/src/lib/api";
import { money } from "@/src/lib/format";
import { AppHeader, Badge, Card, EmptyState, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { accentFor, makeStyles, useTheme } from "@/src/theme";

export default function Watchlist() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch } = useWatchlist();
  const invalidate = useInvalidateAll();
  const [selected, setSelected] = useState<string[]>([]);

  const convert = useMutation({ mutationFn: (id: string) => api.convertPlan(id), onSuccess: () => { refetch(); invalidate(); } });
  const del = useMutation({ mutationFn: (id: string) => api.deletePlan(id), onSuccess: () => { refetch(); invalidate(); } });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));

  return (
    <View style={styles.container}>
      <AppHeader title="Plan Watchlist" subtitle="Plans you're considering" />
      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="eye-outline" title="Nothing on watch" message="Save plans and offers here before you subscribe, then compare them side by side." action={<PrimaryButton title="Add plan" icon="plus" onPress={() => router.push("/add-plan")} style={{ marginTop: 8 }} />} />}
          renderItem={({ item, index }) => {
            const sel = selected.includes(item.id);
            return (
              <Card testID={`plan-${item.id}`}>
                <View style={styles.top}>
                  <View style={[styles.dot, { backgroundColor: accentFor(colors, item.provider || index) }]}>
                    <Icon name="eye-check" size={20} color={colors.onAccent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.provider}</Text>
                    <Text style={styles.plan}>{item.plan || "Plan"} · {item.billing_cycle}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={styles.price}>{money(item.price, item.currency)}</Text>
                    <Badge label={item.status} tone={item.status === "Subscribed" ? "success" : "muted"} />
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable onPress={() => toggle(item.id)} testID={`compare-${item.id}`} style={[styles.act, sel && { backgroundColor: colors.brandPrimary }]}>
                    <Icon name={sel ? "check" : "scale-balance"} size={15} color={sel ? colors.onBrandPrimary : colors.brandPrimary} />
                    <Text style={[styles.actText, sel && { color: colors.onBrandPrimary }]}>{sel ? "Selected" : "Compare"}</Text>
                  </Pressable>
                  <Pressable onPress={() => convert.mutate(item.id)} style={styles.act}>
                    <Icon name="arrow-up-bold-box-outline" size={15} color={colors.brandSecondary} />
                    <Text style={[styles.actText, { color: colors.brandSecondary }]}>Subscribe</Text>
                  </Pressable>
                  <Pressable onPress={() => del.mutate(item.id)} style={styles.act}>
                    <Icon name="trash-can-outline" size={15} color={colors.muted} />
                  </Pressable>
                </View>
              </Card>
            );
          }}
        />
      )}
      {selected.length === 2 ? (
        <View style={[styles.floating, { bottom: insets.bottom + 20 }]}>
          <PrimaryButton title="Compare selected" icon="scale-balance" onPress={() => router.push(`/compare?ids=${selected.join(",")}`)} testID="do-compare" />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "800" },
  plan: { color: colors.muted, fontSize: 13, marginTop: 2 },
  price: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  act: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  actText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary },
  floating: { position: "absolute", left: 20, right: 20 },
}));
