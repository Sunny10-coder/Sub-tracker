// Turns server reminders (cancel-by dates, link reminders, offers, custom) into local phone
// notifications at 09:00 on the due date, so they fire even when the app is closed.
// The server is the source of truth: this only mirrors it, keyed by reminder id.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

const MAP_KEY = "notif_map_v1";
const CHANNEL = "reminders";
const NOTIFY_HOUR = 9;

type Reminder = { id: string; title: string; due_date?: string | null; completed?: boolean; remind_time?:string; kind?:string; ref_id?:string };
type NotifMap = Record<string, { key: string; nid: string }>;

let handlerSet = false;
function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
    }),
  });
}

async function readMap(): Promise<NotifMap> {
  const raw = await storage.getItem(MAP_KEY, "{}");
  try {
    return JSON.parse(String(raw)) as NotifMap;
  } catch {
    return {};
  }
}

async function ensurePermission(): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted) return true;
  if (!perm.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function syncReminderNotifications(reminders: Reminder[]): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    ensureHandler();
    if (!(await ensurePermission())) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Reminders", importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const map = await readMap();
    const live = new Set<string>();
    const now = Date.now();

    for (const r of reminders) {
      if (r.completed || !r.due_date) continue;
      const clock=/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(r.remind_time||""))?String(r.remind_time):`${String(NOTIFY_HOUR).padStart(2,"0")}:00`;
      const when = new Date(`${String(r.due_date).slice(0,10)}T${clock}:00`);
      if (Number.isNaN(when.getTime()) || when.getTime() <= now) continue;
      live.add(r.id);
      const key = `${r.title}|${r.due_date}|${clock}`;
      if (map[r.id]?.key === key) continue;   // already scheduled for this title and date
      if (map[r.id]) await Notifications.cancelScheduledNotificationAsync(map[r.id].nid);
      const nid = await Notifications.scheduleNotificationAsync({
        content: { title: "SubMind", body: r.title },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
      map[r.id] = { key, nid };
    }

    // Reminders that were completed, deleted or moved out of range no longer notify.
    for (const id of Object.keys(map)) {
      if (!live.has(id)) {
        await Notifications.cancelScheduledNotificationAsync(map[id].nid);
        delete map[id];
      }
    }
    await storage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // Notifications are best effort; the reminders list in the app is unaffected.
  }
}
