/**
 * On-device recommendations grounded ONLY in the tools actually in SubMind.
 * Offline and free: the user's goal is not sent to paid LLMs to find tools.
 */
import { clusterVault, type Tool } from "@/src/lib/brain-clusters";

type Vault=Record<string,any>;
export type ToolRecommendation={tool:Tool;cluster:string;clusterTitle:string;reason:string;score:number};
export type GoalRecommendation={
  goal:string;results:ToolRecommendation[];steps:string[];followUps:string[];
  answer:string;hasMatch:boolean;
};
const TASKS:{group:string;terms:string[];reason:string}[]=[
 {group:"ai-video",terms:["video","film","movie","footage","clip","animation","induction","cinematic","reels","shorts","motion","documentary"],reason:"Saved AI video/film tools fit media production work"},
 {group:"ai-image",terms:["image","picture","photo","visual","thumbnail","poster","banner","design","graphic","logo","art","mockup"],reason:"Saved image and design tools fit visual creation"},
 {group:"ai-chat",terms:["write","draft","script","lyrics","prompt","brainstorm","reason","answer","chatbot","agent","assistant","summarize","translate","research"],reason:"Saved AI assistants can support planning and writing"},
 {group:"development",terms:["app","application","android","website","web","software","build","code","program","github","deploy","dashboard","database","apk"],reason:"Saved app development tools fit building and hosting"},
 {group:"automation",terms:["automate","automation","schedule","workflow","connect","integrate","sync","email","gmail","agent","remind","notify","monitor"],reason:"Saved workflow tools can connect and automate tasks"},
 {group:"learning",terms:["learn","study","research","course","paper","investigate","analyse","analyze","textbook","knowledge"],reason:"Saved learning and research tools help investigate"},
 {group:"media",terms:["instagram","reddit","social","linkedin","audience","publish","post","engagement","creator","marketing"],reason:"Saved social tools can support publishing"},
 {group:"finance",terms:["subscription","plan","renewal","spend","budget","billing","payment","discount","coupon","promo","offer"],reason:"Saved subscription and finance tools track cost and plans"},
 {group:"wellness",terms:["fitness","food","calorie","health","wellness","sleep","exercise","diet"],reason:"Saved wellness tools fit this goal"},
];
const IGNORE=new Set(["i","a","the","and","to","of","my","me","for","in","with","have","want","need","some","can","will","using","do","this","that","something","make","create","how","what","which","please","best","help"]);
const words=(s:string)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(x=>x.length>=3&&!IGNORE.has(x));
export function isGoalQuery(input:string):boolean{
  const q=input.toLowerCase().trim();
  return /\b(?:i (?:want|need|plan|would like) to|help me|what tools? (?:should|can)|which (?:app|tool)|how (?:do|can) i (?:make|build|create|automate|design|edit|research|study|produce)|recommend (?:tools?|apps?)|find (?:tools?|apps?) (?:for|to))\b/.test(q);
}
export function recommendToolsForGoal(v:Vault,rawGoal:string):GoalRecommendation{
 const goal=rawGoal.trim().slice(0,900),tokens=words(goal);
 const clusters=clusterVault(v);
 const weights=new Map<string,number>();
 for(const category of TASKS){
   const score=category.terms.reduce((count,t)=>count+(tokens.includes(t)?5:0),0);
   if(score)weights.set(category.group,score);
 }
 const phrase=goal.toLowerCase();
 const matches:ToolRecommendation[]=[];
 for(const cluster of clusters){
   for(const tool of cluster.tools){
     const nameTokens=words(tool.name);
     const direct=nameTokens.reduce((n,t)=>n+(tokens.includes(t)?12:0),0);
     const detail=words(tool.description||"");
     const context=detail.reduce((n,t)=>n+(tokens.includes(t)?1:0),0);
     const group=weights.get(cluster.id)||0;
     const isPast=/expired|cancelled|canceled/i.test(tool.status||"");
     const score=(direct+context+group+(isPast?-12:0));
     if(score<3)continue;
     matches.push({
       tool,cluster:cluster.id,clusterTitle:cluster.title,score,
       reason:direct?("Your goal mentions "+tool.name):TASKS.find(x=>x.group===cluster.id)?.reason||"Relevant saved tool",
     });
   }
 }
 matches.sort((a,b)=>b.score-a.score||a.tool.name.localeCompare(b.tool.name));
 const selected:ToolRecommendation[]=[];
 const perGroup=new Map<string,number>();
 for(const m of matches){
   if(selected.length>=6)break;
   if((perGroup.get(m.cluster)||0)>=3)continue;
   const dupe=selected.some(x=>x.tool.name.toLowerCase()===m.tool.name.toLowerCase());
   if(dupe)continue;
   selected.push(m);perGroup.set(m.cluster,(perGroup.get(m.cluster)||0)+1);
 }
 const steps=selected.slice(0,4).map((m,i)=>{
   const role=m.cluster==="ai-video"?"generate/edit your video material":
     m.cluster==="ai-image"?"prepare visuals":
     m.cluster==="ai-chat"?"plan, write or refine the content":
     m.cluster==="development"?"build or publish the app":
     m.cluster==="automation"?"connect tasks and automate repeated steps":
     m.cluster==="learning"?"research the subject":
     m.cluster==="media"?"publish or share your output":
     m.cluster==="finance"?"check plans, costs and expiry":
     "support this part of the workflow";
   return (i+1)+". "+m.tool.name+" — "+role+".";
 });
 const followUps=selected.length>=2?
   ["Compare "+selected[0].tool.name+" and "+selected[1].tool.name+" for my goal",
    "Give me a step-by-step workflow using "+selected.slice(0,3).map(x=>x.tool.name).join(", ")]:
   selected.length===1?["Show how to use "+selected[0].tool.name+" for this goal"]:[];
 const hasMatch=selected.length>0;
 const answer=hasMatch?
   "For your goal: "+goal+"\n\nAvailable tools from your own SubMind library:\n"+
   selected.map((m,i)=>(i+1)+". "+m.tool.name+" ("+m.clusterTitle+") — "+m.reason+".").join("\n")+
   "\n\nSuggested workflow:\n"+steps.join("\n")+
   "\n\nThese suggestions are based only on saved service names and categories. Verify each plan's available features before use.":
   "I couldn't find a saved tool closely matching this goal: "+goal+
   "\nYour subscriptions and links are unchanged. Add or import a relevant service, or refine the goal; I won't invent a tool you don't own.";
 return{goal,results:selected,steps,followUps,answer,hasMatch};
}
