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
