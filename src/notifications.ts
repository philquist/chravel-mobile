import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { PUSH_TYPES, type PushType, COLORS } from "./constants";

export type AndroidChannelId = "default" | "chat-messages" | "important-updates";

/**
 * Map a Chravel push type to the Android notification channel it should
 * route to. Backend payloads should set `android.channel_id` to this
 * value so a deploy of a new push type doesn't silently fall through to
 * "default".
 */
export function getChannelForPushType(type: string): AndroidChannelId {
  if (type === "chat" || type === "chat_message") return "chat-messages";
  if (type === "broadcast" || type === "broadcast_pinned") return "important-updates";
  return "default";
}

/**
 * iOS notification category identifiers. The backend includes one of
 * these as `aps.category` so iOS renders the right quick-actions on the
 * lock screen / banner.
 */
export const IOS_NOTIFICATION_CATEGORIES = {
  CHAT_MESSAGE: "CHAT_MESSAGE",
  BROADCAST: "BROADCAST",
  BROADCAST_PINNED: "BROADCAST_PINNED",
} as const;

export type IosNotificationCategory =
  (typeof IOS_NOTIFICATION_CATEGORIES)[keyof typeof IOS_NOTIFICATION_CATEGORIES];

async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Promise.all([
    Notifications.setNotificationChannelAsync("default", {
      name: "General",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.brandBlue,
    }),
    Notifications.setNotificationChannelAsync("chat-messages", {
      name: "Chat messages",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 150, 100, 150],
      lightColor: "#2ECC71",
    }),
    Notifications.setNotificationChannelAsync("important-updates", {
      name: "Broadcast & pinned",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300],
      lightColor: "#F59E0B",
    }),
  ]);
}

async function ensureIosNotificationCategories(): Promise<void> {
  if (Platform.OS !== "ios") return;

  await Promise.all([
    Notifications.setNotificationCategoryAsync(IOS_NOTIFICATION_CATEGORIES.CHAT_MESSAGE, [
      {
        identifier: "REPLY",
        buttonTitle: "Reply",
        textInput: { submitButtonTitle: "Send", placeholder: "Message" },
        options: { opensAppToForeground: false },
      },
      {
        identifier: "MARK_READ",
        buttonTitle: "Mark as Read",
        options: { opensAppToForeground: false },
      },
    ]),
    Notifications.setNotificationCategoryAsync(IOS_NOTIFICATION_CATEGORIES.BROADCAST, [
      {
        identifier: "VIEW",
        buttonTitle: "View",
        options: { opensAppToForeground: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync(IOS_NOTIFICATION_CATEGORIES.BROADCAST_PINNED, [
      {
        identifier: "VIEW",
        buttonTitle: "View",
        options: { opensAppToForeground: true },
      },
    ]),
  ]);
}

// Configure how notifications appear when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushTokenResult {
  token: string | null;
  error?: string;
}

export interface RegisterPushOptions {
  /**
   * When false, never shows the OS permission prompt — only returns a token
   * if permission was already granted. Used for the proactive on-launch
   * registration so we don't prompt before the PushPrePrompt screen does.
   * Defaults to true (web-driven `push:register` may prompt).
   */
  promptIfNeeded?: boolean;
}

/**
 * Register for push notifications. Returns the native APNs/FCM token
 * (not the Expo push token) since the Chravel backend sends pushes
 * directly via APNs (iOS) / FCM (Android).
 */
export async function registerForPushNotifications(
  options: RegisterPushOptions = {},
): Promise<PushTokenResult> {
  const { promptIfNeeded = true } = options;

  if (!Device.isDevice) {
    return { token: null, error: "Push notifications require a physical device" };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    if (!promptIfNeeded) {
      return { token: null, error: "Permission not granted" };
    }
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return { token: null, error: "Permission not granted" };
  }

  await Promise.all([
    ensureAndroidNotificationChannels(),
    ensureIosNotificationCategories(),
  ]);

  try {
    // Get the native device token (APNs on iOS, FCM on Android).
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return { token: tokenData.data as string };
  } catch (err) {
    return {
      token: null,
      error: err instanceof Error ? err.message : "Failed to get push token",
    };
  }
}

/**
 * Clear the app-icon badge and dismiss any delivered notifications.
 * Called when the app returns to the foreground so the badge count
 * (set from `aps.badge`) doesn't linger after the user has seen things.
 */
export async function clearNotificationBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // Badge/notification APIs can throw on unsupported platforms — ignore.
  }
}

/**
 * Parse a notification's data payload into a Chravel-typed structure.
 */
export function parseNotificationPayload(
  data: Record<string, unknown>
): { type: PushType; tripId: string; [key: string]: unknown } | null {
  if (!data) return null;

  const type = typeof data.type === "string" ? data.type : null;
  const tripId = typeof data.tripId === "string" ? data.tripId : null;

  if (!type || !tripId) {
    return null;
  }

  if (!PUSH_TYPES.includes(type as PushType)) {
    return null;
  }

  return { ...data, type, tripId } as { type: PushType; tripId: string };
}

/**
 * Normalize route-affecting IDs from provider-specific key variants.
 * APNs can contain kebab-case keys such as thread-id while backend JSON often uses camelCase.
 */
function getPayloadId(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Build a deep link path from a notification payload.
 * Used to navigate the WebView when a notification is tapped.
 */
export function getNotificationDeepLink(
  data: Record<string, unknown>
): string | null {
  const payload = parseNotificationPayload(data);
  if (!payload) return null;

  const { type, tripId } = payload as Record<string, string>;
  const threadId = getPayloadId(payload, "threadId", "thread_id", "thread-id");
  const eventId = getPayloadId(payload, "eventId", "event_id", "event-id");
  const pollId = getPayloadId(payload, "pollId", "poll_id", "poll-id");
  const taskId = getPayloadId(payload, "taskId", "task_id", "task-id");

  switch (type) {
    case "chat_message":
    case "chat":
      return threadId
        ? `/trip/${tripId}?tab=chat&thread=${threadId}`
        : `/trip/${tripId}?tab=chat`;
    case "calendar_event":
      return eventId
        ? `/trip/${tripId}?tab=calendar&event=${eventId}`
        : `/trip/${tripId}?tab=calendar`;
    case "poll_update":
      return pollId
        ? `/trip/${tripId}?tab=chat&poll=${pollId}`
        : `/trip/${tripId}?tab=chat`;
    case "task_update":
      return taskId
        ? `/trip/${tripId}?tab=chat&task=${taskId}`
        : `/trip/${tripId}?tab=chat`;
    case "broadcast":
    case "broadcast_pinned":
      return `/trip/${tripId}?tab=chat`;
    case "trip_update":
    default:
      return `/trip/${tripId}`;
  }
}
