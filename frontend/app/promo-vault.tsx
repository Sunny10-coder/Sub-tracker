import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { ScrollView, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePromoCodes } from "@/src/lib/api";
import { AppHeader, Card, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
export default function PromoVault() {
  const styles = useStyles();
  const {colors} = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {data, isLoading, refetch} = usePromoCodes();
  return <View style={styles.container}>
    <AppHeader title="Promo Vault" subtitle="Saved codes from links and searches" back/>
    {isLoading ? <Loading/> : <ScrollView contentContainerStyle={{padding:20,paddingBottom:insets.bottom+40,gap:12}}>
      <Card style={{gap:8}}>
        <Text style={styles.title}>{data?.length || 0} saved promo codes</Text>
        <Text style={styles.muted}>Codes are not automatically verified or applied to checkout. Check eligibility, expiry and renewal pricing.</Text>
        <PrimaryButton title="Find codes in pasted emails" icon="email-search" variant="secondary" onPress={()=>router.push("/mail-codes")}/>
        <PrimaryButton title="Find promo codes online" icon="magnify" onPress={()=>router.push("/deals")}/>
        <PrimaryButton title="Inspect pasted offer link" icon="link-variant" variant="secondary" onPress={()=>router.push("/inspect-offer")}/>
      </Card>
      {data?.map((c:any)=><Card key={c.id} style={{gap:9}}>
        <View style={styles.head}><Text style={styles.title}>{c.provider}</Text><Text style={styles.warning}>Unverified</Text></View>
        <Pressable onPress={()=>Clipboard.setStringAsync(c.code)} style={styles.copy}><Text style={styles.code}>{c.code}</Text><Icon name="content-copy" color={colors.brandPrimary}/></Pressable>
        {c.discount_text ? <Text style={styles.muted}>{c.discount_text}</Text>:null}
        {c.account_email ? <Text style={styles.muted}>For account: {c.account_email}</Text>:null}
        <Text style={styles.muted}>Found via {c.source} · {String(c.created_at || "").slice(0,10)}</Text>
        {c.source_url ? <PrimaryButton title="Check offer source" icon="open-in-new" variant="secondary" onPress={()=>WebBrowser.openBrowserAsync(c.source_url)}/>:null}
      </Card>)}
    </ScrollView>}
  </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 title:{fontSize:17,fontWeight:"800",color:c.onSurface,flex:1},
 muted:{color:c.muted,fontSize:12,lineHeight:18},
 head:{flexDirection:"row",justifyContent:"space-between",gap:8,alignItems:"center"},
 warning:{color:c.warning,fontWeight:"800",fontSize:12},
 copy:{padding:13,borderRadius:14,backgroundColor:c.surfaceTertiary,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 code:{color:c.onSurface,fontSize:20,fontWeight:"800",letterSpacing:1.4}
}));