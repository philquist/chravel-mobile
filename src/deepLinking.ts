import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { WEB_APP_URL } from "./constants";
import { isAuthScreenUrl } from "./authUrl";

/**
 * Parse an incoming URL (universal link or custom scheme) into a
 * path the WebView should navigate to.
 *
 * Supported formats:
 *   chravel://trip/abc123          → /trip/abc123
 *   https://chravel.app/trip/abc   → /trip/abc
 */
export function parseDeepLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.protocol === "chravel:") {
      // For custom schemes, URL parser treats the part after :// as
      // the hostname (e.g. chravel://auth-callback/123 → host="auth-callback").
      // Reconstruct the full path from hostname + pathname.
      const host = parsed.hostname || "";
      const pathname = parsed.pathname || "";
      const fullPath = host ? `/${host}${pathname}` : pathname;
      const withQuery = fullPath + parsed.search + parsed.hash;
      if (withQuery.startsWith("//")) {
        return null;
      }
      return withQuery;
    }

    if (
      parsed.hostname === "chravel.app" ||
      parsed.hostname === "www.chravel.app"
    ) {
      const withQuery = parsed.pathname + parsed.search + parsed.hash;
      if (withQuery.startsWith("//")) {
        return null;
      }
      return withQuery;
    }

    // Do not return a bare pathname for other hosts: paths like "//evil.com/x"
    // would become scheme-relative URLs in buildWebViewLaunchUrl and escape
    // the chravel.app origin.
    return null;
  } catch {
    if (url.startsWith("chravel://")) {
      const path = url.replace("chravel://", "");
      const normalized = path.startsWith("/") ? path : `/${path}`;
      if (normalized.startsWith("//")) {
        return null;
      }
      return normalized;
    }
    return null;
  }
}

/** Single source of truth for native shell auth bootstrap route. */
export const AUTH_LAUNCH_PATH = "/auth";

/**
 * Canonical OAuth callback URI — the chravel:// custom scheme, used on ALL
 * platforms and iOS versions. ASWebAuthenticationSession (iOS) and Custom Tabs
 * (Android) natively capture a custom-scheme redirect and return it INTO the app
 * without opening external Safari. (We previously used an https://chravel.app
 * callback on iOS 17.4+ bound to webcredentials:chravel.app, but it proved
 * unreliable — the redirect could fail to return and bounce the user back to
 * login, App Store Guideline 2.1(a).)
 */
export const NATIVE_OAUTH_CALLBACK_URL = "chravel://auth-callback";

/**
 * Auth providers/callback handlers may return to multiple auth endpoints.
 * Treat only session-bearing paths as native auth returns — bare `/auth` is
 * the sign-in surface, not an OAuth callback.
 */
export function isNativeAuthReturnPath(path: string): boolean {
  if (path.startsWith("/auth-callback")) return true;
  if (path.startsWith("/auth/")) return true;
  if (path.startsWith("/auth#")) return true;

  if (path.startsWith("/auth?")) {
    try {
      const parsed = new URL(path, WEB_APP_URL);
      return (
        parsed.searchParams.has("code") ||
        parsed.searchParams.has("access_token") ||
        parsed.searchParams.has("error")
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * When notification cold-start routing and Linking.getInitialURL() both fire,
 * keep the path already captured synchronously (notification payloads include
 * thread/poll/task query params that a generic click URL may omit).
 */
export function preferExistingDeferredPath(
  existing: string | null,
  incoming: string | null,
): string | null {
  if (existing) return existing;
  return incoming;
}

/**
 * Rewrites Supabase/IdP authorize URLs so the OAuth redirect returns into the
 * native app's auth session via the chravel:// custom-scheme callback
 * (NATIVE_OAUTH_CALLBACK_URL — used on all platforms). Forcing redirect_to to
 * exactly the callback URL also normalizes the host (e.g. www.chravel.app →
 * chravel.app).
 */
export function rewriteOAuthUrlForNativeCallback(
  url: string,
  callbackUrl: string = NATIVE_OAUTH_CALLBACK_URL,
): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("redirect_to")) {
      return url;
    }
    parsed.searchParams.set("redirect_to", callbackUrl);
    return parsed.toString();
  } catch {
    return url;
  }
}


/**
 * Build a web URL for the in-app WebView.
 * Always appends app_context=native while preserving path/query/hash.
 */
export function buildWebViewLaunchUrl(path: string): string {
  let normalizedPath = path ? (path.startsWith("/") ? path : `/${path}`) : AUTH_LAUNCH_PATH;
  // Scheme-relative paths resolve against the wrong origin when passed to URL(base, origin).
  if (normalizedPath.startsWith("//")) {
    normalizedPath = AUTH_LAUNCH_PATH;
  }
  const target = new URL(normalizedPath, WEB_APP_URL);
  target.searchParams.set("app_context", "native");
  return target.toString();
}

/**
 * Build a stable per-build cache-bust token. Each EAS build bumps either
 * version or buildNumber/versionCode, so this token changes for every
 * shipped app — forcing WKWebView/Chrome WebView to refetch the HTML
 * document on cold launch and pick up any Vercel deploy that landed
 * since the previous app session.
 */
export function buildCacheBustParam(): string {
  const cfg = Constants.expoConfig;
  const rawVersion = cfg?.version;
  const version = typeof rawVersion === "string" && rawVersion ? rawVersion : "0.0.0";
  const iosBuild = cfg?.ios?.buildNumber;
  const androidBuild = cfg?.android?.versionCode;
  const build =
    typeof iosBuild === "string" && iosBuild
      ? iosBuild
      : typeof androidBuild === "number"
        ? String(androidBuild)
        : "0";
  return `${version}-${build}`;
}

/**
 * Native shell launch target contract: /auth?app_context=native.
 * Includes a per-build `_v` cache-bust token so a Vercel deploy is
 * picked up on the next cold launch even if WKWebView/Chrome cached
 * the previous HTML.
 */
export function buildNativeAuthLaunchUrl(): string {
  const base = buildWebViewLaunchUrl(AUTH_LAUNCH_PATH);
  const url = new URL(base);
  url.searchParams.set("_v", buildCacheBustParam());
  return url.toString();
}

/**
 * Get the URL the app was cold-started with, if any.
 */
export async function getInitialURL(): Promise<string | null> {
  const url = await Linking.getInitialURL();
  if (!url) return null;
  return parseDeepLinkUrl(url);
}

/**
 * Subscribe to incoming deep links while the app is running.
 * Returns an unsubscribe function.
 */
export function onDeepLink(
  callback: (path: string) => void
): () => void {
  const subscription = Linking.addEventListener("url", (event) => {
    const path = parseDeepLinkUrl(event.url);
    if (path) callback(path);
  });
  return () => subscription.remove();
}

export { isAuthScreenUrl };
