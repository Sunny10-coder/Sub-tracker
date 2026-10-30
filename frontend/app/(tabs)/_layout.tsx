import { Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

// Main navigation is intentionally reserved for financial/account essentials.
// Brain Map, Promo Vault and AI Prompts are available in Vault & AI.
export const TAB_BAR_SPACE = 100;
const PRIMARY = [
  { name: "index", label: "Home", icon: "home-variant-outline", active: "home-variant" },
  { name: "subscriptions", label: "Plans", icon: "wallet-outline", active: "wallet" },
  { name: "account-hub", label: "Accounts", icon: "account-multiple-outline", active: "account-multiple" },
  { name: "renewals", label: "Renewals", icon: "calendar-clock-outline", active: "calendar-clock" },
  { name: "vault", label: "Vault & AI", icon: "view-dashboard-outline", active: "view-dashboard" },
] as const;

function PrimaryTabBar({ state, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(8, insets.bottom) + 4 }]}>
    <View style={styles.pill}>
      {PRIMARY.map(item => {
        const route = state.routes.find((r: any) => r.name === item.name);
        if (!route) return null;
        const index = state.routes.findIndex((r: any) => r.key === route.key);
        const active = state.index === index;
        return <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.label}
          accessibilityState={{ selected: active }} testID={"tab-" + item.name}
          style={styles.tab} onPress={() => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented) navigation.navigate(item.name);
          }}>
          <View style={[styles.iconWrap, active && styles.iconActive]}>
            <Icon name={active ? item.active : item.icon} size={23}
                  color={active ? "#00A9E8" : "#B4B4B4"}/>
          </View>
          <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
export default function TabsLayout() {
 return <Tabs tabBar={(p) => <PrimaryTabBar {...p}/>} screenOptions={{headerShown:false}}>
   <Tabs.Screen name="index" />
   <Tabs.Screen name="subscriptions" />
   <Tabs.Screen name="account-hub" />
   <Tabs.Screen name="renewals" />
   <Tabs.Screen name="vault" />
   <Tabs.Screen name="spending" options={{ href: null }} />
   <Tabs.Screen name="inbox" options={{ href: null }} />
   <Tabs.Screen name="ai" options={{ href: null }} />
 </Tabs>;
}
const useStyles = makeStyles(c => ({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  pill: { flexDirection: "row", backgroundColor: "#111111", borderWidth: 1,
          borderColor: "#252525", borderRadius: 23, paddingHorizontal: 5, paddingVertical: 7,
          shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width:0, height:6 }, elevation:12 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 57, gap: 1 },
  iconWrap: { height: 34, width: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconActive: { backgroundColor: "#003B58" },
  label: { color: "#B4B4B4", fontSize: 10, fontWeight: "600", letterSpacing: -0.1 },
  labelActive: { color: "#00A9E8", fontWeight:"800" },
}));