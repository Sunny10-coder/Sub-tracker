export type Tool = { id:string; name:string; kind:string; ref_id?:string; status?:string; description?:string; category?:string };
export type Cluster={id:string; title:string; icon:string; color:string; description:string; tools:Tool[]};
const GROUPS=[
["ai-chat","AI CHAT & AGENTS","robot-outline","#8367F5","Chat, reasoning and autonomous agents","chatgpt openai claude anthropic gemini grok perplexity deepseek copilot qwen nvidia groq nemotron mistral huggingface"],
["ai-video","AI VIDEO & FILM","movie-open-play-outline","#D8519F","Video models, film generation and editing","higgsfield seedance kling runway minimax hailuo dreamina pika luma veo sora ltx kavel swaybyte video film"],
["ai-image","AI IMAGES & DESIGN","image-multiple-outline","#E2B15A","Images, graphics, visual editing and creativity","midjourney ideogram leonardo flux firefly canva figma adobe design graphic image photography"],
["development","APP DEVELOPMENT","code-braces","#279CD5","Apps, APIs, hosting and repositories","github gitlab replit lovable emergent supabase wasmer vercel netlify cloudflare firebase railway render developer code coding deployment"],
["automation","AUTOMATION & WORKFLOWS","connection","#35BCA2","Connected apps and automated operations","make n8n zapier ifttt automation workflows botkeep mcp"],
["learning","RESEARCH & LEARNING","school-outline","#799DF0","Research services and education","coursera udemy edx scholar scispace notebooklm research education learning tutorial study courses"],
["media","SOCIAL & MEDIA","account-group-outline","#EA8A76","Social, community and publishing","reddit instagram facebook youtube tiktok linkedin pinterest twitter social creator publishing"],
["finance","FINANCE & PLANS","credit-card-settings-outline","#DABA47","Payments and subscription management","billing finance payment bank subscription paypal stripe z2u wallet"],
["wellness","LIFESTYLE & WELLNESS","heart-pulse","#7CC38C","Health and everyday living","fitness food health wellness vitalift calories sleep gym"],
["other","OTHER TOOLS","folder-multiple-outline","#8392AC","Uncategorised services",""]
] as const;
const norm=(s:any)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function topic(name:string, context:string):string{
 const n=norm(name),words=(" "+norm(name+" "+context)+" ");
 let best="other",score=0;
 for(const g of GROUPS){
  if(g[0]==="other")continue;
  let s=0;
  for(const term of g[5].split(" ")){
    if(n===term)s+=12;
    else if(term.length>3&&n.includes(term))s+=7;
    if(words.includes(" "+term+" "))s+=2;
  }
  if(s>score){score=s;best=g[0];}
 }
 return best;
}
export function clusterVault(v:Record<string,any>):Cluster[]{
 const groups=new Map<string,Map<string,Tool>>();
 GROUPS.forEach(g=>groups.set(g[0],new Map()));
 const add=(kind:string,s:any,name:string,context:string)=>{
  if(!name||norm(name)==="unknown")return;
  const bucket=topic(name,context), group=groups.get(bucket)!;
  const k=norm(name).replace(/ /g,"");
  const existing=group.get(k);
  if(existing){
    const parts=new Set(existing.kind.split(","));
    parts.add(kind);existing.kind=[...parts].join(",");
  }else group.set(k,{id:bucket+":"+k,name,kind,ref_id:s.id,status:s.status,category:s.category,description:context.slice(0,145)});
 };
 for(const s of v.accounts||[])add("account",s,String(s.provider||""),[s.category,s.notes].join(" "));
 for(const s of v.subscriptions||[])add("subscription",s,String(s.provider||""),[s.category,s.product,s.plan].join(" "));
 for(const s of v.watchlist||[])add("watchlist",s,String(s.provider||""),[s.category,s.plan].join(" "));
 for(const s of v.promo_codes||[])add("promo",s,String(s.provider||""),[s.title,s.discount_text].join(" "));
 for(const s of v.promo_findings||[])add("offer",s,String(s.provider||""),[s.title,s.description].join(" "));
 for(const s of v.links||[])add("link",s,String(s.provider||s.title||""),[s.category,s.title,(s.tags||[]).join(" ")].join(" "));
 for(const s of v.prompts||[]){
   const title=String(s.title||"").trim();
   if(!title)continue;
   const context=[s.category,s.text,(s.tags||[]).join(" ")].join(" ").slice(0,300);
   const groupId=topic(title,context),group=groups.get(groupId)!;
   group.set("prompt:"+s.id,{id:"prompt:"+s.id,name:title,kind:s.kind==="idea"?"idea":"prompt",ref_id:s.id,description:context.slice(0,145)});
 }
 return GROUPS.map(g=>({id:g[0],title:g[1],icon:g[2],color:g[3],description:g[4],
  tools:[...groups.get(g[0])!.values()].sort((a,b)=>a.name.localeCompare(b.name))}))
  .filter(g=>g.tools.length>0) as Cluster[];
}
