import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getVault } from "@/src/lib/local-vault";
import { METRO, MetroBrand } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";

export default function ExportData() {
 const router=useRouter();const insets=useSafeAreaInsets();
 const [busy,setBusy]=useState(false);const [status,setStatus]=useState("");
 const exportFile=async()=>{
  setBusy(true);setStatus("Creating a JSON backup locally on this phone…");
  try{
   const vault=await getVault();
   const name="SubMind-private-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
   const file=new File(Paths.cache,name);
   file.create();
   await file.write(JSON.stringify({...vault,exported_at:new Date().toISOString()},null,2));
   if(!await Sharing.isAvailableAsync())throw Error("The device cannot open a share or save chooser.");
   setStatus("Select a private location in the Android share sheet. Your backup is not uploaded automatically.");
   await Sharing.shareAsync(file.uri,{mimeType:"application/json",dialogTitle:"Save SubMind private JSON backup",UTI:"public.json"});
  }catch(e:any){Alert.alert("Could not export",e.message||String(e));setStatus("Backup was not completed. Your stored data is unchanged.");}
  finally{setBusy(false)}
 };
 return <View style={{flex:1,backgroundColor:METRO.black}}>
  <ScrollView contentContainerStyle={{paddingHorizontal:18,paddingTop:insets.top+12,paddingBottom:insets.bottom+45,gap:18}}>
   <Pressable onPress={()=>router.back()} style={{flexDirection:"row",alignItems:"center",gap:10}}>
     <Icon name="arrow-left" size={27} color={METRO.white}/><MetroBrand word="BACKUP"/>
   </Pressable>
   <View style={{padding:24,borderRadius:16,backgroundColor:"#20273B",borderWidth:1,borderColor:"#3A4E77",gap:15}}>
    <Icon name="database-export-outline" color={METRO.cyan} size={49}/>
    <Text style={{color:METRO.white,fontSize:24,fontWeight:"900"}}>EXPORT YOUR PRIVATE VAULT</Text>
    <Text style={{color:"#B4BFCE",fontSize:13,lineHeight:21}}>
      Your complete local SubMind JSON — accounts, subscriptions, prompts, links, Brain Map relationships, monitored sources, saved offers and review history — will be written to a file you choose to save or share.
    </Text>
    <Pressable disabled={busy} onPress={exportFile} style={{backgroundColor:METRO.cyan,padding:16,borderRadius:10,alignItems:"center",flexDirection:"row",gap:9,justifyContent:"center"}}>
      {busy?<ActivityIndicator color={METRO.ink}/>:<Icon name="file-export-outline" color={METRO.ink}/>}
      <Text style={{color:METRO.ink,fontWeight:"900"}}>{busy?"PREPARING…":"EXPORT PRIVATE JSON FILE"}</Text>
    </Pressable>
    {status?<Text style={{color:METRO.orange,fontSize:12,lineHeight:19}}>{status}</Text>:null}
   </View>
   <View style={{padding:19,backgroundColor:"#2A202A",borderRadius:13,gap:11}}>
    <Text style={{color:METRO.white,fontSize:17,fontWeight:"900"}}>SECURITY NOTES</Text>
    <Text style={{color:"#D4B9C6",fontSize:13,lineHeight:21}}>
      The exported JSON contains personal account emails, plan details and scanned email findings. It is not encrypted. Save it to a private folder or encrypted vault; do not share publicly or commit it to GitHub.
    </Text>
    <Text style={{color:"#D4B9C6",fontSize:13,lineHeight:21}}>
      Gemini, Groq, NVIDIA and Brave API keys are intentionally excluded. Those credentials stay in Android secure storage and must be re-entered on a new device.
    </Text>
   </View>
   <Pressable onPress={()=>router.push("/import-data")} style={{backgroundColor:"#252D3D",padding:16,borderRadius:11,flexDirection:"row",alignItems:"center",gap:12}}>
     <Icon name="file-import-outline" size={25} color={METRO.green}/>
     <Text style={{color:METRO.white,fontWeight:"900",flex:1}}>RESTORE FROM A JSON FILE</Text><Icon name="arrow-right" color={METRO.dim}/>
   </Pressable>
  </ScrollView>
 </View>;
}
