const platformMock = { OS: "ios" as "ios" | "android" };

jest.mock("react-native", () => ({
  get Platform() {
    return platformMock;
  },
}));

import {
  parseNotificationPayload,
  getNotificationDeepLink,
  getChannelForPushType,
  IOS_NOTIFICATION_CATEGORIES,
  registerForPushNotifications,
  clearNotificationBadge,
} from "../notifications";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  addNotificationResponseReceivedListener: jest.fn(),
}));

jest.mock("expo-device", () => ({
  isDevice: true,
}));

import * as Notifications from "expo-notifications";

describe("parseNotificationPayload", () => {
  it("parses a valid chat_message payload", () => {
    const data = { type: "chat_message", tripId: "trip-123", threadId: "t-1" };
    const result = parseNotificationPayload(data);
    expect(result).toEqual(data);
  });

  it("parses all valid push types", () => {
    const types = ["chat_message", "chat", "trip_update", "poll_update", "task_update", "calendar_event", "broadcast", "broadcast_pinned"];
    for (const type of types) {
      const result = parseNotificationPayload({ type, tripId: "trip-1" });
      expect(result).not.toBeNull();
      expect(result!.type).toBe(type);
    }
  });

  it("returns null for missing type", () => {
    expect(parseNotificationPayload({ tripId: "trip-1" })).toBeNull();
  });

  it("returns null for missing tripId", () => {
    expect(parseNotificationPayload({ type: "chat_message" })).toBeNull();
  });

  it("returns null for unknown type", () => {
    expect(parseNotificationPayload({ type: "unknown_type", tripId: "trip-1" })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseNotificationPayload(null as any)).toBeNull();
  });

  it("returns null for non-string type", () => {
    expect(parseNotificationPayload({ type: 123, tripId: "trip-1" })).toBeNull();
  });
});

describe("getNotificationDeepLink", () => {
  it("returns chat path for chat_message", () => {
    expect(getNotificationDeepLink({ type: "chat_message", tripId: "t1" })).toBe("/trip/t1?tab=chat");
  });

  it("returns chat path with thread for chat_message", () => {
    expect(getNotificationDeepLink({ type: "chat_message", tripId: "t1", threadId: "th1" })).toBe(
      "/trip/t1?tab=chat&thread=th1"
    );
  });

  it("returns chat path for chat alias", () => {
    expect(getNotificationDeepLink({ type: "chat", tripId: "t1" })).toBe("/trip/t1?tab=chat");
  });

  it("returns calendar path for calendar_event", () => {
    expect(getNotificationDeepLink({ type: "calendar_event", tripId: "t1" })).toBe("/trip/t1?tab=calendar");
  });

  it("returns calendar path with event for calendar_event", () => {
    expect(getNotificationDeepLink({ type: "calendar_event", tripId: "t1", eventId: "e1" })).toBe(
      "/trip/t1?tab=calendar&event=e1"
    );
  });

  it("returns chat path for poll_update", () => {
    expect(getNotificationDeepLink({ type: "poll_update", tripId: "t1", pollId: "p1" })).toBe(
      "/trip/t1?tab=chat&poll=p1"
    );
  });

  it("returns chat path for task_update", () => {
    expect(getNotificationDeepLink({ type: "task_update", tripId: "t1", taskId: "tk1" })).toBe(
      "/trip/t1?tab=chat&task=tk1"
    );
  });

  it("returns chat path for broadcast", () => {
    expect(getNotificationDeepLink({ type: "broadcast", tripId: "t1" })).toBe("/trip/t1?tab=chat");
  });

  it("returns chat path for broadcast_pinned", () => {
    expect(getNotificationDeepLink({ type: "broadcast_pinned", tripId: "t1" })).toBe("/trip/t1?tab=chat");
  });

  it("returns trip path for trip_update", () => {
    expect(getNotificationDeepLink({ type: "trip_update", tripId: "t1" })).toBe("/trip/t1");
  });



  it("accepts APNs-style kebab-case keys for route IDs", () => {
    expect(getNotificationDeepLink({ type: "chat_message", tripId: "t1", "thread-id": "th-kebab" })).toBe(
      "/trip/t1?tab=chat&thread=th-kebab"
    );
    expect(getNotificationDeepLink({ type: "task_update", tripId: "t1", task_id: "task-snake" })).toBe(
      "/trip/t1?tab=chat&task=task-snake"
    );
  });

  it("prefers canonical camelCase keys when duplicates exist", () => {
    expect(
      getNotificationDeepLink({
        type: "chat_message",
        tripId: "t1",
        threadId: "thread-camel",
        "thread-id": "thread-kebab",
      })
    ).toBe("/trip/t1?tab=chat&thread=thread-camel");
  });
  it("returns null for invalid payload", () => {
    expect(getNotificationDeepLink({ foo: "bar" })).toBeNull();
  });
});

