import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { money } from "@/src/lib/format";
import { AppHeader, Card, Icon, Loading } from "@/src/components/ui";
import { accentFor, makeStyles, useTheme } from "@/src/theme";

export default function Compare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const idList = (ids || "").split(",").filter(Boolean);

  const { data, isLoading } = useQuery({
    queryKey: ["compare", ids],
    queryFn: () => api.compare(idList),
    enabled: idList.length >= 2,
  });

  return (
    <View style={styles.container}>
      <AppHeader title="Compare plans" back />
      {isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }} showsVerticalScrollIndicator={false}>
          <View style={styles.cards}>
            {(data?.items || []).map((it: any, i: number) => (
              <View key={i} style={[styles.card, { backgroundColor: accentFor(colors, it.provider || i) }]}>
                <Text style={styles.name}>{it.provider}</Text>
                <Text style={styles.plan}>{it.plan || it.product || "Plan"}</Text>
                <Text style={styles.price}>{money(it.price, it.currency)}</Text>
                <Text style={styles.cycle}>/ {it.billing_cycle || "—"}</Text>
              </View>
            ))}
          </View>

          <Card>
            <View style={styles.aiHead}>
              <Icon name="robot" size={18} color={colors.brandPrimary} />
              <Text style={styles.aiTitle}>SubMind analysis</Text>
            </View>
            <Text style={styles.analysis}>{data?.comparison || "No analysis available."}</Text>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  cards: { flexDirection: "row", gap: 12 },
  card: { flex: 1, borderRadius: 22, padding: 18 },
  name: { color: colors.onAccent, fontSize: 17, fontWeight: "800" },
  plan: { color: colors.onAccent, opacity: 0.8, fontSize: 13, marginTop: 2, fontWeight: "600" },
  price: { color: colors.onAccent, fontSize: 24, fontWeight: "800", marginTop: 14 },
  cycle: { color: colors.onAccent, opacity: 0.8, fontSize: 13 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  aiTitle: { color: colors.onSurfaceSecondary, fontSize: 16, fontWeight: "800" },
  analysis: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 23 },
}));
