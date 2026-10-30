// Design tokens for SubMind. Light + Dark. Keys match design_guidelines.json.
// Build StyleSheets with makeStyles((colors) => ...); read useTheme().colors for
// non-style color props (icon color, placeholders). Never write hex in components.

import { useMemo } from "react";
import { Appearance, StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F4F1EA", // warm paper canvas
  onSurface: "#17151F",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1A24",
  surfaceTertiary: "#ECE8DF",
  onSurfaceTertiary: "#4A4A58",
  surfaceInverse: "#141319", // dark hero cards / nav pill
  onSurfaceInverse: "#FFFFFF",
  muted: "#8A8578",

  brand: "#5B45FF",
  onBrand: "#FFFFFF",
  brandPrimary: "#5B45FF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#00C08B",
  onBrandSecondary: "#003B2E",
  brandTertiary: "#FF8C7A",
  onBrandTertiary: "#4A150D",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#E5900B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E4DFD4",
  borderStrong: "#CFC8B8",
  divider: "#E8E3D8",

  // Bright color-blocks for cards / bubbles / folders
  accentRed: "#F4503F",
  accentYellow: "#FFCC3E",
  accentOrange: "#FF7A2F",
  accentBlue: "#5AA9E6",
  accentPurple: "#C09BEB",
  accentGreen: "#5FBE8A",
  accentPink: "#FF8FB1",
  onAccent: "#1F1A15", // dark ink on every bright accent
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#131317",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1F1F23",
  onSurfaceSecondary: "#F3F4F6",
  surfaceTertiary: "#2A292E",
  onSurfaceTertiary: "#D1D5DB",
  surfaceInverse: "#26232B",
  onSurfaceInverse: "#F9F8FB",
  muted: "#A9A4AE",

  brand: "#FFB4AA",
  onBrand: "#FFFFFF",
  brandPrimary: "#FFB4AA",
  onBrandPrimary: "#410001",
  brandSecondary: "#00DBE9",
  onBrandSecondary: "#003B2E",
  brandTertiary: "#DCB8FF",
  onBrandTertiary: "#4A150D",

  success: "#34D399",
  onSuccess: "#064E3B",
  warning: "#FBBF24",
  onWarning: "#78350F",
  error: "#F87171",
  onError: "#7F1D1D",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#353439",
  borderStrong: "#50484E",
  divider: "#29262D",

  accentRed: "#F4503F",
  accentYellow: "#FFCC3E",
  accentOrange: "#FF7A2F",
  accentBlue: "#5AA9E6",
  accentPurple: "#C09BEB",
  accentGreen: "#5FBE8A",
  accentPink: "#FF8FB1",
  onAccent: "#1F1A15",
};

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const scheme: ColorScheme = "dark"; // Reference screens use a consistent dark vault theme.
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Bright color-block palette, cycled per card for the playful look.
export const ACCENT_KEYS = ["accentYellow", "accentRed", "accentOrange", "accentBlue", "accentPurple", "accentGreen", "accentPink"] as const;

export function accentFor(colors: ThemeColors, seed: string | number): string {
  const s = typeof seed === "number" ? seed : Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[ACCENT_KEYS[s % ACCENT_KEYS.length]] as string;
}
