import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";
import { validateLocalDate, localDateAfter, scheduleLinkNotification } from "@/src/lib/link-reminders";

function iso(d: Date) { const p = (x: number) => String(x).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }

const PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "This weekend", days: (6 - new Date().getDay() + 7) % 7 || 6 },
  { label: "Next week", days: 7 },
  { label: "In 7 days", days: 7 },
  { label: "In 30 days", days: 30 },
  { label: "Before expiry (3d)", days: 3 },
];

async function scheduleLocal(title: string, date: string) {
  try {
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const when = new Date(date + "T09:00:00");
    if (when.getTime() <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: "SubMind reminder", body: title },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when } as any,
    });
  } catch {}
}

export default function AddReminder() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { linkId, linkTitle } = useLocalSearchParams<{linkId?: string; linkTitle?: string}>();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [title, setTitle] = useState(linkId ? `Review saved link: ${linkTitle || "Link"}` : "");
  const [date, setDate] = useState(iso(new Date(Date.now() + 86400000)));
  const [preset, setPreset] = useState("Tomorrow");
  const [time, setTime] = useState("09:00");

  const pick = (p: any) => { setPreset(p.label); setDate(localDateAfter(p.days)); };

  const save = useMutation({
    mutationFn: async () => {
      if (linkId) {
        const saved = await api.putLinkReminder(linkId, { title, due_date: date, remind_time: time });
        const scheduled = await scheduleLinkNotification(linkId, title, date, time);
        return { ...saved, notification_scheduled: scheduled };
      }
      await scheduleLocal(title, date);
      return api.createReminder({ title, due_date: date, kind: "custom" });
    },
    onSuccess: (result: any) => { invalidate();
      if (linkId && !result.notification_scheduled) {
        const message = "Saved in SubMind, but device notifications are not enabled or could not be scheduled.";
        import("react-native").then(({ Alert }) => Alert.alert("Reminder saved", message));
      }
      router.replace(linkId ? `/link/${linkId}` : "/reminders");
    },
  });

  return (
    <View style={styles.container}>
      <AppHeader title={linkId ? "Link reminder" : "New reminder"} back />
      <FormScroll>
        <TextField label="What to remember" value={title} onChangeText={setTitle} placeholder="Cancel Netflix before renewal" testID="rem-title" />
        <Text style={styles.label}>When</Text>
        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <Pressable key={p.label} onPress={() => pick(p)} testID={`preset-${p.label}`} style={[styles.preset, preset === p.label && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
              <Text style={[styles.presetText, preset === p.label && { color: colors.onBrandPrimary }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextField label="Date" value={date} onChangeText={(v: string) => { setDate(v); setPreset(""); }} placeholder="YYYY-MM-DD" testID="rem-date" />
        {linkId ? <TextField label="Time (24-hour, device local)" value={time} onChangeText={setTime} placeholder="09:00" testID="rem-time" /> : null}
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Set reminder" icon="bell-plus" onPress={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || (linkId ? !validateLocalDate(date, time) : false)} testID="rem-save" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "800", marginLeft: 4 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  presetText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
