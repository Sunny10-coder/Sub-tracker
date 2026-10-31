import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll, useLink, useLinkReminder } from "@/src/lib/api";
import { formatDate } from "@/src/lib/format";
import { AppHeader, Badge, Card, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { cancelLinkNotification } from "@/src/lib/link-reminders";
import { enrichLinkWithGemini } from "@/src/lib/link-intelligence";

export default function LinkDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch } = useLink(id!);
  const [enriching,setEnriching]=useState(false);
  const { data: reminder } = useLinkReminder(id!);
  const invalidate = useInvalidateAll();

  const del = useMutation({ mutationFn: () => api.deleteLink(id!), onSuccess: async () => { await cancelLinkNotification(id!); invalidate(); router.back(); } });
  const removeReminder = useMutation({ mutationFn: () => api.deleteReminder(reminder.id), onSuccess: async () => { await cancelLinkNotification(id!); invalidate(); Alert.alert("Reminder removed", "This link remains saved in your vault."); } });

  const enhance = () => Alert.alert("Enhance using Gemini?",
    "This action sends the saved URL, title and optional note to Google's Gemini API using your configured key. It does not fetch or read the webpage. Continue?",
    [{text:"Cancel",style:"cancel"},{text:"Enhance",onPress:async()=>{
      if(!data)return;setEnriching(true);
      try{const fields=await enrichLinkWithGemini(data);await api.updateLink(id!,fields);invalidate();await refetch();
       Alert.alert("Tags updated","Gemini suggested categories and tags based on the URL and note. Review them before relying on the summary.");
      }catch(e:any){Alert.alert("AI enhancement unavailable",e.message||String(e))}
      finally{setEnriching(false)}
    }}]);

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Link" back /><Loading /></View>;
  const l = data;

  return (
    <View style={styles.container}>
      <AppHeader title="Saved link" back />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={styles.title}>{l.title}</Text>
          <Text style={styles.url} numberOfLines={2}>{l.url}</Text>
          <View style={styles.badges}>
            <Badge label={l.source} tone="brand" />
            {l.category ? <Badge label={l.category} tone="mint" /> : null}
            {l.enrichment === "pending" ? <Badge label="Enriching…" tone="warning" /> : null}
          </View>
        </Card>

        {l.summary ? <Card><Text style={styles.sectionLabel}>{l.enrichment==="gemini-url-note-only"?"Gemini suggestion (URL and note only)":"Saved summary / description"}</Text><Text style={styles.body}>{l.summary}</Text></Card> : null}

        {l.tags?.length ? (
          <View style={styles.tags}>
            {l.tags.map((t: string) => <View key={t} style={styles.tag}><Text style={styles.tagText}>#{t}</Text></View>)}
          </View>
        ) : null}

        {l.note ? <Card><Text style={styles.sectionLabel}>Your note</Text><Text style={styles.body}>{l.note}</Text></Card> : null}

        <Text style={styles.saved}>Saved {formatDate(l.created_at)}</Text>
        {reminder ? <Card><Text style={styles.sectionLabel}>Linked reminder</Text><Text style={styles.body}>{reminder.title}</Text><Text style={styles.saved}>{formatDate(reminder.due_date)} at {reminder.remind_time || "09:00"}</Text></Card> : null}

        <View style={{ gap: 10 }}>
          {l.url?.startsWith("http") ? <PrimaryButton title="Open link" icon="open-in-new" onPress={() => WebBrowser.openBrowserAsync(l.url)} testID="open-link" /> : null}
          <PrimaryButton title={enriching?"Classifying with Gemini…":"Enhance tags using Gemini AI"} icon="auto-fix" variant="secondary" onPress={enhance} loading={enriching} />
          <PrimaryButton title={reminder ? "Reschedule reminder" : "Remind me about this link"} icon="bell-plus" variant="secondary" onPress={() => router.push({ pathname: "/add-reminder", params: { linkId: id!, linkTitle: l.title } })} />
          {reminder ? <PrimaryButton title="Remove reminder" icon="bell-off" variant="secondary" loading={removeReminder.isPending} onPress={() => removeReminder.mutate()} /> : null}
          <PrimaryButton title="Delete" icon="trash-can-outline" variant="secondary" onPress={() => del.mutate()} loading={del.isPending} style={{ backgroundColor: colors.error + "18" }} testID="delete-link" />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurfaceSecondary, fontSize: 20, fontWeight: "800" },
  url: { color: colors.brandPrimary, fontSize: 13, marginTop: 6 },
  badges: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },
  body: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: colors.surfaceTertiary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  saved: { color: colors.muted, fontSize: 13 },
}));
