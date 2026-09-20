import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { AppHeader, Badge, Card, Icon, Loading } from "@/src/components/ui";
import { accentFor, makeStyles, useTheme } from "@/src/theme";

export default function Search() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async (text: string) => {
    setQ(text);
    if (!text.trim()) { setRes(null); return; }
    setLoading(true);
    try { setRes(await api.search(text)); } catch { /* ignore */ } finally { setLoading(false); }
  };

  const groups = res ? [
    { key: "subscriptions", label: "Subscriptions", icon: "wallet", items: res.subscriptions, nav: (i: any) => `/subscription/${i.id}`, title: (i: any) => i.provider, sub: (i: any) => i.plan || i.category },
    { key: "links", label: "Links", icon: "link-variant", items: res.links, nav: (i: any) => `/link/${i.id}`, title: (i: any) => i.title, sub: (i: any) => i.source },
    { key: "plans", label: "Plans", icon: "eye-check", items: res.plans, nav: () => "/watchlist", title: (i: any) => i.provider, sub: (i: any) => i.plan },
    { key: "reminders", label: "Reminders", icon: "bell", items: res.reminders, nav: () => "/reminders", title: (i: any) => i.title, sub: () => "Reminder" },
  ] : [];

  const total = groups.reduce((a, g) => a + (g.items?.length || 0), 0);

  return (
    <View style={styles.container}>
      <AppHeader title="Search" back />
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput autoFocus style={styles.search} placeholder="Search everything…" placeholderTextColor={colors.muted} value={q} onChangeText={run} testID="search-input" />
        {q ? <Pressable onPress={() => run("")}><Icon name="close-circle" size={20} color={colors.muted} /></Pressable> : null}
      </View>

      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }} showsVerticalScrollIndicator={false}>
          {res && total === 0 ? <Text style={styles.none}>No results for “{q}”.</Text> : null}
          {groups.filter((g) => g.items?.length).map((g) => (
            <View key={g.key} style={{ gap: 8 }}>
              <View style={styles.groupHead}>
                <Icon name={g.icon} size={16} color={colors.onSurface} />
                <Text style={styles.groupTitle}>{g.label}</Text>
                <Badge label={String(g.items.length)} tone="muted" />
              </View>
              {g.items.map((i: any, idx: number) => (
                <Card key={i.id || idx} style={styles.row} onPress={() => router.push(g.nav(i) as any)}>
                  <View style={[styles.dot, { backgroundColor: accentFor(colors, g.title(i) || idx) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{g.title(i)}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{g.sub(i)}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.muted} />
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  search: { flex: 1, color: colors.onSurface, fontSize: 16 },
  none: { color: colors.muted, fontSize: 15, textAlign: "center", paddingVertical: 20 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowTitle: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
}));
