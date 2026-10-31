import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { storage } from "@/src/utils/storage";
import { models as providerModels, geminiSafeDefault, AUTO_NVIDIA_MODEL, isPaidGeminiModel } from "@/src/lib/direct-providers";
import { useTheme } from "@/src/theme";

export type AIProvider = "auto"|"gemini"|"groq"|"nvidia";
const OPTIONS:AIProvider[]=["auto","gemini","groq","nvidia"];
const SELECTED_PROVIDER="submind.ai.selected-provider";
export function useAISelection(){
 const [provider,setProvider]=useState<AIProvider>("auto");
 const [model,setModel]=useState("");
 const [available,setAvailable]=useState<string[]>([]);
 const [error,setError]=useState("");
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{
  let active=true;
  void storage.getItem(SELECTED_PROVIDER,"auto").then(raw=>{
   if(!active)return;
   if(OPTIONS.includes(raw as AIProvider))setProvider(raw as AIProvider);
   setLoaded(true);
  });
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!loaded||provider==="auto"){setAvailable([]);setModel("");setError("");return;}
  let active=true;
  setAvailable([]);setModel("");setError("");
  void (async()=>{
   try{
    const found=await providerModels(provider);
    const all=provider==="nvidia"?[AUTO_NVIDIA_MODEL,...found]:found;
    const saved=String(await storage.getItem("submind.ai.selected-model."+provider,"")||"");
    const fallback=provider==="gemini"?geminiSafeDefault(found):
      provider==="nvidia"?AUTO_NVIDIA_MODEL:found[0]||"";
    const chosen=saved&&all.includes(saved)?saved:fallback;
    if(active){setAvailable(all);setModel(chosen);
      if(!chosen)setError("No accessible model. Open API Key Manager and test this provider.");}
   }catch(e:any){if(active)setError(e?.message||"Unable to load models");}
  })();
  return()=>{active=false;};
 },[provider,loaded]);
 const changeProvider=(next:AIProvider)=>{setProvider(next);void storage.setItem(SELECTED_PROVIDER,next);};
 const changeModel=(next:string)=>{setModel(next);void storage.setItem("submind.ai.selected-model."+provider,next);};
 return {provider,model,available,error,changeProvider,changeModel,
   paid:provider==="gemini"&&!!model&&isPaidGeminiModel(model)};
}

export function AIProviderSwitcher({selection}:{selection:ReturnType<typeof useAISelection>}){
 const {colors}=useTheme();
 return <View style={{gap:7,paddingBottom:8}}>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0}}
    contentContainerStyle={{paddingHorizontal:12,gap:6}}>
   {OPTIONS.map(p=><Pressable key={p} onPress={()=>selection.changeProvider(p)}
     accessibilityRole="button" accessibilityState={{selected:selection.provider===p}}
     style={{backgroundColor:selection.provider===p?colors.brandPrimary:colors.surfaceSecondary,
       paddingVertical:10,paddingHorizontal:14,minHeight:39,justifyContent:"center"}}>
    <Text style={{color:selection.provider===p?colors.onBrandPrimary:colors.onSurfaceSecondary,
      fontSize:12,fontWeight:"700"}}>{p==="auto"?"Auto / Claude":p.toUpperCase()}</Text>
   </Pressable>)}
  </ScrollView>
  {selection.provider!=="auto"?<>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0}}
     contentContainerStyle={{paddingHorizontal:12,gap:6}}>
    {selection.available.map(m=><Pressable key={m}
      onPress={()=>selection.changeModel(m)} accessibilityRole="button"
      accessibilityState={{selected:selection.model===m}}
      style={{backgroundColor:selection.model===m?colors.surfaceTertiary:colors.surfaceSecondary,
        borderWidth:1,borderColor:selection.model===m?colors.brandPrimary:colors.border,
        paddingVertical:9,paddingHorizontal:11,maxWidth:230}}>
     <Text style={{fontSize:11,fontWeight:"600",color:colors.onSurface}}>
      {m===AUTO_NVIDIA_MODEL?"Auto · working NVIDIA model":m}
      {selection.provider==="gemini"&&isPaidGeminiModel(m)?" · PAID":""}
     </Text>
    </Pressable>)}
   </ScrollView>
   {selection.error?<Text style={{color:colors.error,fontSize:11,paddingHorizontal:13}}>{selection.error}</Text>:null}
   {selection.paid?<Text style={{color:colors.warning,fontSize:11,paddingHorizontal:13}}>
    Paid model selected. Confirm before every message.
   </Text>:null}
  </>:null}
 </View>;
}
