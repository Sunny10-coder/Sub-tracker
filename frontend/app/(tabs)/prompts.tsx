import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { METRO, MetroBrand, MetroTile } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";
import { api, useInvalidateAll, useLinks, usePrompts } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

const LEGACY_KEY = "submind.saved-prompts.v1";
const MIGRATED = "submind.prompts.migrated.v1";
const CATEGORY = ["All", "AI", "Development", "Design", "Learning", "Other"];
export default function Prompts() {
  const router=useRouter();const insets=useSafeAreaInsets();
  const {data:prompts=[],refetch}=usePrompts();
  const {data:links=[]}=useLinks();
  const invalidate=useInvalidateAll();
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("All");
  const [composer,setComposer]=useState(false);
  const [editing,setEditing]=useState("");
  const [title,setTitle]=useState("");const [body,setBody]=useState("");
  const [related,setRelated]=useState<string[]>([]);
  const [expanded,setExpanded]=useState("");
  const [saving,setSaving]=useState(false);
  const [migration,setMigration]=useState("");
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      if(await storage.getItem(MIGRATED,false))return;
      const raw=await storage.getItem(LEGACY_KEY,"");
      if(typeof raw==="string"&&raw){
        const old=JSON.parse(raw);
        if(Array.isArray(old)){
          const present=await api.prompts();
          let count=0;
          for(const entry of old.slice(0,250)){
            if(!entry?.title||!entry?.text)continue;
            if(present.some((p:any)=>p.title===entry.title&&p.text===entry.text))continue;
            await api.createPrompt({title:entry.title,text:entry.text,created_at:entry.saved||new Date().toISOString(),source:"legacy"});
            count++;
          }
          if(count){invalidate();if(mounted)setMigration(count+" previous prompts migrated successfully.");}
        }
      }
      await storage.setItem(MIGRATED,true);
    })().catch(()=>{if(mounted)setMigration("Previous prompts could not be migrated. Your original data remains untouched.")});
    return ()=>{mounted=false};
  },[]);
  const rows=useMemo(()=>prompts.filter((p:any)=>{
    const text=[p.title,p.text,p.category,(p.tags||[]).join(" ")].join(" ").toLowerCase();
    return (!query||text.includes(query.toLowerCase())) && (category==="All"||String(p.category||"Other")===category);
  }),[prompts,query,category]);
  const reset=()=>{setEditing("");setTitle("");setBody("");setRelated([]);setComposer(false)};
  const startEdit=(p:any)=>{setEditing(p.id);setTitle(p.title);setBody(p.text);setRelated(p.related_ids||[]);setComposer(true)};
  const save=async()=>{
    if(!title.trim()||!body.trim())return;
    setSaving(true);
    try{
      const payload={title:title.trim(),text:body.trim(),related_ids:related};
      if(editing)await api.updatePrompt(editing,payload);
      else await api.createPrompt(payload);
      invalidate();refetch();reset();
    }catch(e:any){Alert.alert("Unable to save prompt",e.message||String(e))}
    finally{setSaving(false)}
  };
  const remove=(p:any)=>Alert.alert("Delete this prompt?","The original text will be deleted from this device.",[
    {text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:async()=>{try{await api.deletePrompt(p.id);invalidate();}catch(e:any){Alert.alert("Could not delete",e.message)}}}
  ]);
  const toggleRelated=(id:string)=>setRelated(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id].slice(0,10));
  const text: any={color:METRO.white};
  const border: any={backgroundColor:"#191923",borderRadius:14,borderWidth:1,borderColor:"#353546"};
  return <View style={{flex:1,backgroundColor:METRO.black}}>
    <ScrollView contentContainerStyle={{paddingTop:insets.top+10,paddingHorizontal:15,paddingBottom:insets.bottom+113,gap:12}} keyboardShouldPersistTaps="handled">
      <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
        <View><MetroBrand word="PROMPTS"/><Text style={{color:METRO.dim,fontSize:12,letterSpacing:1}}>YOUR REUSABLE AI LIBRARY</Text></View>
        <Pressable onPress={()=>{reset();setComposer(true)}} style={{backgroundColor:METRO.teal,borderRadius:12,width:51,height:51,alignItems:"center",justifyContent:"center"}}>
          <Icon name="plus" color={METRO.white} size={30}/>
        </Pressable>
      </View>
      <View style={{flexDirection:"row",gap:9}}>
        <View style={{flex:1}}><MetroTile title="SAVED PROMPTS" color={METRO.purple} value={prompts.length}
          height={148} onPress={()=>setCategory("All")}/></View>
        <View style={{flex:1}}><MetroTile title="BRAIN LINKS" color={METRO.cobalt} value={prompts.reduce((a:number,p:any)=>a+(p.related_ids?.length||0),0)}
          height={148} onPress={()=>router.push("/(tabs)/brain")}/></View>
      </View>
      {migration?<Text style={{color:METRO.orange,fontSize:12}}>{migration}</Text>:null}
      <Pressable onPress={()=>setComposer(!composer)} style={{backgroundColor:"#1D2631",padding:14,borderRadius:10,flexDirection:"row",alignItems:"center",gap:10}}>
        <Icon name={composer?"close":"pencil-plus-outline"} size={23} color={METRO.cyan}/>
        <Text style={{color:METRO.white,fontWeight:"800",fontSize:14}}>{composer?"CLOSE EDITOR":editing?"EDIT PROMPT":"WRITE OR PASTE A PROMPT"}</Text>
        <View style={{flex:1}}/><Icon name={composer?"chevron-up":"chevron-down"} color={METRO.dim}/>
      </Pressable>
      {composer?<View style={{...border,padding:15,gap:11,borderColor:METRO.purple+"88"}}>
        <Text style={{...text,fontSize:20,fontWeight:"900"}}>{editing?"EDIT PROMPT":"NEW PROMPT"}</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Prompt title" placeholderTextColor="#7C8090" style={{backgroundColor:"#282A35",padding:15,borderRadius:10,color:METRO.white,fontSize:15}}/>
        <TextInput value={body} onChangeText={setBody} multiline textAlignVertical="top" placeholder="Paste or write your reusable AI instructions…" placeholderTextColor="#7C8090"
          style={{backgroundColor:"#282A35",padding:15,borderRadius:10,color:METRO.white,minHeight:160,lineHeight:22,fontSize:14}}/>
        <Text style={{...text,fontWeight:"900",fontSize:13}}>LINK TO YOUR RESEARCH</Text>
        <Text style={{color:METRO.dim,fontSize:11}}>Select related saved links. Shared tags and manual connections will appear in Brain Map.</Text>
        {links.slice(0,8).map((l:any)=><Pressable key={l.id} onPress={()=>toggleRelated(l.id)}
          style={{flexDirection:"row",alignItems:"center",paddingVertical:6,gap:9}}>
          <Icon name={related.includes(l.id)?"checkbox-marked":"checkbox-blank-outline"} color={related.includes(l.id)?METRO.green:METRO.dim}/>
          <Text numberOfLines={1} style={{color:METRO.white,flex:1,fontSize:12}}>{l.title||l.url}</Text>
        </Pressable>)}
        <Pressable disabled={saving||!title.trim()||!body.trim()} onPress={save} style={{backgroundColor:METRO.green,padding:15,alignItems:"center",borderRadius:10,opacity:saving?0.6:1}}>
          <Text style={{color:METRO.white,fontWeight:"900"}}>{saving?"SAVING…":editing?"UPDATE PROMPT":"SAVE PROMPT"}</Text>
        </Pressable>
      </View>:null}
      <View style={{flexDirection:"row",alignItems:"center",backgroundColor:"#1F202B",borderRadius:9,paddingHorizontal:13}}>
        <Icon name="magnify" size={22} color={METRO.dim}/>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search prompts, tags, ideas…" placeholderTextColor="#858B9E"
          style={{flex:1,color:METRO.white,padding:13,fontSize:14}}/>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
        {CATEGORY.map(c=><Pressable key={c} onPress={()=>setCategory(c)} style={{paddingHorizontal:13,paddingVertical:10,borderRadius:8,backgroundColor:category===c?METRO.teal:"#272934"}}>
          <Text style={{color:METRO.white,fontWeight:"800",fontSize:12}}>{c}</Text>
        </Pressable>)}
      </ScrollView>
      {rows.length===0?<View style={{...border,padding:25,alignItems:"center",gap:10}}>
        <Icon name="text-box-search-outline" size={40} color={METRO.purple}/>
        <Text style={{...text,fontWeight:"800"}}>No matching prompts</Text>
        <Text style={{color:METRO.dim,textAlign:"center"}}>Save a prompt above. Its themes and tags will link into your Brain Map.</Text>
      </View>:rows.map((p:any)=>{
        const isExpanded=expanded===p.id;
        return <View key={p.id} style={{...border,overflow:"hidden"}}>
          <View style={{height:4,backgroundColor:METRO.purple}}/>
          <Pressable onPress={()=>setExpanded(isExpanded?"":p.id)} style={{padding:15,gap:10}}>
            <View style={{flexDirection:"row",gap:10,alignItems:"center"}}>
              <Icon name="auto-fix" size={24} color={METRO.purple}/>
              <Text style={{...text,fontWeight:"900",fontSize:17,flex:1}}>{p.title}</Text>
              <Icon name={isExpanded?"chevron-up":"chevron-down"} color={METRO.dim}/>
            </View>
            <Text numberOfLines={isExpanded?undefined:3} style={{color:"#C1C5D1",fontSize:13,lineHeight:21}}>{p.text}</Text>
            <View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>
              {(p.tags||[]).slice(0,5).map((tag:string,i:number)=><Text key={tag+i} style={{color:METRO.cyan,backgroundColor:"#123446",paddingHorizontal:9,paddingVertical:5,fontSize:11,borderRadius:5}}>#{tag}</Text>)}
              {p.related_ids?.length?<Text style={{color:METRO.orange,fontSize:11,padding:5}}>{p.related_ids.length} linked</Text>:null}
            </View>
          </Pressable>
          <View style={{flexDirection:"row",borderTopWidth:1,borderColor:"#343542"}}>
            {[{label:"COPY",icon:"content-copy",action:()=>Clipboard.setStringAsync(p.text),color:METRO.cyan},
              {label:"EDIT",icon:"pencil-outline",action:()=>startEdit(p),color:METRO.green},
              {label:"DELETE",icon:"trash-can-outline",action:()=>remove(p),color:METRO.red}]
              .map(x=><Pressable key={x.label} onPress={x.action} style={{flex:1,padding:13,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5}}>
                <Icon name={x.icon} color={x.color} size={17}/>
                <Text style={{color:x.color,fontWeight:"900",fontSize:11}}>{x.label}</Text>
              </Pressable>)}
          </View>
        </View>;
      })}
      <Text style={{fontSize:11,color:METRO.dim,textAlign:"center",lineHeight:17}}>Prompts are kept in your private on-phone vault. Do not paste secrets or API keys into prompt text.</Text>
    </ScrollView>
  </View>;
}
