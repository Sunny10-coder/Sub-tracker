import { useRouter } from "expo-router";
import { ScrollView, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const TOOLS = [
  { title: "Smart Companion", detail: "Goals · credit optimizer · benefit matcher · follow-ups · GitHub watch · connections", icon: "brain", path: "/smart-companion" },
  { title: "Gmail Sync", detail: "Connected inboxes · verified findings · duplicate-aware import", icon: "gmail", path: "/gmail-sync" },
  { title: "AI Models & Keys", detail: "Gemini, Groq, NVIDIA and Brave · test access", icon: "key-variant", path: "/api-keys" },
  { title: "Tool Brain Map", detail: "Map your own tools · find tools for goals", icon: "brain", path: "/tool-brain" },
  { title: "Accounts", detail: "Registered services and connected plans", icon: "account-multiple", path: "/(tabs)/account-hub" },
  { title: "Promotions & Offers", detail: "Coupons, offers and monitored sources", icon: "tag-multiple", path: "/promo-vault" },
  { title: "Prompt Vault", detail: "Reusable prompts and saved ideas", icon: "text-box-multiple", path: "/prompt-vault" },
  { title: "Review Gmail Findings", detail: "Doubtful items and safe reconciliation", icon: "inbox-arrow-down", path: "/mail-review" },
  { title: "Import Private Records", detail: "Restore preloaded subscriptions and benefits from private JSON", icon: "file-import", path: "/import-data" },
  { title: "Export Private Backup", detail: "Keep a complete device-local backup", icon: "database-export", path: "/export-data" },
  { title: "Deals Search", detail: "Search discounts and plan offers using configured provider", icon: "magnify", path: "/deals" },
] as const;

export default function RestoredTools() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppHeader title="More tools" subtitle="Your restored SubMind capabilities" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 9 }}>
        {TOOLS.map((tool) => (
          <Pressable key={tool.path} accessibilityRole="button"
            accessibilityLabel={tool.title} onPress={() => router.push(tool.path as never)}
            style={styles.entry}>
            <View style={styles.glyph}><Icon name={tool.icon} size={24} color={colors.brandPrimary}/></View>
            <View style={{flex:1,gap:3}}>
              <Text style={styles.title}>{tool.title}</Text>
              <Text style={styles.detail}>{tool.detail}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.muted}/>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container:{ flex:1, backgroundColor:c.surface },
  entry:{ flexDirection:"row", alignItems:"center", padding:14, gap:12, backgroundColor:c.surfaceSecondary, borderWidth:1, borderColor:c.border },
  glyph:{ width:45, height:45, alignItems:"center", justifyContent:"center", backgroundColor:c.surfaceTertiary },
  title:{ color:c.onSurface, fontSize:16, fontWeight:"700" },
  detail:{ color:c.muted, fontSize:12, lineHeight:17 },
}));
