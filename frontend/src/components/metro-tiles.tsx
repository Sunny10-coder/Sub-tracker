/**
 * SubMind Metro UI primitives. Nokia Lumia / Windows Phone inspired:
 * flat saturated tiles, motion-aware live content and high-contrast typography.
 * Animation is paused outside focused screens and when Reduce Motion is enabled.
 */
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo, Animated, AppState, Pressable, StyleProp,
  StyleSheet, Text, View, ViewStyle,
} from "react-native";
import { Icon } from "@/src/components/ui";

export const METRO = {
  black: "#070707",
  cyan: "#00A9E8",
  electric: "#12B8ED",
  orange: "#F7A009",
  red: "#DD002A",
  purple: "#8540CA",
  green: "#299B35",
  cobalt: "#1269D2",
  pink: "#D52C80",
  teal: "#008A9A",
  blue: "#139DD9",
  ink: "#111111",
  white: "#FFFFFF",
  dim: "#AAAAAA",
  gap: 8,
} as const;

const CONDENSED = "sans-serif-condensed";
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduce(v); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => { mounted = false; listener.remove(); };
  }, []);
  return reduce;
}

/** One lightweight interval per *screen*, only while focused and foregrounded. */
export function useLiveMetroIndex(count: number, intervalMs = 9800): number {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  useFocusEffect(useCallback(() => {
    if (reduce || count < 2) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer || AppState.currentState !== "active") return;
      timer = setInterval(() => setIndex(i => (i + 1) % count), intervalMs);
    };
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    start();
    const sub = AppState.addEventListener("change", next => {
      if (next === "active") start();
      else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [reduce, count, intervalMs]));
  return index;
}

interface MetroTileProps {
  color: string;
  title: string;
  subtitle?: string;
  caption?: string;
  value?: string | number;
  icon?: string;
  height?: number;
  horizontal?: boolean;
  textColor?: string;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  liveKey?: number;
  animate?: boolean;
  children?: React.ReactNode;
}
export function MetroTile({
  color, title, subtitle, caption, value, icon,
  height = 178, horizontal = false, textColor = METRO.white,
  onPress, testID, style, liveKey = 0, animate = true, children,
}: MetroTileProps) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !animate) { opacity.setValue(1); shift.setValue(0); return; }
    opacity.setValue(0.2); shift.setValue(13);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(shift, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [liveKey, reduce, animate, opacity, shift]);
  return (
    <Animated.View style={[{ height, opacity, transform: [{ translateY: shift }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title + (subtitle ? ", " + subtitle : "")}
        accessibilityHint="Opens " 
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: color, opacity: pressed ? 0.84 : 1 },
        ]}
      >
        {horizontal ? (
          <View style={styles.horizontal}>
            {icon ? <Icon name={icon} size={47} color={textColor} /> : null}
            <View style={styles.horizontalBody}>
              {value !== undefined ? <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.count, { color: textColor }]}>{value}</Text> : null}
              <Text numberOfLines={2} style={[styles.title, { color: textColor }]}>{title.toUpperCase()}</Text>
              {subtitle ? <Text numberOfLines={2} style={[styles.subtitle, { color: textColor, opacity: 0.83 }]}>{subtitle}</Text> : null}
            </View>
            <Icon name="arrow-right" size={23} color={textColor}/>
          </View>
        ) : (
          <>
            {value !== undefined
              ? <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.count, { color: textColor }]}>{value}</Text>
              : icon ? <Icon name={icon} size={38} color={textColor}/> : null}
            <View style={styles.spacer} />
            <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.title, { color: textColor }]}>{title.toUpperCase()}</Text>
            {subtitle ? <Text numberOfLines={2} style={[styles.subtitle, { color: textColor, opacity: 0.85 }]}>{subtitle}</Text> : null}
            {caption ? <Text numberOfLines={1} style={[styles.caption, { color: textColor, opacity: 0.76 }]}>{caption.toUpperCase()}</Text> : null}
          </>
        )}
        {children}
      </Pressable>
    </Animated.View>
  );
}
export function MetroSection({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return <View style={styles.section}>
    <Text style={styles.sectionName}>{title.toUpperCase()}</Text>
    {trailing}
  </View>;
}
export function MetroBrand({ word = "SUBMIND" }: { word?: string }) {
  return <View style={styles.brandRow}>
    <Text style={styles.brand}>{word.slice(0, 1)}</Text>
    <Text style={[styles.brand, { color: METRO.cyan }]}>{word.slice(1, 2)}</Text>
    <Text style={styles.brand}>{word.slice(2)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1, padding: 17, borderRadius: 2, overflow: "hidden",
    justifyContent: "flex-start",
  },
  count: {
    fontFamily: CONDENSED, fontSize: 70, fontWeight: "900",
    lineHeight: 78, letterSpacing: -2.4,
  },
  title: {
    fontFamily: CONDENSED, fontSize: 23, fontWeight: "900",
    lineHeight: 27, letterSpacing: 0.4,
  },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 7, fontWeight: "500" },
  caption: { fontFamily: CONDENSED, fontSize: 12, letterSpacing: 1.1, marginTop: 9, fontWeight: "800" },
  spacer: { flex: 1, minHeight: 3 },
  horizontal: { flex: 1, flexDirection: "row", alignItems: "center", gap: 15 },
  horizontalBody: { flex: 1, justifyContent: "center" },
  section: { marginTop: 21, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionName: { color: METRO.white, fontFamily: CONDENSED, fontSize: 17, fontWeight: "900", letterSpacing: 1.5 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brand: { fontFamily: CONDENSED, color: METRO.white, fontSize: 39, letterSpacing: 1.8, fontWeight: "400" },
});
