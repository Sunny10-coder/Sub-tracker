// SubMind API client + React Query hooks. All calls go through <server>/api.
// The server URL is the build-time EXPO_PUBLIC_BACKEND_URL unless the user has set one
// in Settings (stored on device), so an installed APK can be pointed at any backend.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { storage } from "@/src/utils/storage";

const SERVER_KEY = "server_url";
const BUILD_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
let serverUrl = BUILD_URL;

export function normalizeServerUrl(raw: string): string {
  let u = (raw || "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export const getServerUrl = () => serverUrl;
export const getBuildServerUrl = () => BUILD_URL;

// Called once at startup (root layout) before any request is made.
export async function initServerUrl(): Promise<string> {
  const saved = await storage.getItem(SERVER_KEY, "");
  if (typeof saved === "string" && saved) serverUrl = saved;
  return serverUrl;
}

export async function setServerUrl(raw: string): Promise<string> {
  serverUrl = normalizeServerUrl(raw) || BUILD_URL;
  await storage.setItem(SERVER_KEY, normalizeServerUrl(raw));
  return serverUrl;
}

export async function pingServer(raw?: string): Promise<boolean> {
  const base = raw === undefined ? serverUrl : normalizeServerUrl(raw);
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/`);
    return res.ok;
  } catch {
    return false;
  }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  if (!serverUrl) throw new Error("No server set. Open Settings and enter your SubMind server address.");
  const res = await fetch(`${serverUrl}/api${path}`, {
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
  inboxItem: (id: string) => req<any>(`/inbox/${id}`),
  inboxReanalyze: (id: string) => req<any>(`/inbox/${id}/reanalyze`, { method: "POST" }),
  inboxAction: (id: string, b: any) => req<any>(`/inbox/${id}/action`, { method: "POST", body: JSON.stringify(b) }),

  links: (source?: string) => req<any[]>(`/links${source && source !== "All" ? `?source=${encodeURIComponent(source)}` : ""}`),
  linkTags: () => req<{ tag: string; count: number }[]>("/links/tags"),
  link: (id: string) => req<any>(`/links/${id}`),
  linkOpened: (id: string) => req<any>(`/links/${id}/opened`, { method: "POST" }),
  linkRemind: (id: string, b: { days?: number; date?: string; title?: string }) =>
    req<any>(`/links/${id}/remind`, { method: "POST", body: JSON.stringify(b) }),
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
  ingestLink: (url: string, source = "share", text = "", extra: { tags?: string[]; remind_in_days?: number } = {}) =>
    req<any>("/ingest/link", { method: "POST", body: JSON.stringify({ url, source, text, ...extra }) }),
  ingestEmail: (b: { subject?: string; sender?: string; to?: string; body: string }) =>
    req<any>("/ingest/email", { method: "POST", body: JSON.stringify(b) }),

  memory: () => req<any>("/memory/dashboard"),

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
    const res = await fetch(`${serverUrl}/api/stt/transcribe`, { method: "POST", body: form as any });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// ------- hooks -------
export const useInsights = () => useQuery({ queryKey: ["insights"], queryFn: api.insights });
export const useSubscriptions = (status?: string, category?: string) =>
  useQuery({ queryKey: ["subscriptions", status, category], queryFn: () => api.subscriptions(status, category) });
export const useSubscription = (id: string) =>
  useQuery({ queryKey: ["subscription", id], queryFn: () => api.subscription(id), enabled: !!id });
export const useInbox = (tab: string) => useQuery({ queryKey: ["inbox", tab], queryFn: () => api.inbox(tab) });
export const useLinks = (source?: string) => useQuery({ queryKey: ["links", source], queryFn: () => api.links(source) });
export const useLinkTags = () => useQuery({ queryKey: ["linkTags"], queryFn: api.linkTags });
export const useInboxItem = (id: string) => useQuery({ queryKey: ["inboxItem", id], queryFn: () => api.inboxItem(id), enabled: !!id });
export const useMemory = () => useQuery({ queryKey: ["memory"], queryFn: api.memory });
export const useLink = (id: string) => useQuery({ queryKey: ["link", id], queryFn: () => api.link(id), enabled: !!id });
export const useWatchlist = () => useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist });
export const usePlan = (id: string) => useQuery({ queryKey: ["plan", id], queryFn: () => api.plan(id), enabled: !!id });
export const useReminders = () => useQuery({ queryKey: ["reminders"], queryFn: api.reminders });
export const useGraph = () => useQuery({ queryKey: ["graph"], queryFn: api.graph });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    ["insights", "subscriptions", "inbox", "links", "linkTags", "watchlist", "reminders", "graph", "memory", "inboxItem", "link"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
}
