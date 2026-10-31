import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Text as SvgText, Defs, RadialGradient, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGraph } from "@/src/lib/api";
import { Icon } from "@/src/components/ui";
import { METRO, MetroBrand } from "@/src/components/metro-tiles";

const TYPES: Record<string,{name:string;color:string}> = {
  provider:{name:"Services",color:"#00B8E9"},
  subscription:{name:"Subscriptions",color:"#F7A009"},
  account:{name:"Accounts",color:"#3ACB8F"},
  link:{name:"Saved Links",color:"#4796FC"},
  prompt:{name:"AI Prompts",color:"#D86AFA"},
  promo:{name:"Promo Codes",color:"#ED579D"},
  plan:{name:"Watchlist",color:"#25B5C7"},
  category:{name:"Categories",color:"#F9C745"},
  tag:{name:"Ideas & Tags",color:"#B1A5FF"},
};
const FILTERS=["All","Services","Knowledge","Ideas","Money"];
const selectedTypes:Record<string,string[]> = {
  All:Object.keys(TYPES),Services:["provider","account","subscription","plan"],
  Knowledge:["link","prompt","tag","category"],Ideas:["link","prompt","tag","category","provider"],
  Money:["subscription","promo","plan","account","provider"],
};
export default function Graph() {
  const router=useRouter();const insets=useSafeAreaInsets();
  const {width:screenWidth}=useWindowDimensions();
  const {data,isLoading,refetch}=useGraph();
  const [filter,setFilter]=useState("All");
  const [zoom,setZoom]=useState(1);
  const [selected,setSelected]=useState<any>(null);
  const graph=useMemo(()=>{
    const all=data?.nodes||[];
    const permitted=new Set(selectedTypes[filter]);
    const visible=all.filter((n:any)=>permitted.has(n.type))
      .sort((a:any,b:any)=>{
        const priority=(x:string)=>["provider","category","tag"].includes(x)?0:1;
        return priority(a.type)-priority(b.type);
      }).slice(0,200);
    const keys=new Set(visible.map((n:any)=>n.id));
    const edges=(data?.edges||[]).filter((e:any)=>keys.has(e.source)&&keys.has(e.target));
    const W=Math.max(330,screenWidth-28)*zoom;
    const H=650*zoom;
    const cx=W/2,cy=H/2;
    const nodes=visible.map((n:any,i:number)=>{
      const angle=i*2.399963229728653;
      const radius=Math.sqrt((i+1)/(visible.length+1))*Math.min(W,H)*0.42;
      return {...n,x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)};
    });
    const pos=new Map(nodes.map((n:any)=>[n.id,n]));
    return {nodes,edges,pos,W,H};
  },[data,filter,zoom,screenWidth]);
  const selectedEdges=useMemo(()=>{
    if(!selected)return new Set<string>();
    const out=new Set<string>([selected.id]);
    graph.edges.forEach((e:any)=>{if(e.source===selected.id)out.add(e.target);if(e.target===selected.id)out.add(e.source)});
    return out;
  },[selected,graph]);
  const destination=()=>{
    const n=selected;if(!n)return;
    const uri:Record<string,string>={
      account:"/account/"+n.ref_id,subscription:"/subscription/"+n.ref_id,
      link:"/link/"+n.ref_id,prompt:"/(tabs)/prompts",
      promo:"/promo-vault",plan:"/watchlist",provider:"/(tabs)/account-hub",
    };
    router.push((uri[n.type]||"/(tabs)/vault") as any);
  };
  const label=(type:string)=>TYPES[type]?.name||type;
  return <View style={{flex:1,backgroundColor:METRO.black}}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingTop:insets.top+11,paddingHorizontal:14,paddingBottom:insets.bottom+118,gap:15}}>
      <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
        <View><MetroBrand word="BRAIN MAP"/><Text style={{color:METRO.dim,letterSpacing:1,fontSize:12}}>EXPLORE YOUR CONNECTED KNOWLEDGE</Text></View>
        <Pressable onPress={()=>{refetch();setSelected(null)}} accessibilityLabel="Refresh connections" style={{backgroundColor:"#252837",borderRadius:11,padding:10}}>
          <Icon name="refresh" size={25} color={METRO.cyan}/>
        </Pressable>
      </View>
      <View style={{flexDirection:"row",gap:8}}>
        <View style={{backgroundColor:"#122E41",borderRadius:12,padding:14,flex:1,borderWidth:1,borderColor:"#24516A"}}>
          <Text style={{color:METRO.cyan,fontSize:29,fontWeight:"900"}}>{data?.nodes?.length||0}</Text>
          <Text style={{color:METRO.white,fontSize:12,fontWeight:"800"}}>IDEAS & RECORDS</Text>
        </View>
        <View style={{backgroundColor:"#2A193D",borderRadius:12,padding:14,flex:1,borderWidth:1,borderColor:"#593B77"}}>
          <Text style={{color:"#E0A5FF",fontSize:29,fontWeight:"900"}}>{data?.edges?.length||0}</Text>
          <Text style={{color:METRO.white,fontSize:12,fontWeight:"800"}}>CONNECTIONS</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
        {FILTERS.map(name=><Pressable key={name} onPress={()=>{setFilter(name);setSelected(null)}}
          style={{backgroundColor:filter===name?METRO.cobalt:"#252632",borderRadius:8,paddingHorizontal:16,paddingVertical:11}}>
          <Text style={{color:METRO.white,fontSize:12,fontWeight:"800"}}>{name.toUpperCase()}</Text>
        </Pressable>)}
      </ScrollView>
      {isLoading?<Text style={{color:METRO.dim,textAlign:"center",marginTop:80}}>Building your knowledge map…</Text>:
        !graph.nodes.length?<View style={{padding:32,backgroundColor:"#20222B",borderRadius:14,alignItems:"center",gap:15}}>
          <Icon name="graph-outline" size={55} color={METRO.cobalt}/>
          <Text style={{color:METRO.white,fontSize:20,fontWeight:"900"}}>YOUR MAP STARTS HERE</Text>
          <Text style={{color:METRO.dim,fontSize:13,lineHeight:21,textAlign:"center"}}>Save subscriptions, accounts, links, prompts or promo codes. Their matching services, categories and tags will automatically become connected nodes.</Text>
          <Pressable onPress={()=>router.push("/(tabs)/vault")} style={{backgroundColor:METRO.cyan,padding:14,borderRadius:8}}>
            <Text style={{color:METRO.ink,fontWeight:"900"}}>ADD YOUR FIRST RECORD</Text>
          </Pressable>
        </View>:
        <View style={{backgroundColor:"#10121A",borderColor:"#313747",borderWidth:1,borderRadius:16,overflow:"hidden"}}>
          <View style={{padding:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
            <Text style={{color:METRO.dim,fontSize:12}}>Tap a node to inspect · {graph.nodes.length} visible</Text>
            <View style={{flexDirection:"row",gap:7}}>
              {[1,1.35,1.7].map(v=><Pressable key={v} onPress={()=>setZoom(v)}
                style={{backgroundColor:zoom===v?METRO.purple:"#282A37",paddingHorizontal:10,paddingVertical:8,borderRadius:6}}>
                <Text style={{color:METRO.white,fontWeight:"900",fontSize:12}}>{Math.round(v*100)}%</Text>
              </Pressable>)}
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Svg width={graph.W} height={graph.H}>
              <Defs><RadialGradient id="halo"><Stop offset="0" stopColor="#152845"/><Stop offset="1" stopColor="#10121A"/></RadialGradient></Defs>
              <Circle cx={graph.W/2} cy={graph.H/2} r={Math.min(graph.W,graph.H)*0.49} fill="url(#halo)"/>
              {graph.edges.map((e:any,i:number)=>{
                const a:any=graph.pos.get(e.source),b:any=graph.pos.get(e.target);if(!a||!b)return null;
                const lit=selected&&(e.source===selected.id||e.target===selected.id);
                return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={lit?"#A7F3FF":"#394151"} opacity={selected?(lit?0.95:0.15):0.48}
                  strokeWidth={lit?2.3:1}/>;
              })}
              {graph.nodes.map((n:any)=>{
                const hub=["provider","tag","category"].includes(n.type);
                const focus=selected?.id===n.id;
                const color=TYPES[n.type]?.color||METRO.cyan;
                return <Circle key={n.id} cx={n.x} cy={n.y} r={focus?17:(hub?11:8)}
                  fill={color} stroke={focus?"#FFFFFF":"#131826"} strokeWidth={focus?4:2}
                  opacity={selected&&!selectedEdges.has(n.id)?0.32:1}
                  onPress={()=>setSelected(n)}/>;
              })}
              {graph.nodes.filter((n:any)=>["provider","category"].includes(n.type)||n.id===selected?.id)
                .slice(0,65).map((n:any)=><SvgText key={"label-"+n.id} x={n.x} y={n.y-18}
                  fill={n.id===selected?.id?"#FFFFFF":"#C2CCDE"} fontSize={n.id===selected?.id?14:11}
                  fontWeight="bold" textAnchor="middle">{String(n.label).slice(0,19)}</SvgText>)}
            </Svg>
          </ScrollView>
          <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:13,padding:15,borderTopWidth:1,borderColor:"#303542"}}>
            {Object.entries(TYPES).map(([type,meta])=><View key={type} style={{flexDirection:"row",alignItems:"center",gap:5}}>
              <View style={{height:8,width:8,borderRadius:5,backgroundColor:meta.color}}/>
              <Text style={{color:"#AFB9C8",fontSize:10}}>{meta.name}</Text>
            </View>)}
          </View>
        </View>}
      {selected?<View style={{backgroundColor:"#1C2030",padding:18,borderRadius:15,borderWidth:1,borderColor:TYPES[selected.type]?.color||METRO.cyan,gap:8}}>
        <Text style={{color:TYPES[selected.type]?.color||METRO.cyan,fontSize:12,fontWeight:"900"}}>{label(selected.type).toUpperCase()}</Text>
        <Text style={{color:METRO.white,fontSize:21,fontWeight:"900"}}>{selected.label}</Text>
        <Text style={{color:METRO.dim,fontSize:12}}>{Math.max(0,selectedEdges.size-1)} related nodes · {graph.edges.filter((e:any)=>e.source===selected.id||e.target===selected.id).length} links</Text>
        <View style={{flexDirection:"row",gap:8}}>
          <Pressable onPress={destination} style={{flex:1,alignItems:"center",backgroundColor:METRO.cyan,padding:13,borderRadius:8}}>
            <Text style={{color:METRO.ink,fontWeight:"900"}}>OPEN RECORD</Text>
          </Pressable>
          <Pressable onPress={()=>setSelected(null)} style={{padding:13,backgroundColor:"#3B3D4A",borderRadius:8}}>
            <Text style={{color:METRO.white,fontWeight:"800"}}>CLEAR</Text>
          </Pressable>
        </View>
      </View>:null}
      <Text style={{color:METRO.dim,textAlign:"center",fontSize:11,lineHeight:18}}>Connections come from your real records, shared tags, saved links and matching services. No invented relationships.</Text>
    </ScrollView>
  </View>;
}
