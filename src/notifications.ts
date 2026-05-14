import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { PUSH_TYPES, type PushType, COLORS } from "./constants";

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

/**
 * Register for push notifications. Returns the native APNs/FCM token
 * (not the Expo push token) since the Chravel backend sends pushes
 * directly via APNs/FCM.
 */
export async function registerForPushNotifications(): Promise<PushTokenResult> {
  if (!Device.isDevice) {
    return { token: null, error: "Push notifications require a physical device" };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return { token: null, error: "Permission not granted" };
  }

  // Android requires a notification channel.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.brandBlue,
    });
  }

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
      return `/trip/${tripId}?tab=chat`;
    case "trip_update":
    default:
      return `/trip/${tripId}`;
  }
}
