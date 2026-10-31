import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, getBuildServerUrl, getServerUrl, normalizeServerUrl, pingServer, setServerUrl, useSettings } from "@/src/lib/api";
import { CURRENCIES } from "@/src/lib/format";
import { AppHeader, Card, Chip, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch } = useSettings();
  const [server, setServer] = useState(getServerUrl());
  const [serverState, setServerState] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  // Point the app at a backend and check it answers before keeping it.
  const saveServer = async () => {
    setServerState("checking");
    const ok = await pingServer(server);
    setServerState(ok ? "ok" : "fail");
    if (ok) {
      await setServerUrl(server);
      refetch();
    }
  };

  const patch = useMutation({ mutationFn: (b: any) => api.patchSettings(b), onSuccess: () => refetch() });
  const set = (k: string, v: any) => patch.mutate({ [k]: v });

  const serverCard = (
    <Section title="Server">
      <View style={styles.rowCol}>
        <Text style={styles.sub}>The SubMind backend this app talks to. Include https://. Built-in default: {getBuildServerUrl() || "none"}.</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          <TextField label="Server address" value={server} onChangeText={(v: string) => { setServer(v); setServerState("idle"); }} placeholder="https://your-submind-server" keyboardType="url" testID="server-url" />
          <PrimaryButton title={serverState === "checking" ? "Checking…" : "Test and save"} icon="lan-connect" onPress={saveServer} loading={serverState === "checking"} disabled={!normalizeServerUrl(server)} testID="server-save" />
          {serverState === "ok" ? <Text style={[styles.sub, { color: colors.success }]}>Connected. Saved.</Text> : null}
          {serverState === "fail" ? <Text style={[styles.sub, { color: colors.error }]}>Could not reach that address. Nothing was changed.</Text> : null}
        </View>
      </View>
    </Section>
  );

  if (isLoading || !data) return <View style={styles.container}><AppHeader title="Settings" back /><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }}>{serverCard}</ScrollView></View>;

  const thresholdPct = Math.round((data.auto_add_threshold || 0.95) * 100);

  const resetOnboarding = async () => { await storage.setItem("onboarded", false); router.replace("/onboarding"); };

  return (
    <View style={styles.container}>
      <AppHeader title="Settings" back />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 16 }} showsVerticalScrollIndicator={false}>
        {serverCard}

        <Section title="Cancel reminders">
          <View style={styles.rowCol}>
            <Text style={styles.label}>Remind me to cancel</Text>
            <Text style={styles.sub}>How many days before a renewal or trial end ({data.cancel_notice_days ?? 1} now).</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {[1, 2, 3, 7].map((d) => <Chip key={d} label={`${d} day${d > 1 ? "s" : ""}`} active={(data.cancel_notice_days ?? 1) === d} onPress={() => set("cancel_notice_days", d)} testID={`notice-${d}`} />)}
            </ScrollView>
          </View>
        </Section>

        <Section title="AI & processing">
          <ToggleRow icon="brain" label="AI processing" value={data.ai_enabled} onChange={(v) => set("ai_enabled", v)} />
          <ToggleRow icon="image-lock" label="Keep original screenshots" sub="Off = extract then discard image" value={data.keep_screenshots} onChange={(v) => set("keep_screenshots", v)} />
          <View style={styles.rowCol}>
            <Text style={styles.label}>Auto-add confidence</Text>
            <Text style={styles.sub}>Items above this are added automatically ({thresholdPct}%).</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {[0.85, 0.9, 0.95, 0.98].map((t) => <Chip key={t} label={`${Math.round(t * 100)}%`} active={Math.abs(data.auto_add_threshold - t) < 0.001} onPress={() => set("auto_add_threshold", t)} testID={`thr-${t}`} />)}
            </ScrollView>
          </View>
        </Section>

        <Section title="Money">
          <View style={styles.rowCol}>
            <Text style={styles.label}>Default currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {CURRENCIES.map((c) => <Chip key={c} label={c} active={data.currency === c} onPress={() => set("currency", c)} testID={`cur-${c}`} />)}
            </ScrollView>
          </View>
        </Section>

        <Section title="Monitoring">
          <ToggleRow icon="chart-line" label="Price monitoring" sub="Track watchlist plan prices" value={data.price_monitoring} onChange={(v) => set("price_monitoring", v)} />
        </Section>

        <Section title="Privacy">
          <Card style={styles.privacy}>
            <Icon name="shield-check-outline" size={20} color={colors.brandSecondary} />
            <Text style={styles.privacyText}>SubMind only processes what you intentionally share with it. Notification access and native sharing require an installed build and are always optional.</Text>
          </Card>
        </Section>

        <Section title="About">
          <ToggleRowStatic icon="restart" label="Replay onboarding" onPress={resetOnboarding} />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: any) {
  const styles = useStyles();
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={{ gap: 4, paddingVertical: 6 }}>{children}</Card>
    </View>
  );
}

function ToggleRow({ icon, label, sub, value, onChange }: { icon: string; label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={styles.iconBox}><Icon name={icon} size={18} color={colors.brandPrimary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <Switch value={!!value} onValueChange={onChange} trackColor={{ true: colors.brandPrimary, false: colors.border }} thumbColor="#FFFFFF" />
    </View>
  );
}

function ToggleRowStatic({ icon, label, onPress }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={styles.iconBox}><Icon name={icon} size={18} color={colors.brandPrimary} /></View>
      <Text style={[styles.rowLabel, { flex: 1 }]} onPress={onPress}>{label}</Text>
      <Icon name="chevron-right" size={20} color={colors.muted} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: "800", textTransform: "uppercase", marginLeft: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  iconBox: { width: 38, height: 38, borderRadius: 0, backgroundColor: colors.brandPrimary + "16", alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  rowCol: { paddingVertical: 10 },
  label: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  privacy: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: colors.brandSecondary + "12", borderColor: colors.brandSecondary + "22" },
  privacyText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
}));
