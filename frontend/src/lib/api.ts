// SubMind API client + React Query hooks. All calls go through EXPO_PUBLIC_BACKEND_URL/api.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storage } from "@/src/utils/storage";
import { getVault, localRequest } from "@/src/lib/local-vault";
import * as direct from "@/src/lib/direct-providers";

async function req<T>(path:string,opts?:RequestInit):Promise<T>{
 if(path.startsWith("/deals/search")){const q=new URLSearchParams(path.split("?")[1]||"");return direct.deals(q.get("q")||"") as T}
 if(path==="/ai/chat"){const question=JSON.parse(String(opts?.body||"{}")).question;const vault=await getVault();
 const context="You are SubMind. Answer strictly from provided user records when discussing account status, renewals or spending. If unknown say unknown. Do not assume prices or billing. Private data:\n"+JSON.stringify({subscriptions:vault.subscriptions.slice(0,250),accounts:vault.accounts.slice(0,150),benefits:vault.benefits.slice(0,100)}).slice(0,24000);
 return direct.chat(question,context) as T}
 if(path==="/ai/chat/history")return [] as T;
 return localRequest<T>(path,opts);
}
export const api = {
  health: () => req<any>("/"),
  insights: () => req<any>("/insights"),
  dealsSearch: (q: string, mode = "all", refresh = false) => req<any>(`/deals/search?q=${encodeURIComponent(q)}&mode=${mode}&refresh=${refresh}`),
  inspectDeal: (url: string) => req<any>("/deals/inspect", { method: "POST", body: JSON.stringify({ url }) }),
  promoCodes: () => req<any[]>("/deals/codes"),
  savePromoCode: (b: any) => req<any>("/deals/codes", { method: "POST", body: JSON.stringify(b) }),
  priceHistory: (provider = "") => req<any[]>(`/deals/price-history?provider=${encodeURIComponent(provider)}`),
  trackPrice: (b: any) => req<any>("/deals/track-price", { method: "POST", body: JSON.stringify(b) }),
  vaultDashboard: () => req<any>("/vault/dashboard"),
  accounts: () => req<any[]>("/accounts"),
  createAccount: (b: any) => req<any>("/accounts", { method: "POST", body: JSON.stringify(b) }),
  updateAccount: (id: string, b: any) => req<any>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteAccount: (id: string) => req<any>(`/accounts/${id}`, { method: "DELETE" }),
  checkDuplicate: (b: any) => req<any>("/subscriptions/check-duplicate", { method: "POST", body: JSON.stringify(b) }),
  subscriptions: (status?: string, category?: string) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (category) p.set("category", category);
    return req<any[]>(`/subscriptions?${p.toString()}`);
  },
  subscription: (id: string) => req<any>(`/subscriptions/${id}`),
  createSubscription: (b: any) => req<any>("/subscriptions", { method: "POST", body: JSON.stringify(b) }),
  updateSubscription: (id: string, b: any) => req<any>(`/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSubscription: (id: string) => req<any>(`/subscriptions/${id}`, { method: "DELETE" }),
  recordPayment: (id: string, b: any) => req<any>(`/subscriptions/${id}/payment`, { method: "POST", body: JSON.stringify(b) }),

  inbox: (tab: string) => req<any[]>(`/inbox?tab=${tab}`),
  inboxAction: (id: string, b: any) => req<any>(`/inbox/${id}/action`, { method: "POST", body: JSON.stringify(b) }),

  links: (source?: string) => req<any[]>(`/links${source && source !== "All" ? `?source=${source}` : ""}`),
  link: (id: string) => req<any>(`/links/${id}`),
  linkReminder: (id: string) => req<any>(`/links/${id}/reminder`),
  putLinkReminder: (id: string, b: any) => req<any>(`/links/${id}/reminder`, {method: "PUT", body: JSON.stringify(b)}),
  updateLink: (id: string, b: any) => req<any>(`/links/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteLink: (id: string) => req<any>(`/links/${id}`, { method: "DELETE" }),

  watchlist: () => req<any[]>("/watchlist"),
  plan: (id: string) => req<any>(`/watchlist/${id}`),
  createPlan: (b: any) => req<any>("/watchlist", { method: "POST", body: JSON.stringify(b) }),
  deletePlan: (id: string) => req<any>(`/watchlist/${id}`, { method: "DELETE" }),
  convertPlan: (id: string) => req<any>(`/watchlist/${id}/convert`, { method: "POST" }),

  reminders: () => req<any[]>("/reminders"),
  createReminder: (b: any) => req<any>("/reminders", { method: "POST", body: JSON.stringify(b) }),
  updateReminder: (id: string, b: any) => req<any>(`/reminders/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteReminder: (id: string) => req<any>(`/reminders/${id}`, { method: "DELETE" }),

  ingestText: (text: string, source = "manual") => req<any>("/ingest/text", { method: "POST", body: JSON.stringify({ text, source }) }),
  ingestImage: (image_base64: string, source = "screenshot") => req<any>("/ingest/image", { method: "POST", body: JSON.stringify({ image_base64, source }) }),
  ingestLink: (url: string, source = "share", text = "", reminder?: {reminder_date?: string; reminder_time?: string; reminder_title?: string}) => req<any>("/ingest/link", { method: "POST", body: JSON.stringify({ url, source, text, ...reminder }) }),

  graph: () => req<any>("/graph"),
  search: (q: string) => req<any>(`/search?q=${encodeURIComponent(q)}`),
  chat: (question: string) => req<any>("/ai/chat", { method: "POST", body: JSON.stringify({ question }) }),
  chatHistory: () => req<any[]>("/ai/chat/history"),
  compare: (ids: string[]) => req<any>("/ai/compare", { method: "POST", body: JSON.stringify({ ids }) }),

  settings: () => req<any>("/settings"),
  patchSettings: (b: any) => req<any>("/settings", { method: "PATCH", body: JSON.stringify(b) }),

  transcribe: async (uri: string): Promise<{ text: string }> => {
    throw Error("Voice transcription is not yet configured without a backend.");
/*
    const form = new FormData();
    form.append("file", { uri, name: "voice.m4a", type: "audio/mp4" } as any);
    const baseUrl = await getBackendUrl();
    if (!baseUrl) throw new Error("Backend not configured. Open Server Setup.");
    const res = await fetch(`${baseUrl}/api/stt/transcribe`, { method: "POST", body: form as any });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
*/  },
};

// ------- hooks -------
export const usePromoCodes = () => useQuery({ queryKey: ["promo-codes"], queryFn: api.promoCodes });
export const usePriceHistory = (provider = "") => useQuery({ queryKey: ["price-history", provider], queryFn: () => api.priceHistory(provider) });
export const useVaultDashboard = () => useQuery({ queryKey: ["vault-dashboard"], queryFn: api.vaultDashboard });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
export const useInsights = () => useQuery({ queryKey: ["insights"], queryFn: api.insights });
export const useSubscriptions = (status?: string, category?: string) =>
  useQuery({ queryKey: ["subscriptions", status, category], queryFn: () => api.subscriptions(status, category) });
export const useSubscription = (id: string) =>
  useQuery({ queryKey: ["subscription", id], queryFn: () => api.subscription(id), enabled: !!id });
export const useInbox = (tab: string) => useQuery({ queryKey: ["inbox", tab], queryFn: () => api.inbox(tab) });
export const useLinks = (source?: string) => useQuery({ queryKey: ["links", source], queryFn: () => api.links(source) });
export const useLinkReminder = (id: string) => useQuery({ queryKey: ["link-reminder", id], queryFn: () => api.linkReminder(id), enabled: !!id });
export const useLink = (id: string) => useQuery({ queryKey: ["link", id], queryFn: () => api.link(id), enabled: !!id });
export const useWatchlist = () => useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist });
export const usePlan = (id: string) => useQuery({ queryKey: ["plan", id], queryFn: () => api.plan(id), enabled: !!id });
export const useReminders = () => useQuery({ queryKey: ["reminders"], queryFn: api.reminders });
export const useGraph = () => useQuery({ queryKey: ["graph"], queryFn: api.graph });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    ["promo-codes", "price-history", "vault-dashboard", "accounts", "insights", "subscriptions", "inbox", "links", "watchlist", "reminders", "link-reminder", "graph"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
}
