import { storage } from "@/src/utils/storage";

export type Provider = "gemini" | "groq" | "nvidia" | "brave";
type ChatProvider = Exclude<Provider, "brave">;
export const keyId = (p: Provider) => "submind.api-keys." + p;
export const AUTO_NVIDIA_MODEL = "auto";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1";

/**
 * NVIDIA Developer Program offers selected hosted endpoints for no-cost
 * prototyping, subject to account eligibility, quota and provider changes.
 * This is a preference order, NOT a promise that every model remains free.
 * Never hard-code retired meta/llama-3.1-8b-instruct as a default.
 */
export const NVIDIA_AGENT_PREFERENCES = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "deepseek-ai/deepseek-v4.1-flash",
] as const;
const LEGACY_NVIDIA = /(?:^meta\/llama-3\.1-8b-instruct$|^nvidia\/nemotron-3-super-120b-a12b$|^nvidia\/nemotron-3-nano-30b-a3b$|^openai\/gpt-oss-120b$)/i;
const NON_CHAT = /(embed|rerank|guard|safety|moderation|translate|whisper|audio|speech|tts|asr|image|video|stt|retrieval|vision|vlm|ocr|parse|protein|molmo)/i;

export class ProviderError extends Error {
  constructor(public readonly status: number, message: string) {
    super("Provider HTTP " + status + ": " + message);
    this.name = "ProviderError";
  }
}
export async function key(p: Provider) {
  return String(await storage.secureGet(keyId(p), "") || "").trim();
}
export async function call(url: string, headers: Record<string, string>, payload?: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const res = await fetch(url, {
      method: payload === undefined ? "GET" : "POST",
      headers: { Accept: "application/json", ...headers, ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { message: raw.slice(0, 250) }; }
    if (!res.ok) {
      const error = data?.error;
      const message = typeof error === "string" ? error :
        String(error?.message || data?.detail || data?.message || data?.title || "Request rejected");
      const clean = message.slice(0, 230);
      throw new ProviderError(res.status, res.status === 410
        ? "This model endpoint was retired (410). SubMind can try a currently listed model. " + clean
        : clean);
    }
    return data;
  } catch (e: any) {
    if (e?.name === "AbortError") throw Error("AI request timed out. Check the connection or choose another model.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
function allowedGeminiModel(m: any): boolean {
  const id = String(m?.name || "").replace(/^models\//, "").toLowerCase();
  return /^gemini-/.test(id)
    && (m?.supportedGenerationMethods || []).includes("generateContent")
    && !/(?:^|[-_.])2[.-]5(?:[-_.]|$)/.test(id)
    && !/(?:preview|experimental|(?:^|[-_.])exp(?:[-_.]|$)|(?:^|[-_.])latest(?:[-_.]|$)|embedding|native-audio|audio|image|live|tts)/.test(id);
}
function geminiScore(id: string): number {
  const v = id.match(/gemini-(\d+)(?:\.(\d+))?/);
  const version = v ? Number(v[1]) * 100 + Number(v[2] || 0) : 0;
  const tier = /flash/.test(id) ? (/lite/.test(id) ? 80 : 140) : /pro/.test(id) ? 40 : 0;
  return version * 10 + tier;
}
function orderedNvidia(list: string[]): string[] {
  const unique = Array.from(new Set(list.filter(x =>
    typeof x === "string" && x.includes("/") && !NON_CHAT.test(x) && !LEGACY_NVIDIA.test(x))));
  return unique.sort((a, b) => {
    const pa = NVIDIA_AGENT_PREFERENCES.indexOf(a as any);
    const pb = NVIDIA_AGENT_PREFERENCES.indexOf(b as any);
    if (pa >= 0 && pb >= 0) return pa - pb;
    if (pa >= 0) return -1;
    if (pb >= 0) return 1;
    const rank = (x: string) => /nemotron-3\.5/.test(x) ? 10 : /nemotron-3-ultra/.test(x) ? 9 :
      /deepseek-v4/.test(x) ? 8 : /(?:minimax-m2|kimi-k3|qwen3)/.test(x) ? 5 : 0;
    return rank(b) - rank(a) || a.localeCompare(b);
  });
}
async function listGemini(k: string): Promise<string[]> {
  const d = await call("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { "x-goog-api-key": k });
  return (d.models || []).filter(allowedGeminiModel).map((m: any) => String(m.name).replace(/^models\//, ""))
    .sort((a: string, b: string) => geminiScore(b) - geminiScore(a) || a.localeCompare(b));
}
async function listNvidia(k: string): Promise<string[]> {
  const d = await call(NVIDIA_URL + "/models", { Authorization: "Bearer " + k });
  return orderedNvidia((d.data || []).map((x: any) => String(x.id || "")));
}
export async function models(p: ChatProvider, rawKey?: string): Promise<string[]> {
  const k = rawKey?.trim() || await key(p);
  if (!k) throw Error("Add your " + p.toUpperCase() + " API key in Settings first.");
  if (p === "gemini") return listGemini(k);
  if (p === "nvidia") return listNvidia(k);
  const d = await call("https://api.groq.com/openai/v1/models", { Authorization: "Bearer " + k });
  return (d.data || []).map((m: any) => String(m.id))
    .filter((id: string) => !/(whisper|tts|guard|vision|audio|preview|deprecated)/i.test(id))
    .sort();
}
function choiceError(e: any): boolean {
  return e instanceof ProviderError && [404, 410, 422].includes(e.status);
}
function safeNvidiaError(e: any): Error {
  if (e instanceof ProviderError && e.status === 403) return Error(
    "NVIDIA key is recognised but chat inference is forbidden (403). Check Public API Endpoints access at build.nvidia.com and generate an API key for your organisation.");
  if (e instanceof ProviderError && e.status === 401) return Error(
    "NVIDIA API key is invalid or expired (401). Generate a new one at build.nvidia.com.");
  if (e instanceof ProviderError && e.status === 429) return Error(
    "NVIDIA free prototyping quota/rate limit was reached (429). Try later, or use Gemini/Groq.");
  return e;
}
function messageText(d: any): string {
  const content = d?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((x: any) => x?.text || "").join("").trim();
  return "";
}
/** Probe real text inference, not just GET /models: a retired model can be listed but return 410. */
async function nvidiaGenerate(k: string, model: string, messages: any[], max_tokens: number) {
  return call(NVIDIA_URL + "/chat/completions", { Authorization: "Bearer " + k },
    { model, messages, stream: false, max_tokens, temperature: 0.2 });
}
async function tryNvidia(k: string, messages: any[], chosen?: string, quickTest = false) {
  const current = await listNvidia(k);
  if (!current.length) throw Error("NVIDIA returned no compatible chat models. Check your API catalog permissions.");
  const requested = chosen && chosen !== AUTO_NVIDIA_MODEL ? chosen : undefined;
  // A user-selected retired model is attempted once, then replaced with live candidates.
  const options = requested ? [requested, ...current.filter(x => x !== requested)] : current;
  let obsolete = "";
  for (const id of options.slice(0, quickTest ? 5 : 6)) {
    try {
      const d = await nvidiaGenerate(k, id, messages, quickTest ? 128 : 1750);
      const answer = messageText(d);
      if (answer) return { answer, model: id, fallbackFrom: requested && requested !== id ? requested : null };
      // Thinking-only / blank model response is not useful for SubMind; try an alternative.
      obsolete = id + " returned no visible text";
    } catch (e: any) {
      if (choiceError(e)) { obsolete = id + " unavailable (" + e.status + ")"; continue; }
      throw safeNvidiaError(e);
    }
  }
  throw Error("No usable NVIDIA chat model responded. " + obsolete +
    ". Check your account's Free Endpoint permissions at build.nvidia.com or select another provider.");
}
export async function checkKey(p: Provider, raw?: string): Promise<string> {
  const k = raw?.trim() || await key(p);
  if (!k) throw Error("Enter an API key first.");
  if (p === "brave") {
    await call("https://api.search.brave.com/res/v1/web/search?q=subscription&count=1", { "X-Subscription-Token": k });
    return "Brave Search connected";
  }
  if (p === "nvidia") {
    const result = await tryNvidia(k, [{ role: "user", content: "Say READY in one word." }], undefined, true);
    return "NVIDIA chat verified with " + result.model + ". Free prototyping is subject to your NVIDIA quota.";
  }
  if (p === "gemini") {
    const allowed = await listGemini(k);
    if (!allowed.length) throw Error("No supported stable Gemini models are available. Gemini 2.5 and preview/experimental models are excluded.");
    const chosen = allowed[0];
    const d = await call("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(chosen) + ":generateContent",
      { "x-goog-api-key": k }, { contents: [{ parts: [{ text: "Reply READY." }] }], generationConfig: { maxOutputTokens: 80 } });
    const answer = (d.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || "").join("").trim();
    if (!answer) throw Error("Gemini connected but the selected model returned no readable text.");
    return "Gemini verified with " + chosen + ". Gemini 2.5 and all preview models are hidden.";
  }
  const list = await models("groq", k);
  if (!list.length) throw Error("No Groq text chat models are accessible with this key.");
  return "Groq key connected: " + list.length + " chat models available.";
}
export async function chat(question: string, context: string, provider: ChatProvider = "gemini", model?: string) {
  const k = await key(provider);
  if (!k) throw Error("Add and test your " + provider.toUpperCase() + " API key in Settings.");
  if (provider === "nvidia") return tryNvidia(k, [
    { role: "system", content: context }, { role: "user", content: question },
  ], model);
  if (provider === "gemini") {
    const allowed = await listGemini(k);
    const m = model && allowed.includes(model) ? model : allowed[0];
    if (!m) throw Error("No stable Gemini text model available. Gemini 2.5/preview models are excluded.");
    const d = await call("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent",
      { "x-goog-api-key": k }, { contents: [{ parts: [{ text: context + "\nUser: " + question }] }],
        generationConfig: { maxOutputTokens: 1800 } });
    const answer = (d.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || "").join("").trim();
    if (!answer) throw Error("Gemini returned no visible answer. Try another stable model.");
    return { answer, model: m };
  }
  const available = await models("groq");
  const m = model && available.includes(model) ? model : available[0];
  if (!m) throw Error("No accessible Groq chat models.");
  const d = await call("https://api.groq.com/openai/v1/chat/completions",
    { Authorization: "Bearer " + k }, { model: m,
      messages: [{ role: "system", content: context }, { role: "user", content: question }],
      stream: false, max_tokens: 1600 });
  const answer = messageText(d);
  if (!answer) throw Error("The selected Groq model returned no visible text.");
  return { answer, model: m };
}
export async function deals(q: string) {
  const k = await key("brave"); if (!k) throw Error("Add your Brave Search key in Settings.");
  const d = await call("https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(q + " pricing plans offers promo codes") + "&count=12",
    { "X-Subscription-Token": k });
  return { query: q, items: (d.web?.results || []).map((r: any) => ({
    url: r.url, canonical_url: r.url, title: r.title, description: r.description, site: String(r.url || "").split("/")[2],
    kind: "offer", verification: "unverified", prices: [], codes: [],
  })), search_enabled: true, cached: false, checked_at: new Date().toISOString(),
    message: "Source results are not verified checkout prices." };
}
