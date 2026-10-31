// Link Vault: bookmarks grouped into sections (GitHub first, with small use cases),
// searchable and filterable by tag.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLinkTags, useLinks } from "@/src/lib/api";
import { KIND_ICON, formatDate } from "@/src/lib/format";
import { AppHeader, Chip, EmptyState, Icon, Loading } from "@/src/components/ui";
import { accentFor, font, makeStyles, useTheme } from "@/src/theme";

const KIND_FILTERS = [
  { key: "all", label: "All" },
  { key: "github", label: "GitHub" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "article", label: "Web" },
];

// GitHub first, then the rest alphabetically — the section the user asked to find in one place.
const SECTION_ORDER = ["GitHub", "Instagram", "YouTube", "TikTok", "X / Twitter", "Reddit", "LinkedIn", "Websites", "Notes"];

type Link = {
  id: string; title: string; summary?: string; kind?: string; collection?: string; source?: string;
  tags?: string[]; use_cases?: string[]; repo?: { stars?: number; language?: string; description?: string };
  reminder_due?: string; enrichment?: string; created_at?: string;
};

export default function LinkVault() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState(params.kind && KIND_FILTERS.some((k) => k.key === params.kind) ? params.kind : "all");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { data, isLoading } = useLinks();
  const tags = useLinkTags();

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const items: Link[] = (data || []).filter((l: Link) => {
      if (kind !== "all" && (l.kind || "article") !== kind) return false;
      if (tag && !(l.tags || []).includes(tag)) return false;
      if (!needle) return true;
      return `${l.title} ${l.summary} ${(l.tags || []).join(" ")} ${(l.use_cases || []).join(" ")}`.toLowerCase().includes(needle);
    });
    const groups: Record<string, Link[]> = {};
    items.forEach((l) => { (groups[l.collection || "Websites"] ||= []).push(l); });
    return Object.keys(groups)
      .sort((a, b) => (SECTION_ORDER.indexOf(a) + 1 || 99) - (SECTION_ORDER.indexOf(b) + 1 || 99))
      .map((title) => ({ title, data: groups[title] }));
  }, [data, kind, tag, q]);

  const total = (data || []).length;

  return (
    <View style={styles.container}>
      <AppHeader title="Link vault" subtitle={`${total} saved`} back
        right={<Pressable onPress={() => router.push("/paste-link")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Paste a link" testID="vault-add"><Icon name="plus-circle-outline" size={30} color={colors.brandPrimary} /></Pressable>} />
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput style={styles.search} placeholder="Search links, tags, use cases" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} testID="vault-search" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.rowContent}>
        {KIND_FILTERS.map((k) => <Chip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} testID={`vault-kind-${k.key}`} />)}
      </ScrollView>
      {tags.data && tags.data.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.rowContent}>
          {tags.data.slice(0, 20).map((t) => (
            <Chip key={t.tag} label={`#${t.tag} ${t.count}`} active={tag === t.tag} onPress={() => setTag(tag === t.tag ? null : t.tag)} testID={`vault-tag-${t.tag}`} />
          ))}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="bookmark-outline" title="No links here" message="Paste a link, or share one from Instagram, GitHub or Chrome. It is tagged and saved like a bookmark." />}
          renderSectionHeader={({ section }) => (
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>{section.title.toLowerCase()}</Text>
              <Text style={styles.secCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const isRepo = item.kind === "github";
            const accent = accentFor(colors, item.title || index);
            return (
              <Pressable style={styles.item} testID={`link-${item.id}`} onPress={() => router.push(`/link/${item.id}`)} accessibilityRole="button" accessibilityLabel={item.title}>
                <View style={[styles.tile, { backgroundColor: accent }]}>
                  <Icon name={KIND_ICON[item.kind || "article"] || "link-variant"} size={24} color={colors.onAccent} />
                </View>
                <View style={styles.body}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  {isRepo ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.repo?.language, item.repo?.stars != null ? `★ ${item.repo.stars.toLocaleString()}` : null].filter(Boolean).join("  ·  ")}
                    </Text>
                  ) : null}
                  {item.summary ? <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text> : item.enrichment === "pending" ? <Text style={styles.meta}>Reading the page</Text> : null}
                  {(item.use_cases || []).slice(0, isRepo ? 3 : 0).map((u) => (
                    <View key={u} style={styles.useRow}>
                      <Icon name="chevron-right" size={14} color={colors.accentGreen} />
                      <Text style={styles.useText} numberOfLines={1}>{u}</Text>
                    </View>
                  ))}
                  <View style={styles.tagRow}>
                    {(item.tags || []).slice(0, 4).map((t) => <Text key={t} style={styles.tag}>#{t}</Text>)}
                    {item.reminder_due ? <Text style={styles.remind}>⏰ {formatDate(item.reminder_due)}</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, minHeight: 46 },
  search: { flex: 1, color: colors.onSurface, fontSize: 15 },
  row: { flexGrow: 0, marginBottom: 8 },
  rowContent: { gap: 6, paddingHorizontal: 16, alignItems: "center" },
  secHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 14, marginBottom: 8 },
  secTitle: { ...font.light, color: colors.onSurface, fontSize: 30 },
  secCount: { color: colors.muted, fontSize: 14 },
  item: { flexDirection: "row", gap: 12, backgroundColor: colors.surfaceSecondary, padding: 10, marginBottom: 6 },
  tile: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  itemTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 12 },
  summary: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  useRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  useText: { color: colors.onSurfaceSecondary, fontSize: 12, flex: 1 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  tag: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  remind: { color: colors.warning, fontSize: 12, fontWeight: "600" },
}));
