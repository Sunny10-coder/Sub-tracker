import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/ui";
import { font, makeStyles, useTheme } from "@/src/theme";

// Each action is a small colored Metro tile.
const ACTIONS = [
  { icon: "link-variant", label: "Paste link", color: "accentPink", href: "/paste-link" },
  { icon: "email-plus-outline", label: "Paste email", color: "accentBlue", href: "/add-email" },
  { icon: "camera", label: "Scan screenshot", color: "accentRed", href: "/scan?mode=camera" },
  { icon: "image-multiple", label: "Choose photo", color: "accentOrange", href: "/scan?mode=library" },
  { icon: "wallet-plus", label: "Add subscription", color: "accentGreen", href: "/add-subscription" },
  { icon: "tag-plus-outline", label: "Add plan", color: "accentPurple", href: "/add-plan" },
  { icon: "bell-plus", label: "Add reminder", color: "accentYellow", href: "/add-reminder" },
  { icon: "note-plus", label: "Add note", color: "accentBlue", href: "/add-note" },
  { icon: "robot-happy", label: "Ask AI", color: "accentPink", href: "/(tabs)/ai" },
  { icon: "apps", label: "More tools", color: "accentBlue", href: "/restored-tools" },
] as const;

export default function Actions() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const go = (href: string) => {
    router.back();
    setTimeout(() => router.push(href as never), 60);
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} testID="actions-backdrop" onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>add</Text>
        <View style={styles.grid}>
          {ACTIONS.map((a) => (
            <Pressable key={a.label} testID={`action-${a.label}`} style={[styles.tile, { backgroundColor: colors[a.color] }]} onPress={() => go(a.href)} accessibilityRole="button" accessibilityLabel={a.label}>
              <Icon name={a.icon} size={28} color={colors.onAccent} />
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
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000000B3" },
  sheet: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 14 },
  title: { ...font.thin, color: colors.onSurface, fontSize: 44, marginLeft: 8, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tile: { width: "32.2%", aspectRatio: 1, padding: 10, justifyContent: "space-between" },
  tileLabel: { color: colors.onAccent, fontSize: 13, fontWeight: "500" },
}));
