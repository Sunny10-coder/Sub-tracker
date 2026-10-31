// Windows Phone style live tiles for the Start screen.
// A Tile is a flat colored square (or wide rectangle). A tile given several `faces`
// flips (rotateX) between them on a timer like a Lumia live tile. Reduce-motion is respected.
import React, { ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, useWindowDimensions } from "react-native";

import { Icon } from "@/src/components/ui";
import { TILE_GAP, font, makeStyles, useTheme } from "@/src/theme";

const SCREEN_PAD = 12;
const FLIP_MS = 320;

export function useTileSize() {
  const { width } = useWindowDimensions();
  const square = Math.floor((width - SCREEN_PAD * 2 - TILE_GAP) / 2);
  return { square, wide: square * 2 + TILE_GAP, pad: SCREEN_PAD, gap: TILE_GAP };
}

type TileProps = {
  title: string;
  icon?: string;
  color: string;
  wide?: boolean;
  small?: boolean;          // quarter-size icon tile
  badge?: number | string | null;
  onPress?: () => void;
  faces?: ReactNode[];      // live faces; when 2+ the tile flips between them
  interval?: number;        // ms between flips
  delay?: number;           // stagger so tiles don't all flip together
  height?: number;          // override (e.g. small tiles)
  children?: ReactNode;     // static face
  testID?: string;
  hint?: string;
};

export function Tile({ title, icon, color, wide, small, badge, onPress, faces, interval = 5200, delay = 0, height, children, testID, hint }: TileProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { square, wide: wideW } = useTileSize();
  const [idx, setIdx] = useState(0);
  const [rot] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(1));
  const faceCount = faces?.length ?? 0;

  useEffect(() => {
    if (faceCount < 2) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      Animated.timing(rot, { toValue: 1, duration: FLIP_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (!finished || cancelled) return;
        setIdx((i) => (i + 1) % faceCount);
        rot.setValue(-1);
        Animated.timing(rot, { toValue: 0, duration: FLIP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          if (!cancelled) timer = setTimeout(tick, interval);
        });
      });
    };
    const start = async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled();
      if (!reduce && !cancelled) timer = setTimeout(tick, interval + delay);
    };
    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      rot.stopAnimation();
      rot.setValue(0);
    };
  }, [faceCount, interval, delay, rot]);

  const rotateX = rot.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-90deg", "0deg", "90deg"] });
  const smallSize = Math.floor((square - TILE_GAP) / 2);
  const w = small ? smallSize : wide ? wideW : square;
  const h = small ? smallSize : height ?? square;
  const face = faceCount > 0 ? faces![idx % faceCount] : children;

  const tilt = (to: number) => Animated.timing(press, { toValue: to, duration: 90, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => tilt(0.95)}
      onPressOut={() => tilt(1)}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
    >
      <Animated.View style={{ width: w, height: h, transform: [{ scale: press }] }}>
        <Animated.View style={[styles.tile, { backgroundColor: color, transform: [{ perspective: 900 }, { rotateX }] }]}>
          {small ? (
            <View style={styles.smallBody}>
              {icon ? <Icon name={icon} size={26} color={colors.onAccent} /> : null}
              <Text style={styles.smallTitle} numberOfLines={1}>{title}</Text>
            </View>
          ) : (
            <>
              <View style={styles.faceArea}>{face}</View>
              <View style={styles.footer}>
                {icon ? <Icon name={icon} size={22} color={colors.onAccent} /> : <View />}
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
              </View>
            </>
          )}
        </Animated.View>
        {badge !== null && badge !== undefined && badge !== 0 && badge !== "" ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// Text helpers so each face stays consistent.
export function TileBig({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{children}</Text>;
}

// Mid-size light text for a short quote or sentence on a face.
export function TileMid({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.mid} numberOfLines={3}>{children}</Text>;
}

export function TileLine({ children, strong }: { children: ReactNode; strong?: boolean }) {
  const styles = useStyles();
  return <Text style={[styles.line, strong && styles.lineStrong]} numberOfLines={2}>{children}</Text>;
}

const useStyles = makeStyles((colors) => ({
  tile: { flex: 1, padding: 10, justifyContent: "space-between", backfaceVisibility: "hidden" },
  smallBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  smallTitle: { color: colors.onAccent, fontSize: 10, fontWeight: "500" },
  faceArea: { flex: 1, justifyContent: "flex-start", gap: 2 },
  footer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
  title: { color: colors.onAccent, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
  big: { ...font.thin, color: colors.onAccent, fontSize: 46, lineHeight: 54 },
  mid: { ...font.light, color: colors.onAccent, fontSize: 24, lineHeight: 30, marginTop: 6 },
  line: { ...font.light, color: colors.onAccent, fontSize: 15, lineHeight: 19 },
  lineStrong: { fontWeight: "600", fontFamily: undefined },
  badge: {
    position: "absolute", top: 8, right: 8, minWidth: 26, height: 26, paddingHorizontal: 6,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.onAccent, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
}));
