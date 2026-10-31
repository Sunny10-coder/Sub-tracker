import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccounts, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, ChipRow, EmptyState, Icon, Loading, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const FILTERS = ["All", "With plans", "No plans"] as const;
export default function Accounts() {
  const styles = useStyles(), { colors } = useTheme(), insets = useSafeAreaInsets();
  const router = useRouter(), invalidate = useInvalidateAll();
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<string>("All");
  const { data = [], isLoading, isFetching, refetch } = useAccounts();
  const records = useMemo(() => data.filter((a:any) => {
    const matched = [a.provider,a.email,a.notes,a.status].join(" ").toLowerCase().includes(query.toLowerCase().trim());
    return matched && (filter === "All" || (filter === "With plans" ? a.plans?.length > 0 : !a.plans?.length));
  }).sort((a:any,b:any) => String(a.provider).localeCompare(String(b.provider))), [data,filter,query]);
  const refresh = () => { refetch(); invalidate(); };
  return <View style={styles.page}>
    <AppHeader title="Accounts" subtitle={data.length + " registered services"} back
      right={<Pressable accessibilityLabel="Add account" accessibilityRole="button" onPress={()=>router.push("/add-account")}>
        <Icon name="plus-circle-outline" color={colors.brandPrimary} size={28}/>
      </Pressable>} />
    <View style={styles.search}>
      <Icon name="magnify" color={colors.muted} size={20}/>
      <TextInput style={styles.input} placeholder="Search providers, mail IDs or notes"
        placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} testID="accounts-search"/>
    </View>
    <ChipRow items={FILTERS as unknown as string[]} value={filter} onChange={setFilter} testIDPrefix="accounts-filter"/>
    {isLoading ? <Loading/> : <FlatList
      data={records} keyExtractor={(a:any)=>String(a.id)}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refresh} tintColor={colors.brandPrimary}/>}
      contentContainerStyle={{padding:16,gap:9,paddingBottom:insets.bottom+40}}
      ListEmptyComponent={<EmptyState icon="account-multiple-outline" title="No accounts found"
        message="Import your private SubMind records or add a service with its sign-in email."
        action={<PrimaryButton title="Add account" icon="plus" onPress={()=>router.push("/add-account")}/>}/>}
      renderItem={({item})=><Card onPress={()=>router.push({pathname:"/account/[id]",params:{id:item.id}})} style={styles.card} testID={"account-"+item.id}>
        <View style={styles.iconBox}><Icon name="account-circle-outline" color={colors.brandPrimary} size={30}/></View>
        <View style={{flex:1,gap:4}}>
          <Text style={styles.name} numberOfLines={1}>{item.provider||"Unknown provider"}</Text>
          <Text style={styles.meta} numberOfLines={1}>{item.email||"Mail ID not recorded"}</Text>
          <Text style={styles.meta}>{item.plans?.length||0} linked plan(s) · {item.status||"Status unknown"}</Text>
        </View>
        <Icon name="chevron-right" size={23} color={colors.muted}/>
      </Card>}/>
    }
  </View>;
}
const useStyles = makeStyles(c=>({
  page:{flex:1,backgroundColor:c.surface},
  search:{flexDirection:"row",alignItems:"center",gap:8,marginHorizontal:16,marginBottom:8,paddingHorizontal:12,backgroundColor:c.surfaceSecondary,minHeight:46},
  input:{flex:1,paddingVertical:11,color:c.onSurface,fontSize:14},
  card:{flexDirection:"row",alignItems:"center",gap:12},
  iconBox:{width:45,height:45,justifyContent:"center",alignItems:"center",backgroundColor:c.surfaceTertiary},
  name:{fontSize:17,color:c.onSurface,fontWeight:"700"},
  meta:{fontSize:12,color:c.muted},
}));
