import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Any=Record<string,any>;
const TABS=["Plan my goal","Credit optimizer","Benefit matcher","Follow-ups","GitHub watch","Connections"] as const;
export default function SmartCompanion(){
 const styles=useStyles(),{colors}=useTheme(),router=useRouter(),insets=useSafeAreaInsets();
 const invalidate=useInvalidateAll();
 const [tab,setTab]=useState<string>(TABS[0]),[overview,setOverview]=useState<Any|null>(null),
   [goal,setGoal]=useState(""),[query,setQuery]=useState(""),
   [plan,setPlan]=useState<Any|null>(null),[matches,setMatches]=useState<Any[]>([]),
   [connections,setConnections]=useState<Any[]>([]),[busy,setBusy]=useState(false),
   [progress,setProgress]=useState(""),[error,setError]=useState("");
 const refresh=async()=>{const data=await api.smartOverview();setOverview(data);};
 useFocusEffect(useCallback(()=>{let live=true;api.smartOverview().then(d=>{if(live)setOverview(d)}).catch(e=>{if(live)setError(String(e.message))});return()=>{live=false}},[]));
 const execute=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();await refresh();invalidate()}catch(e:any){setError(e?.message||"Action failed")}finally{setBusy(false)}};
 const match=()=>execute(async()=>setMatches(await api.smartBenefitMatch({title:query,description:query})));
 const planIt=()=>execute(async()=>setPlan(await api.smartGoalPlan(goal)));
 const saveTask=(task:Any)=>execute(async()=>{await api.smartAddTask(task)});
 const changeTask=(id:string,status:"open"|"done"|"dismissed")=>execute(async()=>{await api.smartTaskStatus(id,status)});
 const monitor=()=>execute(async()=>{
   const res=await api.smartCheckRepositories((n,total)=>setProgress("Checked "+n+" / "+total));
   setProgress(res.checked+" checked · "+res.alerts+" new alerts · "+res.errors+" unavailable");
 });
 const findConnections=()=>execute(async()=>{const links=await api.links();const needle=query.toLowerCase();
   const target=links.find((x:Any)=>String(x.title||x.url).toLowerCase().includes(needle));
   if(!target)throw Error("No saved link matches your search. Try its title.");
   setConnections(await api.smartConnections(target));
 });
 const navigation=(x:Any)=>{if(x.type==="link"||x.source_type==="link")router.push(("/link/"+String(x.id||x.source_id)) as never);
   else if(x.type==="subscription")router.push(("/subscription/"+String(x.id)) as never);
   else router.push("/tool-brain")};
 const accounts=(overview?.credits?.records||[]) as Any[];
 return <View style={styles.page}>
   <AppHeader title="Smart companion" subtitle="Your tools, credits, goals and follow-ups" back/>
   <ScrollView horizontal style={{flexGrow:0}} showsHorizontalScrollIndicator={false}
     contentContainerStyle={{paddingHorizontal:14,gap:6,paddingBottom:10}}>
     {TABS.map(t=><Pressable key={t} onPress={()=>{setTab(t);setError("");}}
       accessibilityRole="button" accessibilityState={{selected:tab===t}}
       style={[styles.tab,tab===t&&{backgroundColor:colors.brandPrimary}]}>
       <Text style={{color:tab===t?colors.onBrandPrimary:colors.onSurface,fontWeight:"700",fontSize:12}}>{t}</Text>
     </Pressable>)}
   </ScrollView>
   <ScrollView keyboardShouldPersistTaps="handled"
     contentContainerStyle={{padding:16,paddingBottom:insets.bottom+80,gap:13}}>
     {tab==="Plan my goal"?<>
       <Text style={styles.heading}>Describe your outcome</Text>
       <TextInput style={styles.input} value={goal} onChangeText={setGoal} multiline
         placeholder="e.g. Make a safety induction video using tools I already have"
         placeholderTextColor={colors.muted}/>
       <Action label="Build my workflow" icon="lightbulb-on-outline" disabled={!goal.trim()||busy} click={planIt}/>
       {plan?.steps?.map((x:Any)=><View key={x.number} style={styles.card}>
         <Text style={styles.subheading}>{x.number}. {x.title}</Text>
         <Text style={styles.body}>{x.detail}</Text>
       </View>)}
       {plan?.suggestedLinks?.length?<><Text style={styles.heading}>Useful saved resources</Text>
         {plan.suggestedLinks.map((l:Any)=><Action key={l.id} label={String(l.title||l.url)} icon="link-variant"
           click={()=>router.push(("/link/"+l.id) as never)}/>)}</>:null}
       {plan?<Text style={styles.fine}>{plan.notice}</Text>:null}
       {plan?<Action label="Discuss this goal with AI" icon="robot-outline"
         click={()=>router.push({pathname:"/(tabs)/ai",params:{ask:goal}})}/>:null}
     </>:null}
     {tab==="Credit optimizer"?<>
       <Text style={styles.heading}>Credits already recorded</Text>
       <Text style={styles.fine}>Balances and free use are never assumed. Confirm amounts with the provider before spending.</Text>
       {accounts.length?accounts.map((x:Any)=><View key={x.id} style={styles.card}>
         <Text style={styles.subheading}>{x.provider} · {x.label}</Text>
         <Text style={styles.body}>{x.quantity===null?"Quantity unknown":x.quantity+" "+x.unit} · {x.meaning}</Text>
         <Text style={styles.fine}>{x.expiry?"Recorded expiry: "+x.expiry:"No verified expiry"} · {x.status}</Text>
       </View>):<Text style={styles.body}>No credit allocations recorded. Import your saved benefits to see them here.</Text>}
       {(overview?.credits?.guidance||[]).map((g:string,i:number)=><Text key={i} style={styles.fine}>{g}</Text>)}
       <Action label="Manage AI models and keys" icon="key-variant" click={()=>router.push("/api-keys")}/>
     </>:null}
     {tab==="Benefit matcher"?<>
       <Text style={styles.heading}>Before buying another tool</Text>
       <TextInput style={styles.input} value={query} onChangeText={setQuery}
         placeholder="e.g. video transcription, app hosting, voice assistant"
         placeholderTextColor={colors.muted}/>
       <Action label="Check saved subscriptions for overlap" icon="compare-horizontal"
         disabled={!query.trim()||busy} click={match}/>
       {matches.length?matches.map((x:Any,i:number)=><View key={x.id+":"+i} style={styles.card}>
         <Text style={styles.subheading}>{x.provider} · {x.plan}</Text>
         <Text style={styles.body}>{x.reason}</Text>
         <Text style={styles.fine}>{x.source} · {x.status} · {x.confirmed?"Saved active plan; capabilities need confirmation":"Entitlement not confirmed"}</Text>
       </View>):<Text style={styles.fine}>Matches are suggestions based on saved descriptions, not confirmation of paid features.</Text>}
     </>:null}
     {tab==="Follow-ups"?<>
       <Text style={styles.heading}>Actions worth following up</Text>
       {(overview?.suggestions||[]).map((x:Any)=><View key={x.source_key} style={styles.card}>
         <Text style={styles.subheading}>{x.title}</Text><Text style={styles.body}>{x.description}</Text>
         <Action label="Add to my follow-ups" icon="playlist-plus" disabled={busy} click={()=>saveTask(x)}/>
       </View>)}
       <Text style={styles.heading}>Saved follow-ups</Text>
       {(overview?.tasks||[]).filter((x:Any)=>x.status!=="dismissed").map((x:Any)=><View key={x.id} style={styles.card}>
         <Text style={styles.subheading}>{x.title}</Text><Text style={styles.fine}>{x.status} · {x.due_date||"No due date"}</Text>
         <View style={{flexDirection:"row",gap:9,flexWrap:"wrap"}}>
           <Action label={x.status==="done"?"Reopen":"Done"} icon="check"
             disabled={busy} click={()=>changeTask(x.id,x.status==="done"?"open":"done")}/>
           <Action label="Dismiss" icon="close" disabled={busy} click={()=>changeTask(x.id,"dismissed")}/>
         </View>
       </View>)}
       {!overview?.tasks?.length&&!overview?.suggestions?.length?<Text style={styles.body}>Nothing to follow up yet.</Text>:null}
     </>:null}
     {tab==="GitHub watch"?<>
       <Text style={styles.heading}>Watch public GitHub repositories</Text>
       <Text style={styles.fine}>Monitoring is user-triggered, not continuous while the app is closed. First check records a baseline; later checks can identify new releases and archived status.</Text>
       <Action label="Check watched repositories" icon="refresh" disabled={busy} click={monitor}/>
       {progress?<Text style={styles.fine}>{progress}</Text>:null}
       {(overview?.watching||[]).map((l:Any)=><View key={l.id} style={styles.card}>
         <Text style={styles.subheading}>{l.title||l.url}</Text>
         <Text style={styles.fine}>{l.last_repo_check?"Last checked "+l.last_repo_check:"Not checked yet"}</Text>
         <Action label="Open saved repository" icon="github" click={()=>navigation({type:"link",id:l.id})}/>
       </View>)}
       {!overview?.watching?.length?<Text style={styles.body}>To add one, open a saved GitHub repository and turn on Watch for releases.</Text>:null}
       <Action label="Open GitHub links" icon="github" click={()=>router.push("/link-vault?kind=github" as never)}/>
     </>:null}
     {tab==="Connections"?<>
       <Text style={styles.heading}>Find related knowledge</Text>
       <TextInput style={styles.input} value={query} onChangeText={setQuery}
         placeholder="Search the title of an existing saved link"
         placeholderTextColor={colors.muted}/>
       <Action label="Find connections" icon="graph" disabled={!query.trim()||busy} click={findConnections}/>
       {connections.map((x:Any)=><Pressable key={x.type+":"+x.id} style={styles.card}
          onPress={()=>navigation(x)}>
         <Text style={styles.subheading}>{x.title}</Text><Text style={styles.body}>{x.reason}</Text>
       </Pressable>)}
       <Action label="Open my Brain Map" icon="brain" click={()=>router.push("/tool-brain")}/>
     </>:null}
     {error?<Text style={{color:colors.error,fontSize:12}}>{error}</Text>:null}
   </ScrollView>
 </View>;
 function Action({label,icon,click,disabled=false}:{label:string;icon:string;click:()=>void;disabled?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={click}
    style={[styles.action,disabled&&{opacity:.5}]}>
    <Icon name={icon} size={18} color={colors.brandPrimary}/><Text style={{color:colors.onSurface,fontWeight:"700",fontSize:13,flexShrink:1}}>{label}</Text>
  </Pressable>
 }
}
const useStyles=makeStyles(c=>({
 page:{flex:1,backgroundColor:c.surface},
 tab:{backgroundColor:c.surfaceSecondary,paddingHorizontal:14,paddingVertical:11,minHeight:42,justifyContent:"center"},
 card:{backgroundColor:c.surfaceSecondary,padding:15,gap:9,borderWidth:1,borderColor:c.border},
 action:{paddingVertical:11,paddingHorizontal:12,gap:9,flexDirection:"row",alignItems:"center",
   backgroundColor:c.surfaceTertiary,marginTop:3,minHeight:42},
 input:{borderWidth:1,borderColor:c.border,backgroundColor:c.surfaceSecondary,padding:13,
   color:c.onSurface,fontSize:14,minHeight:52},
 heading:{fontSize:19,color:c.onSurface,fontWeight:"800"},
 subheading:{fontSize:15,color:c.onSurface,fontWeight:"700"},
 body:{fontSize:13,color:c.onSurfaceSecondary,lineHeight:19},
 fine:{fontSize:12,color:c.muted,lineHeight:18},
}));
