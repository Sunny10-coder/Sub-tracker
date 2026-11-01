import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

function iso(d:Date){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
const timeValid=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "This weekend", days: (6 - new Date().getDay() + 7) % 7 || 6 },
  { label: "Next week", days: 7 },
  { label: "In 7 days", days: 7 },
  { label: "In 30 days", days: 30 },
  { label: "Before expiry (3d)", days: 3 },
];

export default function AddReminder() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(iso(new Date(Date.now() + 86400000)));
  const [preset, setPreset] = useState("Tomorrow");
  const [time,setTime]=useState("09:00");
  const [error,setError]=useState("");

  const pick = (p: any) => { setPreset(p.label); setDate(iso(new Date(Date.now() + p.days * 86400000))); };

  const save = useMutation({
    mutationFn: async () => {
      // The notification itself is scheduled by the app-wide reminder sync once this is saved.
      const when=new Date(date+"T"+time+":00");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!timeValid(time)||Number.isNaN(when.getTime())||when.getTime()<=Date.now())throw Error("Choose a future date and time (24-hour format).");
      return api.createReminder({ title:title.trim(), due_date:date,remind_time:time,kind:"custom" });
    },
    onSuccess: () => { invalidate(); router.replace("/reminders"); },
  });

  return (
    <View style={styles.container}>
      <AppHeader title="New reminder" back />
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
        <Text style={styles.label}>Time (local, 24-hour)</Text>
        <View style={styles.presets}>{["08:00","09:00","12:00","18:00","21:00"].map(t=><Pressable key={t} onPress={()=>setTime(t)} style={[styles.preset,time===t&&{backgroundColor:colors.brandPrimary}]}><Text style={[styles.presetText,time===t&&{color:colors.onBrandPrimary}]}>{t}</Text></Pressable>)}</View>
        <TextField label="Custom time (HH:MM)" value={time} onChangeText={setTime} placeholder="18:30" testID="rem-time" />
        <Text style={styles.presetText}>Notifications follow your phone’s local time. The previous 9:00 AM default remains for older reminders.</Text>
        {save.isError?<Text style={{color:colors.error,fontSize:12}}>{(save.error as Error).message}</Text>:null}
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Set reminder" icon="bell-plus" onPress={() => save.mutate()} loading={save.isPending} disabled={!title.trim()||!timeValid(time)} testID="rem-save" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "800", marginLeft: 4 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 0, paddingHorizontal: 16, paddingVertical: 10 },
  presetText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
