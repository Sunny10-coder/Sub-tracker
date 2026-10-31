import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLinks, usePrompts } from "@/src/lib/api";
import { METRO, MetroBrand, MetroTile } from "@/src/components/metro-tiles";
import { Icon } from "@/src/components/ui";

const SOURCES=["All","Instagram","Website","YouTube","Reddit","Chrome","share","Other"];
const PALETTE=[METRO.teal,METRO.cobalt,METRO.purple,METRO.orange,METRO.green,METRO.pink];
export default function LinkVault() {
 const router=useRouter();const insets=useSafeAreaInsets();
 const [source,setSource]=useState("All");
 const [query,setQuery]=useState("");
 const {data=[],isFetching,refetch}=useLinks();
 const {data:prompts=[]}=usePrompts();
 const linked=(prompts||[]).filter((p:any)=>(p.related_ids||[]).length>0).length;
 const list=useMemo(()=>data.filter((l:any)=>{
   const match=source==="All"||String(l.source||"").toLowerCase()===source.toLowerCase();
   const text=[l.title,l.url,l.note,l.summary,l.category,l.provider,(l.tags||[]).join(" ")].join(" ").toLowerCase();
   return match&&(!query.trim()||text.includes(query.toLowerCase()));
 }).sort((a:any,b:any)=>String(b.created_at||"").localeCompare(String(a.created_at||""))),[data,source,query]);
 const categories=useMemo(()=>Array.from(new Set(data.map((l:any)=>String(l.category||"Other")))),[data]);
 return <View style={{flex:1,backgroundColor:METRO.black}}>
   <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
     refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={METRO.teal}/>}
     contentContainerStyle={{paddingHorizontal:14,paddingTop:insets.top+11,paddingBottom:insets.bottom+70,gap:13}}>
     <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
       <Pressable onPress={()=>router.back()}><Icon name="arrow-left" color={METRO.white} size={26}/></Pressable>
       <View style={{flex:1}}><MetroBrand word="LINK VAULT"/><Text style={{color:METRO.dim,letterSpacing:1.3,fontSize:11}}>SHARE, ORGANISE, REDISCOVER</Text></View>
       <Pressable onPress={()=>router.push("/paste-link")} style={{backgroundColor:METRO.teal,padding:11,borderRadius:10}}>
         <Icon name="plus" color={METRO.white} size={27}/>
       </Pressable>
     </View>
     <View style={{flexDirection:"row",gap:8}}>
       <MetroTile title="SAVED LINKS" value={data.length} color={METRO.teal} height={146} style={{flex:1}} onPress={()=>setSource("All")}/>
       <MetroTile title="FOLDERS" value={categories.length} color={METRO.cobalt} height={146} style={{flex:1}} onPress={()=>router.push("/(tabs)/brain")}/>
       <MetroTile title="LINKED IDEAS" value={linked} color={METRO.purple} height={146} style={{flex:1}} onPress={()=>router.push("/(tabs)/prompts")}/>
     </View>
     <Pressable onPress={()=>router.push("/paste-link")} style={{backgroundColor:"#1F3040",borderColor:"#3B5970",borderWidth:1,padding:14,borderRadius:12,
       flexDirection:"row",alignItems:"center",gap:12}}>
       <Icon name="share-variant-outline" size={29} color={METRO.cyan}/>
       <View style={{flex:1}}>
         <Text style={{color:METRO.white,fontWeight:"900",fontSize:15}}>SHARE FROM CHROME, REDDIT OR YOUTUBE</Text>
         <Text style={{color:"#9FB7C8",fontSize:12,lineHeight:18,marginTop:3}}>Select SubMind in Android Share to save and classify links. Or paste manually.</Text>
       </View>
       <Icon name="arrow-right" color={METRO.cyan} size={20}/>
     </Pressable>
     <View style={{flexDirection:"row",alignItems:"center",gap:11,backgroundColor:"#1D2532",borderRadius:10,paddingHorizontal:12}}>
       <Icon name="magnify" color="#A0B4C4" size={23}/>
       <TextInput placeholder="Find any link, tag, source, idea…" placeholderTextColor="#8C9CAD" style={{color:METRO.white,fontSize:14,flex:1,paddingVertical:14}}
         autoCapitalize="none" value={query} onChangeText={setQuery}/>
     </View>
     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
       {SOURCES.map(s=><Pressable key={s} onPress={()=>setSource(s)}
         style={{backgroundColor:source===s?METRO.teal:"#272C39",paddingHorizontal:14,paddingVertical:11,borderRadius:8}}>
         <Text style={{color:METRO.white,fontWeight:"900",fontSize:11}}>{s.toUpperCase()}</Text>
       </Pressable>)}
     </ScrollView>
     <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
       <Text style={{color:METRO.white,fontSize:16,fontWeight:"900"}}>{list.length} SAVED LINKS</Text>
       <Pressable onPress={()=>router.push("/(tabs)/brain")} style={{flexDirection:"row",alignItems:"center",gap:5}}>
         <Icon name="graph" color={METRO.cyan} size={19}/>
         <Text style={{color:METRO.cyan,fontWeight:"900",fontSize:11}}>BRAIN MAP</Text>
       </Pressable>
     </View>
     {!list.length?<View style={{padding:29,borderRadius:13,backgroundColor:"#1F2330",borderWidth:1,borderColor:"#353A4C",alignItems:"center",gap:11}}>
       <Icon name="bookmark-multiple-outline" color={METRO.teal} size={46}/>
       <Text style={{color:METRO.white,fontWeight:"900",fontSize:19}}>NOTHING SAVED HERE YET</Text>
       <Text style={{color:METRO.dim,textAlign:"center",fontSize:13,lineHeight:19}}>Every saved URL can be classified, tagged, connected to a prompt, enhanced with Gemini and scheduled for a reminder.</Text>
       <Pressable onPress={()=>router.push("/paste-link")} style={{backgroundColor:METRO.teal,paddingHorizontal:22,paddingVertical:14,borderRadius:8}}>
         <Text style={{color:METRO.white,fontWeight:"900"}}>SAVE YOUR FIRST LINK</Text>
       </Pressable>
     </View>:
       <View style={{flexDirection:"row",flexWrap:"wrap",gap:9}}>
         {list.map((l:any,i:number)=>{
           const accent=PALETTE[i%PALETTE.length];
           return <Pressable key={l.id} onPress={()=>router.push(("/link/"+l.id) as any)}
             style={{width:"48.5%",minHeight:162,padding:13,borderRadius:14,backgroundColor:"#202331",
               borderWidth:1,borderColor:accent+"78",gap:9,justifyContent:"space-between",overflow:"hidden"}}>
             <View style={{height:5,backgroundColor:accent,borderRadius:4,marginHorizontal:-13,marginTop:-13}}/>
             <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
               <View style={{width:34,height:34,borderRadius:8,backgroundColor:accent+"31",alignItems:"center",justifyContent:"center"}}>
                 <Icon name="link-variant" color={accent} size={21}/>
               </View>
               <Icon name="arrow-top-right" color="#AAB5C9" size={19}/>
             </View>
             <Text style={{color:METRO.white,fontWeight:"900",fontSize:15,lineHeight:20}} numberOfLines={3}>{l.title||l.provider||l.url}</Text>
             <Text style={{color:METRO.dim,fontSize:11}} numberOfLines={1}>{l.provider||l.source||"Website"}</Text>
             <View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>
               {l.category?<Text style={{color:accent,fontWeight:"900",fontSize:10,backgroundColor:"#121927",padding:5,borderRadius:5}}>{l.category}</Text>:null}
               {(l.tags||[]).slice(0,1).map((t:string)=><Text key={t} style={{color:"#CDD5E1",fontSize:10,padding:5,backgroundColor:"#353848",borderRadius:5}}>#{t}</Text>)}
             </View>
           </Pressable>;
         })}
       </View>}
     <View style={{backgroundColor:"#202637",padding:14,borderRadius:12,gap:8}}>
       <Text style={{color:METRO.white,fontSize:14,fontWeight:"900"}}>HOW CLASSIFICATION WORKS</Text>
       <Text style={{color:METRO.dim,fontSize:12,lineHeight:19}}>Links are saved immediately with local URL and keyword classification. Open a link and choose Gemini enhancement to share only that URL and note with your selected AI provider for better suggested tags. No background webpage reading is implied.</Text>
     </View>
   </ScrollView>
 </View>;
}
