import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { checkKey, models } from "@/src/lib/direct-providers";
import { METRO } from "@/src/components/metro-tiles";

const PROVIDERS=[
 {id:"gemini",name:"Google Gemini",subtitle:"Stable models only; excludes all 2.5 and preview"},
 {id:"groq",name:"Groq",subtitle:"Fast language models"},
 {id:"nvidia",name:"NVIDIA NIM",subtitle:"Free-tier prototyping · automatic Nemotron fallback"},
 {id:"brave",name:"Brave Search",subtitle:"Live plan and promo discovery"},
] as const;
const keyOf=(id:string)=>"submind.api-keys."+id;
export default function ApiKeys(){
 const styles=useStyles();const {colors}=useTheme();const insets=useSafeAreaInsets();
 const [configured,setConfigured]=useState<Record<string,boolean>>({});
 const [selected,setSelected]=useState<string>("gemini");
 const [value,setValue]=useState("");const [busy,setBusy]=useState(false);
 const [visible,setVisible]=useState(false);
 const [testMessage,setTestMessage]=useState("");
 const [modelList,setModelList]=useState<string[]>([]);
 useEffect(()=>{Promise.all(PROVIDERS.map(async p=>[p.id,Boolean(await storage.secureGet(keyOf(p.id),""))] as const))
  .then(entries=>setConfigured(Object.fromEntries(entries)))},[]);
 const test=async()=>{setBusy(true);setTestMessage("Testing provider...");try{const res=await checkKey(selected as any,value.trim()||undefined);setTestMessage(res);if(!value.trim() && selected!=="brave"){setModelList(await models(selected as "gemini"|"groq"|"nvidia"));}}catch(e:any){setTestMessage("Connection failed: "+e.message);}finally{setBusy(false)}};
 const save=async()=>{
  if(!value.trim())return;
  setBusy(true);
  try{
   if(!await storage.secureSet(keyOf(selected),value.trim()))throw Error("Secure storage write failed");
   setConfigured(v=>({...v,[selected]:true}));setValue("");setVisible(false);
   Alert.alert("API key saved","Saved on device. Tap Test connection to verify actual provider access.");
  }catch(e:any){Alert.alert("Unable to save",e?.message||"Storage error");}
  finally{setBusy(false)}
 };
 const remove=()=>Alert.alert("Remove API key?","This will remove the selected key from the device.",[
  {text:"Cancel",style:"cancel"},
  {text:"Remove",style:"destructive",onPress:async()=>{
   if(await storage.secureRemove(keyOf(selected))){setConfigured(v=>({...v,[selected]:false}));setValue("");}
   else Alert.alert("Unable to remove key","Try again.");
  }}
 ]);
 return <View style={styles.container}>
  <AppHeader title="API Key Manager" subtitle="Keys stored only on this Android device" back/>
  <ScrollView contentContainerStyle={{padding:18,paddingBottom:insets.bottom+50,gap:15}}>
   <Card style={{gap:9}}><View style={styles.row}><Icon name="shield-key-outline" size={27} color={colors.brandSecondary}/>
     <Text style={styles.title}>Bring your own API keys</Text></View>
     <Text style={styles.muted}>Keys are stored through Android's secure key storage. They are not added to GitHub, embedded in the APK or included in private data imports.</Text>
   </Card>
   {PROVIDERS.map(p=><Pressable key={p.id} onPress={()=>{setSelected(p.id);setValue("");setVisible(false)}}
     style={[styles.provider,selected===p.id&&{borderColor:colors.brandSecondary}]}>
     <View style={{flex:1}}><Text style={styles.name}>{p.name}</Text><Text style={styles.muted}>{p.subtitle}</Text></View>
     <Text style={[styles.status,{color:configured[p.id]?colors.success:colors.muted}]}>{configured[p.id]?"Saved":"Not set"}</Text>
     <Icon name={selected===p.id?"radiobox-marked":"radiobox-blank"} size={23} color={selected===p.id?colors.brandSecondary:colors.muted}/>
   </Pressable>)}
   <Card style={{gap:12}}>
    <Text style={styles.title}>{configured[selected]?"Replace":"Add"} {PROVIDERS.find(x=>x.id===selected)?.name} key</Text>
    <View style={styles.inputRow}>
     <TextInput style={styles.input} value={value} onChangeText={setValue}
       autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible}
       placeholder="Paste your private API key" placeholderTextColor={colors.muted}/>
     <Pressable onPress={()=>setVisible(!visible)} accessibilityLabel={visible?"Hide API key":"Show API key"}><Icon name={visible?"eye-off-outline":"eye-outline"} color={colors.muted} size={23}/></Pressable>
    </View>
    <PrimaryButton title="Test connection" icon="wifi-check" variant="secondary" loading={busy} disabled={!value.trim()&&!configured[selected]} onPress={test}/>
    {testMessage?<Text style={{color:testMessage.startsWith("Connection failed")?METRO.red:METRO.cyan,fontSize:13}}>{testMessage}</Text>:null}
    {modelList.length?<Text style={styles.muted}>Accessible models: {modelList.slice(0,8).join(" · ")}</Text>:null}
    <PrimaryButton title="Save to Android secure storage" icon="lock-check-outline" disabled={!value.trim()} loading={busy} onPress={save}/>
    {configured[selected]?<PrimaryButton title="Remove stored key" icon="key-remove" variant="secondary" onPress={remove}/>:null}
   </Card>
   <Text style={styles.muted}>Stored keys are used by Ask SubMind AI and Deals & Plans. A working key still needs provider quota, an enabled model, and internet. Never paste passwords or recovery phrases here.</Text>
  </ScrollView>
 </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},title:{color:c.onSurface,fontWeight:"800",fontSize:17},
 muted:{color:c.muted,fontSize:12,lineHeight:19},
 row:{flexDirection:"row",alignItems:"center",gap:10},
 provider:{flexDirection:"row",alignItems:"center",gap:12,padding:17,borderRadius:2,backgroundColor:c.surfaceSecondary,borderWidth:1,borderColor:c.border},
 name:{fontSize:15,color:c.onSurface,fontWeight:"800"},
 status:{fontSize:11,fontWeight:"800"},
 inputRow:{flexDirection:"row",alignItems:"center",gap:9,backgroundColor:c.surfaceTertiary,borderRadius:2,paddingHorizontal:12},
 input:{flex:1,paddingVertical:14,color:c.onSurface,fontSize:13},
}));