// SubMind design tokens: Nokia Lumia / Windows Phone "Metro" look.
// Flat and square, content first: pure black (dark) or white (light) canvas, big light-weight
// lowercase titles and solid saturated live tiles. Key names are stable so every screen
// restyles from here. Build StyleSheets with makeStyles and a colors callback; read
// useTheme().colors for non-style color props. Never write hex in components.
// Contrast: tile fills carry white text (>= 4.5:1); dark brand carries black text, light
// brand carries white text; muted text is >= 4.5:1 on its surface.

import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

// Windows Phone accent palette, darkened where needed so white tile text stays legible.
const TILE = {
  accentRed: "#E51400", // red
  accentYellow: "#9E6400", // amber (WP amber/yellow, darkened for text)
  accentOrange: "#C94F00", // orange
  accentBlue: "#0A7BB8", // cyan/cobalt
  accentPurple: "#6A00FF", // indigo
  accentGreen: "#008A00", // emerald
  accentPink: "#D80073", // magenta
  onAccent: "#FFFFFF",
};

const light = {
  surface: "#FFFFFF",
  onSurface: "#000000",
  surfaceSecondary: "#F2F2F2", // list / card tiles
  onSurfaceSecondary: "#111111",
  surfaceTertiary: "#E3E3E3",
  onSurfaceTertiary: "#333333",
  surfaceInverse: "#000000",
  onSurfaceInverse: "#FFFFFF",
  muted: "#5E5E5E",

  brand: "#0870A8",
  onBrand: "#FFFFFF",
  brandPrimary: "#0870A8",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#2F7A0A",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#C94F00",
  onBrandTertiary: "#FFFFFF",

  success: "#2F7A0A",
  onSuccess: "#FFFFFF",
  warning: "#8F5A00",
  onWarning: "#FFFFFF",
  error: "#C81000",
  onError: "#FFFFFF",
  info: "#0870A8",
  onInfo: "#FFFFFF",

  border: "#CFCFCF",
  borderStrong: "#9A9A9A",
  divider: "#DDDDDD",

  ...TILE,
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#000000",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1F1F1F",
  onSurfaceSecondary: "#F2F2F2",
  surfaceTertiary: "#2E2E2E",
  onSurfaceTertiary: "#D6D6D6",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  muted: "#9A9A9A",

  brand: "#1BA1E2",
  onBrand: "#000000",
  brandPrimary: "#1BA1E2",
  onBrandPrimary: "#000000",
  brandSecondary: "#60A917",
  onBrandSecondary: "#000000",
  brandTertiary: "#FA6800",
  onBrandTertiary: "#000000",

  success: "#6CC416",
  onSuccess: "#000000",
  warning: "#F0A30A",
  onWarning: "#000000",
  error: "#FF5544",
  onError: "#000000",
  info: "#1BA1E2",
  onInfo: "#000000",

  border: "#3A3A3A",
  borderStrong: "#6B6B6B",
  divider: "#2A2A2A",

  ...TILE,
};

// Windows Phone defaults to the dark theme.
export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" || system === "dark" ? (themes[system] ? system : defaultScheme) : defaultScheme;
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

// Metro typography: light weights, generous size, lowercase page titles.
export const font = {
  // Android maps weight 200/300 to Roboto Light; iOS uses the system thin/light.
  thin: { fontWeight: "200" as const, fontFamily: Platform.select({ android: "sans-serif-light", default: undefined }) },
  light: { fontWeight: "300" as const, fontFamily: Platform.select({ android: "sans-serif-light", default: undefined }) },
  regular: { fontWeight: "400" as const },
  semibold: { fontWeight: "600" as const },
};

// Gutter between Start-screen tiles (Windows Phone used 6px).
export const TILE_GAP = 6;

// Palette cycled per card for variety (same names as before).
export const ACCENT_KEYS = ["accentBlue", "accentPink", "accentOrange", "accentGreen", "accentPurple", "accentRed", "accentYellow"] as const;

export function accentFor(colors: ThemeColors, seed: string | number): string {
  const s = typeof seed === "number" ? seed : Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[ACCENT_KEYS[s % ACCENT_KEYS.length]] as string;
}
