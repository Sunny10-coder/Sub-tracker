import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getVault } from "@/src/lib/local-vault";
import { clusterVault, type Cluster, type Tool } from "@/src/lib/brain-clusters";
import { recommendToolsForGoal, type GoalRecommendation } from "@/src/lib/tool-goal-matcher";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand } from "@/src/components/metro-tiles";

const SIZE=800,CENTER=400,RADIUS=278;
const FRAME:any={borderRadius:14,borderWidth:1,borderColor:"#383A4E",backgroundColor:"#181A27",overflow:"hidden"};
function graphPositions(groups:Cluster[]){
 return groups.map((cluster,i)=>{
   const angle=(i/Math.max(1,groups.length))*Math.PI*2-Math.PI/2;
   const x=CENTER+RADIUS*Math.cos(angle),y=CENTER+RADIUS*Math.sin(angle);
   const children=cluster.tools.slice(0,3).map((tool,j)=>{
     const spread=(j-1)*0.54;
     return {...tool,x:x+62*Math.cos(angle+spread),y:y+62*Math.sin(angle+spread),clusterId:cluster.id};
   });
   return {...cluster,x,y,children};
 });
}
export default function BrainMap(){
 const router=useRouter(),insets=useSafeAreaInsets(),{width}=useWindowDimensions();
 const [vault,setVault]=useState<Record<string,any>>({});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [selectedId,setSelectedId]=useState("");
 const [selectedTool,setSelectedTool]=useState<Tool|null>(null);
 const [zoom,setZoom]=useState(0.67);
 const [query,setQuery]=useState("");
 const [goal,setGoal]=useState("");
 const [goalAnswer,setGoalAnswer]=useState<GoalRecommendation|null>(null);
 const [expanded,setExpanded]=useState(false);
 useFocusEffect(useCallback(()=>{
   let alive=true;setLoading(true);
   getVault().then(v=>{if(alive){setVault(v);setError("");setLoading(false);}})
     .catch(e=>{if(alive){setError(String(e?.message||e));setLoading(false);}});
   return()=>{alive=false};
 },[]));
 const groups=useMemo(()=>clusterVault(vault),[vault]);
 const positions=useMemo(()=>graphPositions(groups),[groups]);
 const selectedCluster=groups.find(g=>g.id===selectedId)||null;
 const total=groups.reduce((n,g)=>n+g.tools.length,0);
 const filtered=useMemo(()=>groups.filter(g=>!query.trim()||
   [g.title,...g.tools.map(t=>t.name+" "+t.kind)].join(" ").toLowerCase().includes(query.toLowerCase())),[groups,query]);
 const recommend=()=>{
   const request=goal.trim();if(!request)return;
   const result=recommendToolsForGoal(vault,request);
   setGoalAnswer(result);
   if(result.results.length)setSelectedId(result.results[0].cluster);
 };
 const openTool=(tool:Tool)=>{
   if(tool.kind.includes("prompt")||tool.kind.includes("idea"))router.push("/(tabs)/prompts");
   else if(tool.kind==="link")router.push("/link-vault");
   else if(tool.kind.includes("subscription"))router.push("/(tabs)/subscriptions");
   else if(tool.kind.includes("promo")||tool.kind.includes("offer"))router.push("/promo-vault");
   else if(tool.kind.includes("account"))router.push("/(tabs)/account-hub");
   else router.push("/(tabs)/vault");
 };
 const visibleSize=SIZE*zoom;
 return <View style={{flex:1,backgroundColor:METRO.black}}>
 <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
  contentContainerStyle={{paddingTop:insets.top+12,paddingHorizontal:13,paddingBottom:insets.bottom+115,gap:13}}>
  <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
   <View><MetroBrand word="BRAIN MAP"/><Text style={{color:METRO.dim,fontSize:11,letterSpacing:1.3}}>YOUR TOOLS. CONNECTED TO YOUR GOALS.</Text></View>
   <Icon name="brain" size={38} color={METRO.purple}/>
  </View>
  <View style={{backgroundColor:"#1D2440",borderColor:"#415181",borderWidth:1,padding:16,borderRadius:15,gap:10}}>
   <Text style={{color:METRO.white,fontWeight:"900",fontSize:19}}>WHAT DO YOU WANT TO ACHIEVE?</Text>
   <TextInput value={goal} onChangeText={setGoal} onSubmitEditing={recommend}
     returnKeyType="search" placeholder="e.g. Make a cinematic safety induction video"
     placeholderTextColor="#8D9BB3" style={{backgroundColor:"#101624",color:METRO.white,
       borderRadius:10,padding:15,fontSize:14}}/>
   <Pressable onPress={recommend} disabled={!goal.trim()} style={{padding:14,borderRadius:10,
     flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9,
     backgroundColor:goal.trim()?METRO.purple:"#42445C"}}>
      <Icon name="radar" size={23} color={METRO.white}/>
      <Text style={{color:METRO.white,fontWeight:"900"}}>FIND TOOLS I ALREADY HAVE</Text>
   </Pressable>
   <Text style={{color:"#AFBDD9",fontSize:11,lineHeight:16}}>Searches your own saved accounts, subscriptions, links and prompts. No AI credits used.</Text>
  </View>
  {goalAnswer?<View style={{...FRAME,padding:15,gap:11,borderColor:METRO.cyan+"77"}}>
    <Text style={{color:METRO.white,fontSize:17,fontWeight:"900"}}>{goalAnswer.hasMatch?"MATCHING TOOLS":"NO MATCHING SAVED TOOLS"}</Text>
    <Text style={{color:METRO.dim,fontSize:12}}>{goalAnswer.hasMatch?
      goalAnswer.results.length+" saved services match your goal":"Try a different description or add a tool to your vault."}</Text>
    {goalAnswer.results.map((result,i)=><Pressable key={result.tool.id+i} onPress={()=>openTool(result.tool)}
      style={{padding:12,borderRadius:8,backgroundColor:"#262D42",flexDirection:"row",alignItems:"center",gap:10}}>
      <Text style={{color:METRO.cyan,fontWeight:"900"}}>{i+1}</Text>
      <View style={{flex:1}}>
       <Text style={{color:METRO.white,fontWeight:"800"}}>{result.tool.name}</Text>
       <Text style={{color:METRO.dim,fontSize:11}}>{result.clusterTitle}</Text>
      </View>
      <Icon name="arrow-top-right" color={METRO.cyan}/>
    </Pressable>)}
    {goalAnswer.steps.map((step,i)=><Text key={i} style={{color:"#C7D0E2",fontSize:12,lineHeight:18}}>{step}</Text>)}
    <Pressable onPress={()=>router.push({pathname:"/(tabs)/ai",params:{ask:goal}})}
      style={{backgroundColor:"#293A51",padding:12,borderRadius:8,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8}}>
      <Icon name="chat-processing-outline" color={METRO.cyan}/>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>DISCUSS THIS GOAL IN AI CHAT</Text>
    </Pressable>
  </View>:null}
  <View style={{flexDirection:"row",gap:10}}>
    <View style={{backgroundColor:"#222A40",flex:1,borderRadius:12,padding:12}}>
      <Text style={{color:METRO.cyan,fontSize:27,fontWeight:"900"}}>{groups.length}</Text>
      <Text style={{color:METRO.white,fontSize:11,fontWeight:"900"}}>TOOL CLUSTERS</Text>
    </View>
    <View style={{backgroundColor:"#2D2140",flex:1,borderRadius:12,padding:12}}>
      <Text style={{color:"#DAB9FF",fontSize:27,fontWeight:"900"}}>{total}</Text>
      <Text style={{color:METRO.white,fontSize:11,fontWeight:"900"}}>SAVED TOOLS & IDEAS</Text>
    </View>
  </View>
  <View style={{...FRAME,gap:0}}>
    <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",
      padding:11,gap:6}}>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:13}}>YOUR CONNECTED UNIVERSE</Text>
      <View style={{flexDirection:"row",gap:5}}>
        {[0.53,0.67,1].map(z=><Pressable key={z} onPress={()=>setZoom(z)}
          style={{padding:8,borderRadius:7,backgroundColor:zoom===z?METRO.cobalt:"#343748"}}>
          <Text style={{color:METRO.white,fontSize:10,fontWeight:"900"}}>{Math.round(z*100)}%</Text>
        </Pressable>)}
      </View>
    </View>
    {loading?<Text style={{padding:40,color:METRO.dim}}>Connecting your saved tools…</Text>:
     groups.length===0?<Text style={{padding:32,color:METRO.dim,textAlign:"center"}}>Save a tool or link to begin building the map.</Text>:
     <ScrollView horizontal showsHorizontalScrollIndicator={false}
       contentContainerStyle={{paddingHorizontal:Math.max(0,(width-28-visibleSize)/2)}}>
      <Svg width={visibleSize} height={visibleSize} viewBox={"0 0 "+SIZE+" "+SIZE}>
        {[118,230,335].map((r,i)=><Circle key={i} cx={CENTER} cy={CENTER} r={r}
          stroke="#33405F" strokeWidth={1} fill="none" opacity={0.6}/>)}
        {positions.map(g=><Line key={"edge-"+g.id} x1={CENTER} y1={CENTER}
          x2={g.x} y2={g.y} stroke={g.color} strokeWidth={selectedId===g.id?3:1.4}
          opacity={selectedId&&selectedId!==g.id?0.25:0.65}/>)}
        {positions.flatMap(g=>g.children.map(t=><Line key={"tool-line-"+t.id} x1={g.x} y1={g.y}
          x2={t.x} y2={t.y} stroke={g.color} strokeWidth={1.5} opacity={0.7}/>))}
        <Circle cx={CENTER} cy={CENTER} r={61} fill="#1F315B" stroke={METRO.cyan} strokeWidth={4}/>
        <SvgText x={CENTER} y={CENTER-7} textAnchor="middle" fill={METRO.white}
          fontWeight="900" fontSize={23}>SUBMIND</SvgText>
        <SvgText x={CENTER} y={CENTER+19} textAnchor="middle" fill="#A8DFFF" fontSize={14}>BRAIN</SvgText>
        {positions.map(g=><Circle key={"glow-"+g.id} cx={g.x} cy={g.y} r={selectedId===g.id?47:42}
          fill={g.color} opacity={selectedId===g.id?0.28:0.13}/>)}
        {positions.map(g=><Circle key={"hub-"+g.id} cx={g.x} cy={g.y} r={36} stroke={g.color}
          strokeWidth={selectedId===g.id?5:2} fill="#252B43" onPress={()=>{setSelectedId(g.id);setSelectedTool(null)}}/>)}
        {positions.map(g=><SvgText key={"hub-label-"+g.id} x={g.x} y={g.y-1}
          fontSize={10} textAnchor="middle" fill={METRO.white} fontWeight="900"
          onPress={()=>{setSelectedId(g.id);setSelectedTool(null)}}>
          {g.title.split(" ").slice(0,2).join(" ").slice(0,14)}
        </SvgText>)}
        {positions.map(g=><SvgText key={"count-"+g.id} x={g.x} y={g.y+15}
          fontSize={11} fill={g.color} textAnchor="middle" fontWeight="900"
          onPress={()=>setSelectedId(g.id)}>{g.tools.length} tools</SvgText>)}
        {positions.flatMap(g=>g.children.map(t=><Circle key={"tool-"+t.id} cx={t.x} cy={t.y}
          r={15} stroke="#111927" strokeWidth={2} fill={g.color}
          onPress={()=>{setSelectedId(g.id);setSelectedTool(t)}}/>))}
        {positions.flatMap(g=>g.children.map(t=><SvgText key={"name-"+t.id} x={t.x}
          y={t.y-21} fontSize={10} textAnchor="middle" fill="#D5DEEF"
          onPress={()=>{setSelectedId(g.id);setSelectedTool(t)}}>
          {t.name.slice(0,16)}</SvgText>))}
      </Svg>
     </ScrollView>}
    <Text style={{padding:11,fontSize:11,color:METRO.dim,textAlign:"center"}}>
      Tap a cluster or tool node · zoom to inspect your relationships
    </Text>
  </View>
  {selectedTool?<Pressable onPress={()=>openTool(selectedTool)} style={{...FRAME,padding:15,
    flexDirection:"row",alignItems:"center",gap:11,borderColor:METRO.cyan}}>
    <Icon name="link-variant" color={METRO.cyan} size={26}/>
    <View style={{flex:1}}>
      <Text style={{color:METRO.white,fontWeight:"900",fontSize:18}}>{selectedTool.name}</Text>
      <Text style={{color:METRO.dim,fontSize:12}}>{selectedTool.kind.replace(/,/g," · ")}</Text>
    </View>
    <Icon name="arrow-top-right" color={METRO.cyan}/>
  </Pressable>:null}
  <View style={{flexDirection:"row",alignItems:"center",gap:9,backgroundColor:"#252938",borderRadius:11,paddingHorizontal:12}}>
    <Icon name="magnify" size={22} color={METRO.dim}/>
    <TextInput value={query} onChangeText={setQuery} placeholder="Find an existing tool, service or cluster…"
      placeholderTextColor="#8F9DB4" style={{color:METRO.white,flex:1,padding:13}}/>
  </View>
  {selectedCluster?<View style={{...FRAME,padding:13,gap:9,borderColor:selectedCluster.color}}>
    <Text style={{color:selectedCluster.color,fontSize:18,fontWeight:"900"}}>{selectedCluster.title}</Text>
    <Text style={{color:METRO.dim,fontSize:12}}>{selectedCluster.description}</Text>
    {(expanded?selectedCluster.tools:selectedCluster.tools.slice(0,8)).map(t=><Pressable
      key={t.id} onPress={()=>openTool(t)} style={{backgroundColor:"#282C3E",padding:12,borderRadius:8,
        flexDirection:"row",gap:11,alignItems:"center"}}>
      <Icon name="hexagon-multiple-outline" color={selectedCluster.color} size={20}/>
      <Text style={{color:METRO.white,fontWeight:"800",flex:1}}>{t.name}</Text>
      <Icon name="chevron-right" color={selectedCluster.color}/>
    </Pressable>)}
    {selectedCluster.tools.length>8?<Pressable onPress={()=>setExpanded(v=>!v)}>
      <Text style={{color:METRO.cyan,fontWeight:"900",textAlign:"center"}}>{expanded?"SHOW LESS":"SHOW ALL "+selectedCluster.tools.length+" TOOLS"}</Text>
    </Pressable>:null}
  </View>:null}
  {filtered.length>0?<ScrollView horizontal showsHorizontalScrollIndicator={false}
    contentContainerStyle={{gap:7}}>
    {filtered.map(g=><Pressable key={g.id} onPress={()=>{setSelectedId(g.id);setSelectedTool(null)}}
      style={{backgroundColor:selectedId===g.id?g.color:"#262C3D",padding:11,borderRadius:8}}>
      <Text style={{color:METRO.white,fontSize:11,fontWeight:"900"}}>{g.title} · {g.tools.length}</Text>
    </Pressable>)}
  </ScrollView>:null}
  {error?<Text style={{color:METRO.red}}>{error}</Text>:null}
  <Text style={{fontSize:11,color:METRO.dim,textAlign:"center",lineHeight:18}}>
    Clusters and goal recommendations use only your own saved records. Available features and plan limits still depend on each provider.
  </Text>
 </ScrollView>
 </View>;
}
