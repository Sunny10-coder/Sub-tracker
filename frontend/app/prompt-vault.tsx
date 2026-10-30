import { useState, useEffect } from "react";
import { Alert, FlatList, Text, TextInput, View, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme } from "@/src/theme";

type Prompt = { id: string; title: string; text: string; saved: string };
const KEY = "submind.saved-prompts.v1";
export default function PromptVault() {
 const s=useStyles();const {colors}=useTheme();const insets=useSafeAreaInsets();
 const [items,setItems]=useState<Prompt[]>([]);const [title,setTitle]=useState("");const [body,setBody]=useState("");
 useEffect(()=>{storage.getItem(KEY,"").then(raw=>{if(typeof raw==="string"&&raw){try{const a=JSON.parse(raw);if(Array.isArray(a))setItems(a)}catch{}}})},[]);
 const save=async()=>{if(!title.trim()||!body.trim())return;
 const rows=[{id:Date.now().toString(36),title:title.trim(),text:body.trim(),saved:new Date().toISOString()},...items];
 if(!await storage.setItem(KEY,JSON.stringify(rows))){Alert.alert("Save failed","Could not store the prompt locally.");return;}
 setItems(rows);setTitle("");setBody("");
 };
 const remove=(id:string)=>Alert.alert("Delete prompt?","This cannot be undone.",[{text:"Cancel",style:"cancel"},
 {text:"Delete",style:"destructive",onPress:async()=>{const rows=items.filter(p=>p.id!==id);if(await storage.setItem(KEY,JSON.stringify(rows)))setItems(rows)}}]);
 return <View style={s.container}><AppHeader title="AI Prompt Vault" subtitle="Private prompts stored on this phone" back/>
 <FlatList data={items} keyExtractor={p=>p.id} keyboardShouldPersistTaps="handled"
 ListHeaderComponent={<Card style={{gap:11,marginBottom:15}}>
   <Text style={s.head}>Save a reusable prompt</Text>
   <TextInput value={title} onChangeText={setTitle} placeholder="Prompt name" placeholderTextColor={colors.muted} style={s.input}/>
   <TextInput value={body} onChangeText={setBody} placeholder="Paste your prompt text" placeholderTextColor={colors.muted}
      style={[s.input,{minHeight:95,textAlignVertical:"top"}]} multiline/>
   <PrimaryButton title="Save prompt locally" icon="content-save-outline" disabled={!title.trim()||!body.trim()} onPress={save}/>
   <Text style={s.dim}>Prompts do not sync to GitHub or the backend. Do not store API keys, passwords, or other secrets in prompt text.</Text>
 </Card>}
 contentContainerStyle={{padding:19,paddingBottom:insets.bottom+50,gap:12}}
 ListEmptyComponent={<Card><Text style={s.dim}>No saved prompts yet. Add your first reusable instruction above.</Text></Card>}
 renderItem={({item})=><Card style={{gap:9}}>
   <Text style={s.head}>{item.title}</Text><Text style={s.body} numberOfLines={5}>{item.text}</Text>
   <View style={s.row}>
     <Pressable onPress={()=>Clipboard.setStringAsync(item.text)} style={s.action}><Icon name="content-copy" color={colors.brandSecondary}/><Text style={s.actionText}>Copy</Text></Pressable>
     <Pressable onPress={()=>remove(item.id)} style={s.action}><Icon name="delete-outline" color={colors.error}/><Text style={s.actionText}>Delete</Text></Pressable>
   </View></Card>}/>
 </View>
}
const useStyles=makeStyles(c=>({
 container:{flex:1,backgroundColor:c.surface},head:{fontSize:17,fontWeight:"800",color:c.onSurface},
 input:{backgroundColor:c.surfaceTertiary,padding:13,borderRadius:12,color:c.onSurface,fontSize:14},
 dim:{fontSize:12,color:c.muted,lineHeight:18},body:{color:c.onSurfaceTertiary,fontSize:13,lineHeight:19},
 row:{flexDirection:"row",gap:16},action:{flexDirection:"row",gap:6,alignItems:"center"},
 actionText:{color:c.onSurfaceSecondary,fontWeight:"700",fontSize:12},
}));