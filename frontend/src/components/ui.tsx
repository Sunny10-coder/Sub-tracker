import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, makeStyles, useTheme } from "@/src/theme";

export function Icon({ name, size = 22, color }: { name: any; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <MaterialDesignIcons name={name} size={size} color={color ?? colors.onSurface} />;
}

// Metro page header: tiny app label, then a big light lowercase title.
export function AppHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerRow}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={12} testID="header-back" accessibilityRole="button" accessibilityLabel="Back" style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.appLabel}>SUBMIND</Text>
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title.toLowerCase()}</Text>
          {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function Card({ children, style, onPress, testID }: any) {
  const styles = useStyles();
  if (onPress) {
    return (
      <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.8 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]} testID={testID}>{children}</View>;
}

export function PrimaryButton({ title, onPress, icon, disabled, loading, variant = "primary", testID, style }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const outline = variant === "secondary";
  const fills: Record<string, { bg: string; fg: string }> = {
    primary: { bg: colors.brandPrimary, fg: colors.onBrandPrimary },
    mint: { bg: colors.brandSecondary, fg: colors.onBrandSecondary },
    peach: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
    secondary: { bg: "transparent", fg: colors.onSurface },
  };
  const { bg, fg } = fills[variant] ?? fills.primary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: outline ? colors.borderStrong : bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, testID }: any) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ items, value, onChange, testIDPrefix }: any) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRowContent}
      style={styles.chipRow}
    >
      {items.map((it: string) => (
        <Chip
          key={it}
          label={it}
          active={value === it}
          onPress={() => onChange(it)}
          testID={`${testIDPrefix}-${it}`}
        />
      ))}
    </ScrollView>
  );
}

export function Badge({ label, tone = "brand" }: { label: string; tone?: "brand" | "mint" | "peach" | "success" | "warning" | "error" | "muted" }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const map: any = {
    brand: [colors.brandPrimary + "26", colors.brandPrimary],
    mint: [colors.brandSecondary + "26", colors.brandSecondary],
    peach: [colors.brandTertiary + "2E", colors.brandTertiary],
    success: [colors.success + "26", colors.success],
    warning: [colors.warning + "26", colors.warning],
    error: [colors.error + "26", colors.error],
    muted: [colors.surfaceTertiary, colors.muted],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const HIGH_CONFIDENCE = 95;
const MEDIUM_CONFIDENCE = 75;

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round((value || 0) * 100);
  const tone: "mint" | "warning" | "muted" = pct >= HIGH_CONFIDENCE ? "mint" : pct >= MEDIUM_CONFIDENCE ? "warning" : "muted";
  return <Badge label={`${pct}% match`} tone={tone} />;
}

export function EmptyState({ icon, title, message, action }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID="empty-state">
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={34} color={colors.brandPrimary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMsg}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

// Small section label used between groups ("cancel soon", "promo codes", ...).
export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{String(children).toLowerCase()}</Text>
      {right}
    </View>
  );
}

export function CategoryDot({ category, size = 40 }: { category?: string; size?: number }) {
  const { colors } = useTheme();
  const palette: any = {
    AI: colors.accentPurple,
    Streaming: colors.accentRed,
    Music: colors.accentGreen,
    Productivity: colors.accentBlue,
    Cloud: colors.accentBlue,
    Gaming: colors.accentOrange,
    News: colors.accentYellow,
    Fitness: colors.accentGreen,
    Shopping: colors.accentPink,
    Other: colors.borderStrong,
  };
  const icons: any = {
    AI: "robot", Streaming: "play-circle", Music: "music", Productivity: "briefcase",
    Cloud: "cloud", Gaming: "gamepad-variant", News: "newspaper", Fitness: "dumbbell",
    Shopping: "shopping", Other: "shape",
  };
  const c = palette[category || "Other"] || colors.borderStrong;
  return (
    <View style={{ width: size, height: size, backgroundColor: c, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icons[category || "Other"] || "shape"} size={size * 0.5} color={colors.onAccent} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.onSurface,
    alignItems: "center", justifyContent: "center",
  },
  appLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 2.5 },
  headerTitle: { ...font.light, color: colors.onSurface, fontSize: 42, lineHeight: 50, letterSpacing: -0.5 },
  headerSubtitle: { color: colors.muted, fontSize: 14, marginTop: 0 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 0,
    padding: 16,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 0,
    borderWidth: 2,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnText: { fontSize: 16, fontWeight: "600" },
  chipRow: { flexGrow: 0 },
  chipRowContent: { gap: 8, paddingHorizontal: 20, alignItems: "center" },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 0,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.surfaceSecondary,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 0, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 32, gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 0, borderWidth: 2, borderColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  emptyTitle: { ...font.light, color: colors.onSurface, fontSize: 26, textAlign: "center" },
  emptyMsg: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
  sectionLabel: { ...font.light, color: colors.onSurface, fontSize: 26 },
}));
