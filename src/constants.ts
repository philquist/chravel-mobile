import { Platform } from "react-native";
import Constants from "expo-constants";

const DEFAULT_WEB_APP_URL = "https://chravel.app";

function resolveWebAppUrl(): string {
  const configuredUrl = Constants.expoConfig?.extra?.webAppUrl;
  const rawUrl =
    typeof configuredUrl === "string" && configuredUrl.trim().length > 0
      ? configuredUrl.trim()
      : DEFAULT_WEB_APP_URL;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") {
      return DEFAULT_WEB_APP_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_WEB_APP_URL;
  }
}

export const WEB_APP_URL = resolveWebAppUrl();

export const IS_TABLET = Platform.OS === "ios" && Platform.isPad === true;

/** Scale a dimension up for tablet screens (1.3x on iPad, 1x elsewhere). */
export function tabletScale(value: number): number {
  return IS_TABLET ? Math.round(value * 1.3) : value;
}

// Versioned native bridge marker consumed by the web bootstrap. Keep this
// aligned with window.ChravelNative.version so server/client detection agree.
export const NATIVE_BRIDGE_VERSION = "1.0.0";

// Custom user agent appended to WebView requests so the web app
// can detect it's running inside the native shell before JS bootstraps.
export const NATIVE_USER_AGENT_SUFFIX = `ChravelNative/${NATIVE_BRIDGE_VERSION}`;

// RevenueCat entitlement IDs — must match the web app's
// src/constants/revenuecat.ts and the RevenueCat dashboard.
export const ENTITLEMENTS = {
  explorer: "chravel_explorer",
  frequentChraveler: "chravel_frequent_chraveler",
} as const;

// Push notification payload types the backend sends.
export const PUSH_TYPES = [
  "chat_message",
  "chat",
  "trip_update",
  "poll_update",
  "task_update",
  "calendar_event",
  "broadcast",
  "broadcast_pinned",
] as const;

export type PushType = (typeof PUSH_TYPES)[number];

export const COLORS = {
  background: "#191817",
  brandBlue: "#3A60D0",
  foreground: "#FFFFFF",
} as const;

// Legal URLs — shown on the terms agreement screen before signup.
export const TERMS_URL = "https://chravel.app/terms";
export const PRIVACY_URL = "https://chravel.app/privacy";
