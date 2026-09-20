import { Tabs, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

// Space that scroll content should leave at the bottom to clear the floating pill.
export const TAB_BAR_SPACE = 104;

const TAB_META: Record<string, { icon: string; iconActive: string }> = {
  index: { icon: "home-variant-outline", iconActive: "home-variant" },
  subscriptions: { icon: "wallet-outline", iconActive: "wallet" },
  inbox: { icon: "inbox-arrow-down-outline", iconActive: "inbox-arrow-down" },
  ai: { icon: "chat-processing-outline", iconActive: "chat-processing" },
};

function TabBar({ state, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const routes = state.routes.filter((r) => TAB_META[r.name]);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route: any) => {
    const idx = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === idx;
    const meta = TAB_META[route.name];
    return (
      <Pressable
        key={route.key}
        testID={`tab-${route.name}`}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      >
        <View style={[styles.tabInner, focused && styles.tabActive]}>
          <Icon name={focused ? meta.iconActive : meta.icon} size={24} color={focused ? colors.onAccent : "#B9B4AC"} />
        </View>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: (insets.bottom || 12) + 6 }]}>
      <View style={styles.pill}>
        {left.map(renderTab)}
        <Pressable testID="tab-add" style={styles.fab} onPress={() => router.push("/actions")}>
          <Icon name="plus" size={28} color={colors.onAccent} />
        </Pressable>
        {right.map(renderTab)}
      </View>
    </View>
  );
}

export default function TabsLayout() {
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
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceInverse,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  tab: { paddingHorizontal: 4 },
  tabInner: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.accentYellow },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentYellow,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
  },
}));
