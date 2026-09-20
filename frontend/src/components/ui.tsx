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

import { makeStyles, useTheme } from "@/src/theme";

export function Icon({ name, size = 22, color }: { name: any; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <MaterialDesignIcons name={name} size={size} color={color ?? colors.onSurface} />;
}

// Sticky app header, safe-area aware.
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
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={12} testID="header-back" style={styles.backBtn}>
            <Icon name="chevron-left" size={26} color={colors.onSurface} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
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
      <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]} testID={testID}>{children}</View>;
}

export function PrimaryButton({ title, onPress, icon, disabled, loading, variant = "primary", testID, style }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg =
    variant === "secondary" ? colors.surfaceTertiary : variant === "mint" ? colors.brandSecondary : colors.brandPrimary;
  const fg =
    variant === "secondary" ? colors.onSurfaceTertiary : variant === "mint" ? colors.onBrandSecondary : colors.onBrandPrimary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.9 : 1 }, style]}
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
    <Pressable onPress={onPress} testID={testID} style={[styles.chip, active && styles.chipActive]}>
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
    brand: [colors.brandPrimary + "22", colors.brandPrimary],
    mint: [colors.brandSecondary + "22", colors.brandSecondary],
    peach: [colors.brandTertiary + "33", colors.brandTertiary],
    success: [colors.success + "22", colors.success],
    warning: [colors.warning + "22", colors.warning],
    error: [colors.error + "22", colors.error],
    muted: [colors.surfaceTertiary, colors.muted],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round((value || 0) * 100);
  const tone = pct >= 95 ? "mint" : pct >= 75 ? "warning" : "muted";
  return <Badge label={`${pct}% match`} tone={tone as any} />;
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

export function CategoryDot({ category, size = 40 }: { category?: string; size?: number }) {
  const { colors } = useTheme();
  const palette: any = {
    AI: colors.brandPrimary,
    Streaming: colors.error,
    Music: colors.brandSecondary,
    Productivity: colors.info,
    Cloud: colors.info,
    Gaming: colors.brandTertiary,
    News: colors.warning,
    Fitness: colors.success,
    Shopping: colors.brandTertiary,
    Other: colors.muted,
  };
  const icons: any = {
    AI: "robot", Streaming: "play-circle", Music: "music", Productivity: "briefcase",
    Cloud: "cloud", Gaming: "gamepad-variant", News: "newspaper", Fitness: "dumbbell",
    Shopping: "shopping", Other: "shape",
  };
  const c = palette[category || "Other"] || colors.muted;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: c + "22", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icons[category || "Other"] || "shape"} size={size * 0.5} color={c} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { marginLeft: -6 },
  headerTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSubtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  btnText: { fontSize: 16, fontWeight: "700" },
  chipRow: { flexGrow: 0 },
  chipRowContent: { gap: 8, paddingHorizontal: 20, alignItems: "center" },
  chip: {
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 32, gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24, backgroundColor: colors.brandPrimary + "18",
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyMsg: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
}));
