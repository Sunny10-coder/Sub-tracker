import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, useLink, useLinks } from "@/src/lib/api";
import { KIND_ICON, KIND_LABEL, REMIND_PRESETS, formatDate, parseTags, relativeDate } from "@/src/lib/format";
import { AppHeader, Badge, Card, ChipRow, Icon, Loading, PrimaryButton, SectionLabel } from "@/src/components/ui";
import { font, makeStyles, useTheme } from "@/src/theme";

const BASIS_NOTE: Record<string, string> = {
  readme: "Based on the repo details and README.",
  repo_metadata: "Based on the repo description and topics (README not available).",
  caption: "Based on the post caption and hashtags. The video itself was not watched.",
  metadata: "Based on the title and description.",
  page_text: "Based on the page text.",
  url_only: "The page could not be read, so only the link and your note were used. Add a note or tags to improve it.",
};

export default function LinkDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch } = useLink(id!);
  const invalidate = useInvalidateAll();
  const [newTags, setNewTags] = useState("");
  const allLinks=useLinks();
  const analysis=useMutation({mutationFn:()=>api.analyzeLink(id!),onSuccess:refresh});

  const refresh = () => { refetch(); invalidate(); };
  const del = useMutation({ mutationFn: () => api.deleteLink(id!), onSuccess: () => { invalidate(); router.back(); } });
  const patch = useMutation({ mutationFn: (b: Record<string, unknown>) => api.updateLink(id!, b), onSuccess: refresh });
  const remind = useMutation({
    mutationFn: (days: number) => api.linkRemind(id!, { days }),
    onSuccess: refresh,
  });

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Link" back /><Loading /></View>;
  const l = data;
  const kind: string = l.kind || "article";
  const tags: string[] = l.tags || [];
  const repo = l.repo;
  const related=(allLinks.data||[]).filter((x:any)=>x.id!==l.id&&((x.tags||[]).some((tag:string)=>tags.includes(tag))||x.category===l.category)).slice(0,4);

  const open = async () => {
    try {
      await api.linkOpened(id!);
    } catch {
      // opening the link matters more than the counter
    }
    await WebBrowser.openBrowserAsync(l.url);
    refresh();
  };
  const addTags = () => {
    const add = parseTags(newTags);
    if (!add.length) return;
    patch.mutate({ tags: Array.from(new Set([...tags, ...add])) });
    setNewTags("");
  };

  return (
    <View style={styles.container}>
      <AppHeader title={KIND_LABEL[kind] || "Saved link"} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.titleRow}>
            <Icon name={KIND_ICON[kind] || "link-variant"} size={28} color={colors.brandPrimary} />
            <Text style={styles.title} selectable>{l.title}</Text>
          </View>
          <Text style={styles.url} numberOfLines={2} selectable>{l.url}</Text>
          <View style={styles.badges}>
            {l.collection ? <Badge label={l.collection} tone="brand" /> : null}
            {l.category ? <Badge label={l.category} tone="mint" /> : null}
            {l.enrichment === "pending" ? <Badge label="Reading the page" tone="warning" /> : null}
          </View>
        </Card>

        {repo ? (
          <Card style={{ gap: 6 }}>
            <Text style={styles.label}>repository</Text>
            <Text style={styles.body}>
              {[repo.language, repo.stars != null ? `★ ${repo.stars.toLocaleString()}` : null, repo.forks != null ? `${repo.forks.toLocaleString()} forks` : null, repo.license].filter(Boolean).join("  ·  ")}
            </Text>
            {repo.updated_at ? <Text style={styles.fine}>Last push {formatDate(repo.updated_at)}{repo.archived ? " · archived" : ""}</Text> : null}
          </Card>
        ) : null}

        {l.summary ? <Card><Text style={styles.label}>summary</Text><Text style={styles.body} selectable>{l.summary}</Text></Card> : null}

        {l.use_cases?.length ? (
          <Card style={{ gap: 6 }}>
            <Text style={styles.label}>small use cases</Text>
            {l.use_cases.map((u: string) => (
              <View key={u} style={styles.bullet}><Icon name="check" size={16} color={colors.success} /><Text style={styles.body} selectable>{u}</Text></View>
            ))}
          </Card>
        ) : null}

        {l.key_points?.length ? (
          <Card style={{ gap: 6 }}>
            <Text style={styles.label}>key points</Text>
            {l.key_points.map((u: string) => (
              <View key={u} style={styles.bullet}><Icon name="circle-small" size={18} color={colors.brandPrimary} /><Text style={styles.body} selectable>{u}</Text></View>
            ))}
          </Card>
        ) : null}

        {l.analysis_warning ? <Text style={styles.fine}>{l.analysis_warning}</Text> : null}
        {l.analysis_basis ? <Text style={styles.fine}>{BASIS_NOTE[l.analysis_basis] || ""}{l.analysis_ai === false ? " AI was unavailable, so this is a basic summary." : ""}</Text> : null}

        <View>
          <SectionLabel>tags</SectionLabel>
          <View style={styles.tags}>
            {tags.map((t) => (
              <Text key={t} style={styles.tag} onPress={() => patch.mutate({ tags: tags.filter((x) => x !== t) })} accessibilityRole="button" accessibilityLabel={`Remove tag ${t}`}>#{t}  ✕</Text>
            ))}
            {tags.length === 0 ? <Text style={styles.fine}>No tags yet.</Text> : null}
          </View>
          <View style={styles.addTag}>
            <TextInput style={styles.input} placeholder="add tags, separated by commas" placeholderTextColor={colors.muted} value={newTags} onChangeText={setNewTags} onSubmitEditing={addTags} autoCapitalize="none" testID="tag-input" />
            <PrimaryButton title="Add" onPress={addTags} disabled={!newTags.trim()} style={{ minHeight: 44 }} testID="tag-add" />
          </View>
        </View>

        <View>
          <SectionLabel>remind me</SectionLabel>
          {l.reminder_due ? <Text style={styles.fine}>Reminder set for {formatDate(l.reminder_due)} ({relativeDate(l.reminder_due)}). Pick a new time to move it.</Text> : null}
          <View style={{ marginHorizontal: -16, marginTop: 6 }}>
            <ChipRow items={REMIND_PRESETS.filter((p) => p.days !== null).map((p) => p.label)} value={null} testIDPrefix="remind"
              onChange={(label: string) => { const d = REMIND_PRESETS.find((p) => p.label === label)?.days; if (d) remind.mutate(d); }} />
          </View>
        </View>

        {l.note ? <Card><Text style={styles.label}>your note</Text><Text style={styles.body} selectable>{l.note}</Text></Card> : null}
        <Text style={styles.fine}>Saved {formatDate(l.created_at)}{l.opened_count ? ` · opened ${l.opened_count}×` : " · not opened yet"}</Text>

        {related.length ? <Card style={{gap:9}}><Text style={styles.label}>related saved links</Text>
          {related.map((item:any)=><Text key={item.id} style={[styles.body,{color:colors.brandPrimary}]}
            onPress={()=>router.push(("/link/"+item.id) as never)}>{item.title||item.url}</Text>)}
        </Card>:null}
        <View style={{ gap: 8 }}>
          <PrimaryButton title="Re-analyze content and tags" icon="auto-fix" variant="secondary"
            loading={analysis.isPending} onPress={()=>analysis.mutate()} testID="reanalyze-link" />
          {analysis.isError?<Text style={styles.fine}>{(analysis.error as Error).message}</Text>:null}
          {l.url?.startsWith("http") ? <PrimaryButton title="Open link" icon="open-in-new" onPress={open} testID="open-link" /> : null}
          <PrimaryButton title="Delete" icon="trash-can-outline" variant="secondary" onPress={() => Alert.alert("Delete saved link?","This removes the bookmark and its local reminder, but not the original website.",[
            {text:"Keep",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>del.mutate()}
          ])} loading={del.isPending} testID="delete-link" />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  titleRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { ...font.light, color: colors.onSurface, fontSize: 26, flex: 1, lineHeight: 32 },
  url: { color: colors.brandPrimary, fontSize: 13, marginTop: 8 },
  badges: { flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
  body: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, flex: 1 },
  fine: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  bullet: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tag: { color: colors.onBrandPrimary, backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: "600", overflow: "hidden" },
  addTag: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
}));
