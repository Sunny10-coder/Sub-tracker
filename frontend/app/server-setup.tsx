import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, Card, PrimaryButton } from "@/src/components/ui";
import { BACKEND_URL_STORAGE_KEY, getBackendUrl } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme } from "@/src/theme";

export default function ServerSetup() {
 const styles=useStyles();const router=useRouter();const insets=useSafeAreaInsets();const {colors}=useTheme();
 const qc=useQueryClient();const [url,setUrl]=useState("");const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 useEffect(()=>{getBackendUrl().then(setUrl)},[]);
 async function verify(){
   const base=url.trim().replace(/\/+$/,"");
   if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(base) || base.includes("@")) {
      Alert.alert("Secure URL required", "Enter the HTTPS root address of your SubMind backend without /api.");return;
   }
   setBusy(true);setMessage("Testing secure connection...");
   try {
     const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
     let response:Response;try{response=await fetch(base+"/api/",{signal:controller.signal})}finally{clearTimeout(timeout)}
     if(!response.ok)throw Error("Server returned HTTP "+response.status);
     const json=await response.json();
     if(json.app!=="SubMind"||json.status!=="ok") throw Error("This URL does not appear to be a SubMind backend.");
     if(!await storage.setItem(BACKEND_URL_STORAGE_KEY,base)) throw Error("Could not save server URL on this device.");
     qc.clear();setMessage("Connected successfully.");
     Alert.alert("Connected", "SubMind API responded. Before storing private data, ensure your server has authentication enabled.");
     router.replace("/(tabs)");
   }catch(e:any){setMessage("Connection failed: "+(e?.message||String(e)));}finally{setBusy(false)}
 }
 return <View style={styles.container}>
   <AppHeader title="Server Setup" subtitle="Connect your installed SubMind APK" back/>
   <ScrollView contentContainerStyle={{padding:20,paddingBottom:insets.bottom+40,gap:15}}>
    <Card style={{gap:12}}>
      <Text style={styles.head}>Your backend URL</Text>
      <Text style={styles.muted}>The APK contains the interface. Your subscriptions, links, AI searches and reminders use the running SubMind backend. Set its HTTPS address here and test connectivity.</Text>
      <TextInput value={url} onChangeText={setUrl} style={styles.input}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-submind-backend.example" placeholderTextColor={colors.muted}/>
      <PrimaryButton title={busy?"Testing...":"Test & Save"} icon="cloud-check-outline" disabled={busy} onPress={verify}/>
      {busy?<ActivityIndicator color={colors.brandPrimary}/>:null}
      {message?<Text style={styles.muted}>{message}</Text>:null}
    </Card>
    <Card style={{gap:8}}>
      <Text style={styles.head}>Security notice</Text>
      <Text style={styles.muted}>The current GitHub backend uses a shared local account with no server-side login. Do not put real personal data, account emails, or promo codes into an internet-accessible server until authentication and user isolation are implemented.</Text>
    </Card>
   </ScrollView>
 </View>;
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},
 head:{color:c.onSurface,fontSize:18,fontWeight:"800"},
 muted:{color:c.onSurfaceTertiary,fontSize:13,lineHeight:20},
 input:{color:c.onSurface,backgroundColor:c.surfaceTertiary,borderRadius:16,padding:15,fontSize:15},
}));