describe("getChannelForPushType", () => {
  it("routes chat_message and chat to chat-messages", () => {
    expect(getChannelForPushType("chat_message")).toBe("chat-messages");
    expect(getChannelForPushType("chat")).toBe("chat-messages");
  });

  it("routes broadcasts to important-updates", () => {
    expect(getChannelForPushType("broadcast")).toBe("important-updates");
    expect(getChannelForPushType("broadcast_pinned")).toBe("important-updates");
  });

  it("routes other typed pushes to default", () => {
    expect(getChannelForPushType("trip_update")).toBe("default");
    expect(getChannelForPushType("poll_update")).toBe("default");
    expect(getChannelForPushType("task_update")).toBe("default");
    expect(getChannelForPushType("calendar_event")).toBe("default");
  });

  it("falls back to default for unknown types", () => {
    expect(getChannelForPushType("unknown")).toBe("default");
    expect(getChannelForPushType("")).toBe("default");
  });
});

describe("registerForPushNotifications platform setup", () => {
  const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
  const mockGetToken = Notifications.getDevicePushTokenAsync as jest.Mock;
  const mockSetCategory = Notifications.setNotificationCategoryAsync as jest.Mock;
  const mockSetChannel = Notifications.setNotificationChannelAsync as jest.Mock;

  beforeEach(() => {
    mockGetPermissions.mockReset();
    mockGetToken.mockReset();
    mockSetCategory.mockReset();
    mockSetChannel.mockReset();
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "test-token" });
    mockSetCategory.mockResolvedValue(undefined);
    mockSetChannel.mockResolvedValue(undefined);
  });

  it("registers all three iOS categories when running on iOS", async () => {
    platformMock.OS = "ios";
    const result = await registerForPushNotifications();
    expect(result.token).toBe("test-token");

    const identifiers = mockSetCategory.mock.calls.map((call) => call[0]);
    expect(identifiers).toEqual(
      expect.arrayContaining([
        IOS_NOTIFICATION_CATEGORIES.CHAT_MESSAGE,
        IOS_NOTIFICATION_CATEGORIES.BROADCAST,
        IOS_NOTIFICATION_CATEGORIES.BROADCAST_PINNED,
      ]),
    );
    expect(identifiers).toHaveLength(3);
    // iOS path must NOT create Android channels.
    expect(mockSetChannel).not.toHaveBeenCalled();
  });

  it("CHAT_MESSAGE category exposes REPLY (text input) and MARK_READ actions", async () => {
    platformMock.OS = "ios";
    await registerForPushNotifications();
    const chatCall = mockSetCategory.mock.calls.find(
      (call) => call[0] === IOS_NOTIFICATION_CATEGORIES.CHAT_MESSAGE,
    );
    expect(chatCall).toBeDefined();
    const actions = chatCall![1] as Array<{ identifier: string; textInput?: unknown }>;
    const reply = actions.find((a) => a.identifier === "REPLY");
    const markRead = actions.find((a) => a.identifier === "MARK_READ");
    expect(reply).toBeDefined();
    expect(reply!.textInput).toBeDefined();
    expect(markRead).toBeDefined();
  });

  it("does NOT register iOS categories when running on Android", async () => {
    platformMock.OS = "android";
    await registerForPushNotifications();
    expect(mockSetCategory).not.toHaveBeenCalled();
    // Android path creates the three notification channels instead.
    const channelIds = mockSetChannel.mock.calls.map((call) => call[0]);
    expect(channelIds).toEqual(
      expect.arrayContaining(["default", "chat-messages", "important-updates"]),
    );
  });

  it("does not prompt when promptIfNeeded is false and permission is undetermined", async () => {
    platformMock.OS = "ios";
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    const mockRequest = Notifications.requestPermissionsAsync as jest.Mock;

    const result = await registerForPushNotifications({ promptIfNeeded: false });

    expect(result.token).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("still returns the token without prompting when already granted", async () => {
    platformMock.OS = "ios";
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    const mockRequest = Notifications.requestPermissionsAsync as jest.Mock;

    const result = await registerForPushNotifications({ promptIfNeeded: false });

    expect(result.token).toBe("test-token");
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("clearNotificationBadge", () => {
  const mockSetBadge = Notifications.setBadgeCountAsync as jest.Mock;
  const mockDismissAll = Notifications.dismissAllNotificationsAsync as jest.Mock;

  beforeEach(() => {
    mockSetBadge.mockReset().mockResolvedValue(true);
    mockDismissAll.mockReset().mockResolvedValue(undefined);
  });

  it("resets the badge count and dismisses delivered notifications", async () => {
    await clearNotificationBadge();
    expect(mockSetBadge).toHaveBeenCalledWith(0);
    expect(mockDismissAll).toHaveBeenCalled();
  });

  it("swallows errors from the badge APIs", async () => {
    mockSetBadge.mockRejectedValue(new Error("unsupported"));
    await expect(clearNotificationBadge()).resolves.toBeUndefined();
  });
});
