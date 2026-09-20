import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const ACTIONS = [
  { icon: "camera", label: "Scan Screenshot", tone: "brand", href: "/scan?mode=camera" },
  { icon: "image-multiple", label: "Choose Photo", tone: "mint", href: "/scan?mode=library" },
  { icon: "link-variant", label: "Paste Link", tone: "peach", href: "/paste-link" },
  { icon: "wallet-plus", label: "Add Subscription", tone: "brand", href: "/add-subscription" },
  { icon: "eye-plus", label: "Add Plan", tone: "mint", href: "/add-plan" },
  { icon: "bell-plus", label: "Add Reminder", tone: "peach", href: "/add-reminder" },
  { icon: "note-plus", label: "Add Note", tone: "brand", href: "/add-note" },
  { icon: "robot", label: "Ask AI", tone: "mint", href: "/(tabs)/ai" },
] as const;

export default function Actions() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const go = (href: string) => {
    router.back();
    setTimeout(() => router.push(href as any), 60);
  };

  const toneColor = (t: string) =>
    t === "mint" ? colors.brandSecondary : t === "peach" ? colors.brandTertiary : colors.brandPrimary;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} testID="actions-backdrop" onPress={() => router.back()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Add to SubMind</Text>
        <View style={styles.grid}>
          {ACTIONS.map((a) => (
            <Pressable key={a.label} testID={`action-${a.label}`} style={styles.tile} onPress={() => go(a.href)}>
              <View style={[styles.tileIcon, { backgroundColor: toneColor(a.tone) + "22" }]}>
                <Icon name={a.icon} size={26} color={toneColor(a.tone)} />
              </View>
              <Text style={styles.tileLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backgroundColor: "#00000066" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  tile: { width: "23%", alignItems: "center", marginBottom: 20, gap: 8 },
  tileIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tileLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600", textAlign: "center" },
}));
