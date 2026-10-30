import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { useInvalidateAll } from "@/src/lib/api";
import { getVault, importPrivateBundle } from "@/src/lib/local-vault";
import { makeStyles, useTheme } from "@/src/theme";

export default function ImportData() {
 const styles=useStyles();const {colors}=useTheme();const insets=useSafeAreaInsets();const router=useRouter();
 const invalidate=useInvalidateAll();const [busy,setBusy]=useState(false);
 const [summary,setSummary]=useState<any>(null);
 const [imported,setImported]=useState<any>(null);
 async function select(){
  setBusy(true);setImported(null);
  try{
   const picked=await DocumentPicker.getDocumentAsync({type:["application/json","text/plain","*/*"],copyToCacheDirectory:true,multiple:false});
   if(picked.canceled)return;
   const asset=picked.assets?.[0];if(!asset)throw Error("No file selected");
   if(asset.size && asset.size>4_000_000)throw Error("Import file exceeds 4 MB");
   if(!asset.name.toLowerCase().endsWith(".json"))throw Error("Select the SubMind private .json file");
   const content=await new File(asset.uri).text();
   if(content.length>4_000_000)throw Error("Import is too large");
   const bundle=JSON.parse(content);
   if(bundle.schema!=="submind-import-v1"||!Array.isArray(bundle.subscriptions)||!Array.isArray(bundle.accounts))
     throw Error("Not a valid SubMind private import file");
   const result=await importPrivateBundle(bundle);
   invalidate();
   const vault=await getVault();
   setSummary({subscriptions:vault.subscriptions.length,accounts:vault.accounts.length,
     watchlist:vault.watchlist.length,promos:vault.promo_codes.length,
     review:vault.review_queue.length, benefits:vault.benefits.length,
     date:vault.imported_at});
   setImported(result);
  }catch(err:any){Alert.alert("Import failed",err?.message||"Could not read the selected file");}
  finally{setBusy(false);}
 }
 return <View style={styles.container}>
  <AppHeader title="Private Data Import" subtitle="Preload your subscriptions and accounts safely" back/>
  <ScrollView contentContainerStyle={{padding:18,paddingBottom:insets.bottom+44,gap:15}}>
   <Card style={styles.hero}>
    <View style={styles.icon}><Icon name="shield-lock-outline" size={27} color={colors.brandSecondary}/></View>
    <Text style={styles.heading}>Your data stays on this phone</Text>
    <Text style={styles.copy}>Import the JSON file prepared from your Excel workbook. Records are loaded into SubMind's local device store. No workbook contents are uploaded to GitHub or a remote server by this import.</Text>
    <PrimaryButton title="Choose private JSON file" icon="file-import-outline" onPress={select} disabled={busy}/>
    {busy?<ActivityIndicator color={colors.brandSecondary}/>:null}
   </Card>
   <Card style={{gap:10}}>
    <Text style={styles.heading}>What gets imported</Text>
    {["Subscription history and ongoing plans","Accounts and verified sign-in emails","Plan watchlist and offer codes","Review flags for uncertain or conflicting entries"].map(x=>
     <View key={x} style={styles.row}><Icon name="check-circle-outline" color={colors.brandSecondary} size={18}/><Text style={styles.copy}>{x}</Text></View>)}
    <Text style={styles.subtle}>Unverified prices stay unknown. Mailbox addresses are not assumed to be login identities. Re-importing the same file merges records by stable ID rather than duplicating them.</Text>
   </Card>
   {summary?<Card style={{gap:9}}>
    <Text style={styles.heading}>Local records loaded</Text>
    {[
     ["Subscriptions & history",summary.subscriptions],["Accounts",summary.accounts],
     ["Free benefits",summary.benefits],["Watchlist",summary.watchlist],
     ["Promo codes",summary.promos],["Items to review",summary.review]
    ].map(([name,count])=><View key={name} style={styles.statLine}>
      <Text style={styles.copy}>{name}</Text><Text style={styles.stat}>{count}</Text></View>)}
    <Text style={styles.subtle}>Imported {summary.date ? new Date(summary.date).toLocaleString() : ""}</Text>
    <PrimaryButton title="Open Home dashboard" icon="home-variant" onPress={()=>router.replace("/(tabs)")}/>
   </Card>:null}
   <Card style={{gap:7}}>
    <Text style={styles.heading}>Privacy & backup</Text>
    <Text style={styles.copy}>The imported records are saved in Android app-private storage, but this is not an encrypted, portable backup. Keep the original private JSON file somewhere safe and do not upload it to a public GitHub repository.</Text>
    <Text style={styles.subtle}>Uninstalling the app can erase local data. The existing Excel file remains your separate source copy.</Text>
   </Card>
  </ScrollView>
 </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 hero:{gap:13,padding:21},icon:{width:53,height:53,borderRadius:16,backgroundColor:c.brandSecondary+"1B",alignItems:"center",justifyContent:"center"},
 heading:{color:c.onSurface,fontWeight:"800",fontSize:18},
 copy:{color:c.onSurfaceTertiary,fontSize:13,lineHeight:20,flex:1},
 subtle:{color:c.muted,fontSize:12,lineHeight:19},
 row:{flexDirection:"row",gap:9,alignItems:"flex-start"},
 statLine:{flexDirection:"row",justifyContent:"space-between",gap:12,paddingVertical:4},
 stat:{color:c.brandSecondary,fontSize:16,fontWeight:"800"},
}));