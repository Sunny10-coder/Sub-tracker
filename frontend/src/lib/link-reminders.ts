import * as Notifications from "expo-notifications";

export type ReminderChoice = "None" | "Tomorrow" | "In 3 days" | "Next week" | "In 30 days" | "Custom";
export const REMINDER_CHOICES: ReminderChoice[] = ["None", "Tomorrow", "In 3 days", "Next week", "In 30 days", "Custom"];

export function localDateAfter(days: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const p = (x: number) => String(x).padStart(2, "0");
  return [d.getFullYear(), p(d.getMonth() + 1), p(d.getDate())].join("-");
}

export function dateForChoice(choice: ReminderChoice, custom: string): string | undefined {
  const durations: Partial<Record<ReminderChoice, number>> = {
    Tomorrow: 1, "In 3 days": 3, "Next week": 7, "In 30 days": 30,
  };
  if (choice === "None") return undefined;
  if (choice === "Custom") return custom;
  const days = durations[choice];
  return days === undefined ? undefined : localDateAfter(days);
}

export function validateLocalDate(date: string, time = "09:00"): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  return day.getFullYear() === y && day.getMonth() === m - 1 && day.getDate() === d
    && new Date(date + "T" + time + ":00").getTime() > Date.now();
}

function notificationDate(date: string, time: string): Date {
  return new Date(date + "T" + time + ":00");
}

export async function scheduleLinkNotification(id: string, title: string, date: string, time = "09:00"): Promise<boolean> {
  if (!validateLocalDate(date, time)) return false;
  try {
    const permission = await Notifications.getPermissionsAsync();
    const allowed = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!allowed) return false;
    // Only remove previously scheduled reminders owned by this link, not unrelated notifications.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const entry of scheduled) {
      if (entry.content.data?.submind_link_id === id) {
        await Notifications.cancelScheduledNotificationAsync(entry.identifier);
      }
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: "SubMind · Saved link", body: title, data: { submind_link_id: id, link_id: id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notificationDate(date, time) } as any,
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelLinkNotification(id: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const entry of scheduled) {
      if (entry.content.data?.submind_link_id === id) {
        await Notifications.cancelScheduledNotificationAsync(entry.identifier);
      }
    }
  } catch {}
}
