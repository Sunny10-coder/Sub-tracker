import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { FormScroll, SelectField, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";
import { REMINDER_CHOICES, dateForChoice, validateLocalDate, scheduleLinkNotification, type ReminderChoice } from "@/src/lib/link-reminders";

const SOURCES = ["Website", "Instagram", "YouTube", "Reddit", "Chrome", "Other"];

export default function PasteLink() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{url?: string}>();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [url, setUrl] = useState(params.url || "");
  const [note, setNote] = useState("");
  const [source, setSource] = useState("Website");
  const [reminderChoice, setReminderChoice] = useState<ReminderChoice>("None");
  const [customDate, setCustomDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [reminderTitle, setReminderTitle] = useState("");
  const reminderDate = dateForChoice(reminderChoice, customDate);

  const save = useMutation({
    mutationFn: () => api.ingestLink(url.trim(), source, note, reminderDate ? { reminder_date: reminderDate, reminder_time: reminderTime, reminder_title: reminderTitle.trim() || "Review saved link" } : undefined),
    onSuccess: async (res) => {
      invalidate();
      if (reminderDate && res.link_id) {
        const scheduled = await scheduleLinkNotification(res.link_id, reminderTitle.trim() || "Review saved link", reminderDate, reminderTime);
        if (!scheduled) Alert.alert("Reminder saved", "The reminder is saved in SubMind, but your device notification was not scheduled. Check notification permissions.");
      }
      router.replace(res?.duplicate ? `/link/${res.link_id}` : res?.inbox ? "/(tabs)/inbox" : "/link-vault");
    },
    onError: (e: Error) => Alert.alert("Unable to save link", e.message),
  });

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (t) setUrl(t);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Paste a link" back />
      <FormScroll>
        <Card style={styles.hint}>
          <Icon name="information-outline" size={18} color={colors.brandPrimary} />
          <Text style={styles.hintText}>Your link is saved and classified locally. You can optionally enhance its tags with Gemini from the saved link.</Text>
        </Card>
        <TextField label="URL" value={url} onChangeText={setUrl} placeholder="https://…" testID="link-url" />
        <PrimaryButton title="Paste from clipboard" icon="content-paste" variant="secondary" onPress={paste} testID="link-paste" />
        <SelectField label="Source" options={SOURCES} value={source} onChange={setSource} testID="link-source" />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Why are you saving this?" multiline testID="link-note" />
        <SelectField label="Remind me (optional)" options={REMINDER_CHOICES} value={reminderChoice} onChange={setReminderChoice} testID="link-reminder-choice" />
        {reminderChoice === "Custom" ? <TextField label="Reminder date" value={customDate} onChangeText={setCustomDate} placeholder="YYYY-MM-DD" testID="link-reminder-date" /> : null}
        {reminderChoice !== "None" ? <>
          <TextField label="Notification time (24-hour)" value={reminderTime} onChangeText={setReminderTime} placeholder="09:00" testID="link-reminder-time" />
          <TextField label="What to remember (optional)" value={reminderTitle} onChangeText={setReminderTitle} placeholder="Read this article / Check this offer" testID="link-reminder-title" />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Scheduled in your device local time. The link is saved even if notifications are disabled.</Text>
        </> : null}
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Save link" icon="link-variant" onPress={() => save.mutate()} loading={save.isPending} disabled={!url.trim() || (!!reminderDate && !validateLocalDate(reminderDate, reminderTime)) || (reminderChoice !== "None" && !reminderDate)} testID="link-save" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hint: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.brandPrimary + "12", borderColor: colors.brandPrimary + "22" },
  hintText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
