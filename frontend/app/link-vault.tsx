import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLinks } from "@/src/lib/api";
import { AppHeader, ChipRow, EmptyState, Icon, Loading } from "@/src/components/ui";
import { accentFor, makeStyles, useTheme } from "@/src/theme";

const SOURCES = ["All", "Instagram", "Website", "YouTube", "Reddit", "Chrome", "Other"];

export default function LinkVault() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [source, setSource] = useState("All");
  const [q, setQ] = useState("");
  const { data, isLoading } = useLinks(source);

  const filtered = (data || []).filter((l: any) =>
    !q.trim() || `${l.title} ${l.summary} ${(l.tags || []).join(" ")} ${l.category}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Link Vault" subtitle={`${data?.length || 0} saved`} />
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput style={styles.search} placeholder="Search your saved links…" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} testID="vault-search" />
      </View>
      <ChipRow items={SOURCES} value={source} onChange={setSource} testIDPrefix="vault-source" />

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: insets.bottom + 30, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="bookmark-outline" title="No links yet" message="Share links from Instagram, Chrome or YouTube — or paste one." />}
          renderItem={({ item, index }) => (
            <Pressable style={styles.folderWrap} testID={`link-${item.id}`} onPress={() => router.push(`/link/${item.id}`)}>
              <View style={[styles.folderTab, { backgroundColor: accentFor(colors, item.title || index) }]} />
              <View style={[styles.folder, { backgroundColor: accentFor(colors, item.title || index) }]}>
                <Icon name="link-variant" size={22} color={colors.onAccent} />
                <Text style={styles.folderTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.folderMeta}>
                  <Text style={styles.folderSource}>{item.source}</Text>
                  {item.enrichment === "pending" ? <Icon name="progress-clock" size={14} color={colors.onAccent} /> : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  search: { flex: 1, color: colors.onSurface, fontSize: 15 },
  folderWrap: { flex: 1 },
  folderTab: { width: "45%", height: 14, borderTopLeftRadius: 12, borderTopRightRadius: 12, marginLeft: 8, marginBottom: -6 },
  folder: { borderRadius: 20, padding: 16, gap: 10, minHeight: 130, justifyContent: "space-between" },
  folderTitle: { color: colors.onAccent, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  folderMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folderSource: { color: colors.onAccent, opacity: 0.75, fontSize: 12, fontWeight: "700" },
}));
