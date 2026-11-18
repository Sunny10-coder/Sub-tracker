/* Regression tests for Instagram content intelligence.
 * Run with: node scripts/check-instagram.cjs
 * No network calls, API keys, account login or test video downloads.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const ts=require("typescript");
const sourceRoot=path.resolve(__dirname,"..");
function load(file,requireMock){
  const src=fs.readFileSync(path.join(sourceRoot,file),"utf8");
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  const context={
    module,exports:module.exports,require:requireMock||require,
    URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,
    console,process,setTimeout,clearTimeout,fetch:global.fetch
  };
  vm.runInNewContext(js,context,{filename:file,timeout:3500});
  return module.exports;
}
const intel=load("src/lib/vault-intelligence.ts");
assert.equal(intel.canonicalUrl("https://www.instagram.com/reel/ABC123/?igsh=abc&utm_source=share"),
  "https://www.instagram.com/reel/ABC123");
assert.equal(intel.instagramPostInfo("https://www.instagram.com/reel/ABC123").type,"reel");
assert.equal(intel.instagramPostInfo("https://www.instagram.com/p/ABC123").type,"post");
const classified=intel.classifyLink("https://www.instagram.com/reel/ABC123/?igsh=social");
assert.equal(classified.kind,"instagram");
assert.equal(classified.title,"Instagram Reel");
assert.equal(classified.review_required,true);
assert.ok(classified.tags.includes("instagram")&&classified.tags.includes("reel"));
assert.ok(!classified.tags.includes("abc123"));
const subject=intel.instagramEvidenceTags("Industrial #SafetyTraining teaches crane lifting basics and helmets.");
assert.ok(subject.includes("safetytraining")&&subject.includes("crane"));
assert.deepEqual(Array.from(intel.instagramEvidenceTags("")),[]);
const mockStorage={getItem:async()=> "disabled"};
const fakeProviders={
  call:async()=>{throw Error("AI should not be contacted")},
  key:async()=>"",models:async()=>[],geminiSafeDefault:()=>null,isPaidGeminiModel:()=>true
};
const smart=load("src/lib/smart-link-intelligence.ts",name=>{
 if(name==="@/src/lib/vault-intelligence")return intel;
 if(name==="@/src/utils/storage")return {storage:mockStorage};
 if(name==="@/src/lib/direct-providers")return fakeProviders;
 throw Error("Unexpected module "+name);
});
const originalFetch=global.fetch;
async function withFetch(mock,fn){
 global.fetch=mock;
 // vm context captured its own fetch at load time, so reload analyzer below.
 const instance=load("src/lib/smart-link-intelligence.ts",name=>{
   if(name==="@/src/lib/vault-intelligence")return intel;
   if(name==="@/src/utils/storage")return {storage:mockStorage};
   if(name==="@/src/lib/direct-providers")return fakeProviders;
   throw Error("Unexpected module "+name);
 });
 try{return await fn(instance);}finally{global.fetch=originalFetch;}
}
function html(body){
 return async()=>({ok:true,redirected:false,
   headers:{get:(key)=>key==="content-type"?"text/html; charset=utf-8":null},
   text:async()=>body});
}
const url="https://www.instagram.com/reel/ABC123";
(async()=>{
 await withFetch(html('<html><head>'+
   '<meta property="og:title" content="Creative safety lesson (@safecreator)"/>'+
   '<meta property="og:description" content="25 likes, 4 comments - safecreator on Instagram: &quot;Crane inspection and lifting signals #cranesafety #training&quot;"/>'+
   '</head></html>'), async analyzer=>{
   const a=await analyzer.analyzePublicLink({...classified,url},false);
   assert.equal(a.analysis_basis,"caption");
   assert.equal(a.analysis_status,"analyzed");
   assert.ok(a.tags.includes("cranesafety"));
   assert.equal(a.instagram.media_analyzed,false);
   assert.match(a.instagram_caption,/Crane inspection/);
 });
 await withFetch(html('<html><head><title>Login • Instagram</title></head></html>'),
   async analyzer=>{
   const a=await analyzer.analyzePublicLink({...classified,url},false);
   assert.equal(a.analysis_basis,"url_only");
   assert.equal(a.analysis_status,"needs_review");
   assert.equal(a.instagram.media_analyzed,false);
   assert.ok(!a.tags.includes("cranesafety"));
   const b=await analyzer.analyzePublicLink({...classified,url,
     caption_text:"Emergency response team #firesafety"},
     false);
   assert.equal(b.analysis_basis,"user_caption");
   assert.ok(b.tags.includes("firesafety"));
   const c=await analyzer.analyzePublicLink({...classified,url,
     video_transcript:"Crane inspection checklist and warehouse risk assessment"},
     false);
   assert.equal(c.analysis_basis,"user_transcript");
   assert.ok(c.tags.includes("crane"));
   assert.equal(c.instagram.transcript_source,"user_supplied");
 });
 console.log("Instagram link intelligence checks passed");
})().catch(e=>{console.error(e);process.exitCode=1;});
