import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/ui";
import { useInbox, useReminders } from "@/src/lib/api";
import { syncReminderNotifications } from "@/src/lib/notify";
import { makeStyles, useTheme } from "@/src/theme";

// Space that scroll content should leave at the bottom to clear the app bar.
export const TAB_BAR_SPACE = 92;

type TabMeta = { icon: string; iconActive: string; label: string };

const TAB_META: Record<string, TabMeta> = {
  index: { icon: "home-outline", iconActive: "home", label: "start" },
  subscriptions: { icon: "wallet-outline", iconActive: "wallet", label: "accounts" },
  inbox: { icon: "inbox-arrow-down-outline", iconActive: "inbox-arrow-down", label: "inbox" },
  ai: { icon: "robot-happy-outline", iconActive: "robot-happy", label: "ask ai" },
};

// Windows Phone "application bar": circled glyphs with tiny labels underneath.
function TabBar({ state, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const review = useInbox("needs_review");
  const reviewCount = review.data?.length ?? 0;

  const routes = state.routes.filter((r: any) => TAB_META[r.name]);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route: any) => {
    const idx = state.routes.findIndex((r: any) => r.key === route.key);
    const focused = state.index === idx;
    const meta = TAB_META[route.name];
    const isAi = route.name === "ai";
    // The AI tab is always filled so it is the easiest thing to spot and tap.
    const circleStyle = isAi
      ? { backgroundColor: colors.accentPink, borderColor: colors.accentPink }
      : { borderColor: focused ? colors.brandPrimary : colors.borderStrong };
    const glyph = isAi ? colors.onAccent : focused ? colors.brandPrimary : colors.onSurface;
    return (
      <Pressable
        key={route.key}
        testID={`tab-${route.name}`}
        style={styles.tab}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      >
        <View style={[styles.circle, circleStyle]}>
          <Icon name={focused ? meta.iconActive : meta.icon} size={22} color={glyph} />
          {route.name === "inbox" && reviewCount > 0 ? (
            <View style={styles.count}><Text style={styles.countText}>{reviewCount > 99 ? "99+" : reviewCount}</Text></View>
          ) : null}
        </View>
        <Text style={[styles.label, focused && { color: colors.onSurface }, isAi && { color: colors.accentPink, fontWeight: "700" }]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: (insets.bottom || 8) + 4 }]}>
      {left.map(renderTab)}
      <Pressable testID="tab-add" style={styles.tab} accessibilityRole="button" accessibilityLabel="add" onPress={() => router.push("/actions")}>
        <View style={[styles.circle, { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
          <Icon name="plus" size={26} color={colors.onBrandPrimary} />
        </View>
        <Text style={styles.label}>add</Text>
      </Pressable>
      {right.map(renderTab)}
    </View>
  );
}

export default function TabsLayout() {
  // Mirror server reminders to local notifications whenever they change.
  const reminders = useReminders();
  useEffect(() => {
    if (reminders.data) void syncReminderNotifications(reminders.data);
  }, [reminders.data]);

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="subscriptions" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="ai" />
    </Tabs>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start",
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: { alignItems: "center", gap: 3, minWidth: 64, paddingHorizontal: 4 },
  circle: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  label: { color: colors.muted, fontSize: 11, fontWeight: "500" },
  count: {
    position: "absolute", top: -6, right: -8, minWidth: 20, height: 20, paddingHorizontal: 5,
    borderRadius: 10, backgroundColor: colors.accentRed, alignItems: "center", justifyContent: "center",
  },
  countText: { color: colors.onAccent, fontSize: 11, fontWeight: "700" },
}));
