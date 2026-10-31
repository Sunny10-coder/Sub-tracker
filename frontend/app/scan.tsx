import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { money, formatDate } from "@/src/lib/format";
import { AppHeader, Card, ConfidenceBadge, Icon, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Scan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const [status, setStatus] = useState<"idle" | "picking" | "processing" | "done" | "error" | "blocked">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [errorMessage,setErrorMessage]=useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) { started.current = true; run(); }
  }, []);

  const run = async () => {
    setStatus("picking");
    try {
      const isCamera = mode === "camera";
      const perm = isCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setStatus(perm.canAskAgain ? "idle" : "blocked");
        return;
      }
      const res = isCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, mediaTypes: ["images"] })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.[0]?.base64) { setStatus("idle"); return; }
      const asset = res.assets[0];
      setPreview(asset.uri);
      setStatus("processing");
      const inbox = await api.ingestImage(asset.base64!, "screenshot");
      setResult(inbox);
      invalidate();
      setStatus("done");
    } catch (e:any) {
      setErrorMessage(e?.message||"Something went wrong");
      setStatus("error");
    }
  };

  const ex = result?.extraction || {};

  return (
    <View style={styles.container}>
      <AppHeader title="Scan screenshot" back />
      <View style={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 20 }}>
        {preview ? <Image source={{ uri: preview }} style={styles.preview} contentFit="cover" /> : null}

        {(status === "picking" || status === "processing") && (
          <Card style={styles.center}>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text style={styles.centerText}>{status === "processing" ? "AI is reading your screenshot…" : "Opening…"}</Text>
          </Card>
        )}

        {status === "blocked" && (
          <Card style={styles.center}>
            <Icon name="lock-outline" size={30} color={colors.warning} />
            <Text style={styles.centerText}>Permission is off. Enable it in Settings to scan.</Text>
            <PrimaryButton title="Open Settings" icon="cog" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        )}

        {status === "idle" && !preview && (
          <Card style={styles.center}>
            <Icon name="image-search-outline" size={30} color={colors.brandPrimary} />
            <Text style={styles.centerText}>Pick a subscription screenshot and let AI extract the details.</Text>
            <PrimaryButton title={mode === "camera" ? "Open camera" : "Choose photo"} icon={mode === "camera" ? "camera" : "image"} onPress={run} testID="scan-start" />
          </Card>
        )}

        {status === "error" && (
          <Card style={styles.center}>
            <Icon name="alert-circle-outline" size={30} color={colors.error} />
            <Text style={styles.centerText}>{errorMessage||"Something went wrong. Please try again."}</Text>
            <PrimaryButton title="Retry" icon="refresh" onPress={run} />
          </Card>
        )}

        {status === "done" && (
          <Card testID="scan-result">
            <View style={styles.resultTop}>
              <Text style={styles.resultTitle}>{ex.provider || ex.product || "Detected item"}</Text>
              <ConfidenceBadge value={result.confidence} />
            </View>
            <Text style={styles.resultType}>{(ex.content_type || "unknown").toUpperCase()}</Text>
            {ex.price != null ? <Text style={styles.resultRow}>Price: {money(ex.price, ex.currency)} / {ex.billing_cycle || "—"}</Text> : null}
            {ex.renewal_date ? <Text style={styles.resultRow}>Renews: {formatDate(ex.renewal_date)}</Text> : null}
            {ex.trial_end ? <Text style={styles.resultRow}>Trial ends: {formatDate(ex.trial_end)}</Text> : null}
            {ex.summary ? <Text style={styles.summary}>{ex.summary}</Text> : null}
            <Text style={styles.saved}>
              {result.status === "auto_added" ? "✓ Auto-added to your library" : "Saved to Smart Inbox for review"}
            </Text>
            <View style={{ gap: 10, marginTop: 14 }}>
              <PrimaryButton title="Review in Inbox" icon="inbox-arrow-down" onPress={() => router.replace("/(tabs)/inbox")} testID="scan-inbox" />
              <PrimaryButton title="Scan another" icon="camera" variant="secondary" onPress={() => { setPreview(null); setResult(null); run(); }} />
            </View>
          </Card>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  preview: { width: "100%", height: 200, borderRadius: 0, backgroundColor: colors.surfaceTertiary },
  center: { alignItems: "center", gap: 14, paddingVertical: 30 },
  centerText: { color: colors.onSurfaceSecondary, fontSize: 15, textAlign: "center", lineHeight: 21 },
  resultTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultTitle: { color: colors.onSurfaceSecondary, fontSize: 20, fontWeight: "800", flex: 1 },
  resultType: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  resultRow: { color: colors.onSurfaceSecondary, fontSize: 15, marginTop: 8, fontWeight: "600" },
  summary: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20, marginTop: 12 },
  saved: { color: colors.success, fontSize: 13, fontWeight: "700", marginTop: 12 },
}));
