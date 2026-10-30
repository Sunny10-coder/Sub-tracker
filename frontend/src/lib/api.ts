// SubMind API client + React Query hooks. All calls go through EXPO_PUBLIC_BACKEND_URL/api.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  insights: () => req<any>("/insights"),
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
    const form = new FormData();
    form.append("file", { uri, name: "voice.m4a", type: "audio/mp4" } as any);
    const res = await fetch(`${BASE}/stt/transcribe`, { method: "POST", body: form as any });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// ------- hooks -------
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
    ["vault-dashboard", "accounts", "insights", "subscriptions", "inbox", "links", "watchlist", "reminders", "link-reminder", "graph"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
}
