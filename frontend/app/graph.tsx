import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getVault } from "@/src/lib/local-vault";
import { clusterVault, type Cluster, type Tool } from "@/src/lib/brain-clusters";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand } from "@/src/components/metro-tiles";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

export default function BrainMap() {
 const router=useRouter(),insets=useSafeAreaInsets();
 const [groups,setGroups]=useState<Cluster[]>([]);
 const [expanded,setExpanded]=useState<string[]>([]);
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState<Tool|null>(null);
 const [error,setError]=useState("");
 useFocusEffect(useCallback(()=>{
   let live=true;
   getVault().then(v=>{if(live){setGroups(clusterVault(v));setError("");}})
     .catch(e=>{if(live)setError(String(e?.message||e))});
   return()=>{live=false};
 },[]));
 const visible=useMemo(()=>groups.filter(g=>!query.trim()||
   [g.title,g.description,...g.tools.map(t=>t.name+" "+t.description)].join(" ").toLowerCase().includes(query.toLowerCase())),[groups,query]);
 const total=groups.reduce((n,g)=>n+g.tools.length,0);
 const toggle=(id:string)=>setExpanded(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);
 const open=(tool:Tool)=>{
   setSelected(tool);
   if(tool.kind.includes("prompt")||tool.kind.includes("idea"))router.push("/(tabs)/prompts");
   else if(tool.kind.includes("link")&&!tool.kind.includes(","))router.push("/link-vault");
   else if(tool.kind.includes("subscription")&&!tool.kind.includes(","))router.push("/(tabs)/subscriptions");
   else if(tool.kind.includes("promo")||tool.kind.includes("offer"))router.push("/promo-vault");
   else router.push("/(tabs)/account-hub");
 };
 const matches=(g:Cluster)=>g.tools.filter(t=>!query.trim()||
    [t.name,t.kind,t.description].join(" ").toLowerCase().includes(query.toLowerCase())||
    (g.title+" "+g.description).toLowerCase().includes(query.toLowerCase()));
 return <View style={{flex:1,backgroundColor:METRO.black}}>
 <ScrollView contentContainerStyle={{paddingTop:insets.top+12,paddingHorizontal:15,paddingBottom:insets.bottom+125,gap:14}}>
  <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
    <View><MetroBrand word="BRAIN MAP"/><Text style={{color:METRO.dim,fontSize:12,letterSpacing:1}}>SIMILAR TOOLS · ONE CLUSTER</Text></View>
    <Icon name="brain" size={39} color={METRO.cyan}/>
  </View>
  <View style={{backgroundColor:"#1A2237",padding:18,borderRadius:15,borderWidth:1,borderColor:"#344A70",gap:7}}>
    <Text style={{color:METRO.white,fontSize:23,fontWeight:"900"}}>YOUR TOOL UNIVERSE</Text>
    <Text style={{color:"#A5BDD6",fontSize:13,lineHeight:19}}>Similar AI tools, subscriptions, websites and saved research are grouped together. Select a cluster to explore its services.</Text>
    <View style={{flexDirection:"row",gap:23,marginTop:6}}>
      <Text style={{color:METRO.cyan,fontSize:17,fontWeight:"900"}}>{groups.length} CLUSTERS</Text>
      <Text style={{color:"#DFB9FF",fontSize:17,fontWeight:"900"}}>{total} TOOLS & IDEAS</Text>
    </View>
  </View>
  <View style={{flexDirection:"row",alignItems:"center",gap:9,backgroundColor:"#252939",borderRadius:11,paddingHorizontal:13}}>
    <Icon name="magnify" size={22} color={METRO.dim}/>
    <TextInput value={query} onChangeText={setQuery} placeholder="Find a tool or cluster…" placeholderTextColor="#A4A9B9" style={{color:METRO.white,flex:1,paddingVertical:15}}/>
  </View>
  {error?<Text style={{color:METRO.red}}>{error}</Text>:null}
  {!groups.length?<View style={{backgroundColor:"#222638",padding:25,borderRadius:14,gap:11,alignItems:"center"}}>
    <Icon name="folder-network-outline" size={42} color={METRO.cyan}/>
    <Text style={{color:METRO.white,fontWeight:"900",fontSize:18}}>YOUR CLUSTERS START HERE</Text>
    <Text style={{color:METRO.dim,textAlign:"center",fontSize:13}}>Add tool accounts, subscriptions, links or prompts. Similar services automatically group into one cluster.</Text>
    <Pressable onPress={()=>router.push("/(tabs)/account-hub")} style={{backgroundColor:METRO.cyan,padding:12,borderRadius:7}}>
      <Text style={{color:METRO.ink,fontWeight:"900"}}>ADD YOUR FIRST TOOL</Text>
    </Pressable>
  </View>:null}
  {visible.map(g=>{
    const items=matches(g),shown=expanded.includes(g.id)||!!query;
    return <View key={g.id} style={{borderRadius:15,backgroundColor:"#1B1E2B",borderWidth:1,borderColor:g.color+"70",overflow:"hidden"}}>
      <Pressable onPress={()=>toggle(g.id)} style={{padding:17,flexDirection:"row",alignItems:"center",gap:13}}>
        <View style={{width:50,height:50,borderRadius:13,backgroundColor:g.color+"30",borderWidth:1,borderColor:g.color+"88",alignItems:"center",justifyContent:"center"}}>
          <Icon name={g.icon} size={28} color={g.color}/>
        </View>
        <View style={{flex:1,gap:5}}>
          <Text style={{color:METRO.white,fontSize:18,fontWeight:"900"}}>{g.title}</Text>
          <Text style={{color:"#AAB3C4",fontSize:12}}>{g.description}</Text>
          <Text style={{color:g.color,fontSize:12,fontWeight:"900"}}>{items.length} related tools</Text>
        </View>
        <Icon name={shown?"chevron-up":"chevron-down"} size={24} color={g.color}/>
      </Pressable>
      {!shown?<View style={{flexDirection:"row",flexWrap:"wrap",gap:6,paddingHorizontal:16,paddingBottom:16}}>
        {items.slice(0,5).map(t=><View key={t.id} style={{backgroundColor:"#303448",borderRadius:8,paddingHorizontal:9,paddingVertical:7}}>
          <Text style={{color:METRO.white,fontSize:11,fontWeight:"700"}}>{t.name}</Text>
        </View>)}
        {items.length>5?<Text style={{color:g.color,padding:7,fontSize:11}}>+{items.length-5} more</Text>:null}
      </View>:<View style={{borderTopWidth:1,borderColor:"#38394A",padding:12,gap:8}}>
        {items.map(t=><Pressable key={t.id} onPress={()=>open(t)} style={{backgroundColor:"#262B3B",borderRadius:10,padding:13,flexDirection:"row",alignItems:"center",gap:12}}>
          <View style={{height:11,width:11,borderRadius:6,backgroundColor:g.color}}/>
          <View style={{flex:1,gap:4}}>
            <Text style={{color:METRO.white,fontWeight:"900",fontSize:15}}>{t.name}</Text>
            <Text style={{color:"#AAB3C4",fontSize:11}}>{t.kind.replace(/,/g," · ")}</Text>
          </View>
          <Icon name="arrow-top-right" color={g.color} size={20}/>
        </Pressable>)}
      </View>}
    </View>;
  })}
  {selected?<Text style={{color:METRO.dim,fontSize:11}}>Selected: {selected.name}</Text>:null}
  <Text style={{color:METRO.dim,fontSize:11,textAlign:"center",lineHeight:18}}>Clusters are generated from your saved records and service names. Tools that match multiple categories are placed in their strongest matching cluster.</Text>
 </ScrollView></View>;
}
