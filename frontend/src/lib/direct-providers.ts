import { storage } from "@/src/utils/storage";
export type Provider = "gemini"|"groq"|"nvidia"|"brave";
export const keyId=(p:Provider)=>"submind.api-keys."+p;
export async function key(p:Provider){return String(await storage.secureGet(keyId(p),"")||"").trim()}
export async function call(url:string,headers:Record<string,string>,payload?:any){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
 try{const res=await fetch(url,{method:payload?"POST":"GET",headers:{"Accept":"application/json",...headers,...(payload?{"Content-Type":"application/json"}:{})},body:payload?JSON.stringify(payload):undefined,signal:controller.signal});
 const data=await res.json();if(!res.ok)throw Error("Provider HTTP "+res.status+": "+String(data?.error?.message||data?.message||"Request rejected").slice(0,160));
 return data;
 }finally{clearTimeout(timer)}
}
export async function models(p:"gemini"|"groq"){
 const k=await key(p);if(!k)throw Error("Add a "+p+" API key first");
 if(p==="gemini"){
 const d=await call("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",{"x-goog-api-key":k});
 return (d.models||[]).filter((m:any)=>(m.supportedGenerationMethods||[]).includes("generateContent")).map((m:any)=>String(m.name).replace("models/",""));
 }
 const d=await call("https://api.groq.com/openai/v1/models",{Authorization:"Bearer "+k});
 return (d.data||[]).map((m:any)=>String(m.id)).filter((s:string)=>!/(whisper|tts|guard)/i.test(s));
}
export async function checkKey(p:Provider,raw?:string){
 const k=raw||await key(p);if(!k)throw Error("Enter a key");
 if(p==="brave"){await call("https://api.search.brave.com/res/v1/web/search?q=subscription&count=1",{"X-Subscription-Token":k});return "Brave Search connected"}
 if(p!=="nvidia"){
 const d=p==="gemini"?await call("https://generativelanguage.googleapis.com/v1beta/models?pageSize=10",{"x-goog-api-key":k}):
 await call("https://api.groq.com/openai/v1/models",{Authorization:"Bearer "+k});
 return "Connected. Available models: "+(d.models||d.data||[]).length;
 }
 await call("https://integrate.api.nvidia.com/v1/chat/completions",{Authorization:"Bearer "+k},{
 model:"meta/llama-3.1-8b-instruct",messages:[{role:"user",content:"Say OK"}],max_tokens:12,stream:false});
 return "NVIDIA connected";
}
export async function chat(question:string,context:string,provider:"gemini"|"groq"|"nvidia"="gemini",model?:string){
 const k=await key(provider);if(!k)throw Error("Add and test your "+provider+" key in Settings");
 if(provider==="gemini"){
 const m=model||(await models("gemini"))[0];if(!m)throw Error("No Gemini models available");
 const d=await call("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(m)+":generateContent",{"x-goog-api-key":k},{
 contents:[{parts:[{text:context+"\nUser: "+question}]}],generationConfig:{maxOutputTokens:1400}});
 return {answer:(d.candidates?.[0]?.content?.parts||[]).map((x:any)=>x.text||"").join(""),model:m};
 }
 const endpoint=provider==="groq"?"https://api.groq.com/openai/v1/chat/completions":"https://integrate.api.nvidia.com/v1/chat/completions";
 const m=model||(provider==="groq"?(await models("groq"))[0]:"meta/llama-3.1-8b-instruct");
 const d=await call(endpoint,{Authorization:"Bearer "+k},{model:m,messages:[{role:"system",content:context},{role:"user",content:question}],stream:false,max_tokens:1400});
 return {answer:String(d.choices?.[0]?.message?.content||""),model:m};
}
export async function deals(q:string){
 const k=await key("brave");if(!k)throw Error("Add your Brave Search key in Settings");
 const d=await call("https://api.search.brave.com/res/v1/web/search?q="+encodeURIComponent(q+" pricing plans offers promo codes")+"&count=12",{"X-Subscription-Token":k});
 return {query:q,items:(d.web?.results||[]).map((r:any)=>({url:r.url,canonical_url:r.url,title:r.title,description:r.description,site:String(r.url||"").split("/")[2],kind:"offer",verification:"unverified",prices:[],codes:[]})),search_enabled:true,cached:false,checked_at:new Date().toISOString(),message:"Source results are not verified checkout prices."};
}
