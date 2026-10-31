/**
 * Optional user-triggered Gemini enhancement. Only the specific link's URL,
 * title and note are shared with the user's own Google AI key.
 */
import { call, key, models } from "@/src/lib/direct-providers";
import { inferCategory, inferTags } from "@/src/lib/vault-intelligence";
export async function enrichLinkWithGemini(record: any): Promise<{title:string;summary:string;category:string;tags:string[];enrichment:string}> {
 const token=await key("gemini");
 if(!token)throw Error("Add a Gemini API key in Settings → API Keys first.");
 const available=await models("gemini");
 const model=available.find((x:string)=>/flash/i.test(x))||available[0];
 if(!model)throw Error("No Gemini text generation models are available.");
 const payload={
  contents:[{parts:[{text:JSON.stringify({
    instruction:"Classify this saved URL and suggest tags only from its domain, path and user note. You have NOT accessed the webpage, so never claim to know the page contents. Respond ONLY with a JSON object containing title (short), summary (one concise cautious sentence), category (AI, Development, Learning, Design, Productivity, Finance, Deals, Health, Other), and tags (3 to 8 strings). Do not include personal details not in the input.",
    url:String(record.url||"").slice(0,1800),
    title:String(record.title||"").slice(0,180),
    note:String(record.note||"").slice(0,750)
  })}]}],
  generationConfig:{responseMimeType:"application/json",maxOutputTokens:650,temperature:0.2}
 };
 const d=await call("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{"x-goog-api-key":token},payload);
 const raw=(d.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||"").join("");
 let answer:any;
 try{answer=JSON.parse(raw)}catch{throw Error("Gemini returned an unreadable classification; the link was not changed.")}
 const clean=(x:unknown,max:number)=>typeof x==="string"?x.trim().slice(0,max):"";
 const category=clean(answer.category,30)||inferCategory([record.title,record.note,record.url].join(" "));
 const tags=inferTags([answer.title,answer.summary,record.url].join(" "),
   Array.isArray(answer.tags)?answer.tags.filter((x:any)=>typeof x==="string").map((x:string)=>x.trim().slice(0,26)).slice(0,8):[]);
 return {
  title:clean(answer.title,90)||record.title||record.url,
  summary:clean(answer.summary,500)||record.summary||"",
  category:["AI","Development","Learning","Design","Productivity","Finance","Deals","Health","Other"].includes(category)?category:"Other",
  tags, enrichment:"gemini-url-note-only"
 };
}


/**
 * Public GitHub enrichment for server-free Android installs.
 * No private token, no paid AI and no speculation about repo behavior.
 * An unavailable API leaves the locally classified bookmark intact.
 */
export async function publicGitHubMetadata(rawUrl:string):Promise<Record<string,any>|null>{
  let url:URL;
  try{url=new URL(rawUrl);}catch{return null;}
  if(url.hostname.toLowerCase()!=="github.com")return null;
  const path=url.pathname.split("/").filter(Boolean);
  if(path.length<2||!path[0]||!path[1])return null;
  const owner=path[0],repo=path[1].replace(/\\.git$/i,"");
  if(!/^[a-zA-Z0-9_.-]+$/.test(owner)||!/^[a-zA-Z0-9_.-]+$/.test(repo))return null;
  const endpoint="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo);
  const res=await fetch(endpoint,{headers:{Accept:"application/vnd.github+json"}});
  if(!res.ok)return null;
  const data=await res.json();
  if(data.private||data.message||typeof data.full_name!=="string")return null;
  const tags=Array.isArray(data.topics)?data.topics.filter((x:any)=>typeof x==="string").slice(0,10):[];
  const description=typeof data.description==="string"?data.description.trim().slice(0,650):"";
  const name=String(data.full_name).slice(0,120);
  return {
    title:name,
    summary:description||"Public GitHub repository. Description was not provided by its owner.",
    kind:"github",collection:"GitHub",analysis_basis:"repo_metadata",analysis_ai:false,
    tags:inferTags([name,description,...tags].join(" "),tags),
    repo:{language:data.language||null,stars:Number.isFinite(Number(data.stargazers_count))?Number(data.stargazers_count):null,
      forks:Number.isFinite(Number(data.forks_count))?Number(data.forks_count):null,
      license:data.license?.spdx_id||null,description,
      archived:data.archived===true,updated_at:data.pushed_at||null,
      homepage:data.homepage||null}
  };
}
