const ALLOWED_WEB_HOSTS = new Set(["chravel.app", "www.chravel.app"]);

const ALLOWED_HOSTS = [
  "supabase.co",
  "js.stripe.com",
  "checkout.stripe.com",
  "api.stripe.com",
  "maps.googleapis.com",
  "maps.google.com",
];

/** Exact host or a subdomain of `allowedHost` (rejects look-alikes like evilsupabase.co). */
function hostnameMatchesAllowedHost(hostname: string, allowedHost: string): boolean {
  if (hostname === allowedHost) return true;
  return hostname.endsWith(`.${allowedHost}`);
}

export interface RequestPolicyInput {
  url: string;
  isTopFrame?: boolean;
  platformOS: string;
}

export interface RequestPolicyResult {
  allowInWebView: boolean;
  externalUrlToOpen?: string;
  openInAppBrowser?: boolean;
  useAuthSession?: boolean;
}

function isAllowedChravelWebOrigin(url: string): boolean {
  if (url.startsWith("about:") || url.startsWith("data:")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      ALLOWED_WEB_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Identifies URLs that must be opened via an OS auth session
 * (ASWebAuthenticationSession / Custom Tabs Intent) so the IdP can
 * redirect back to chravel://auth-callback. Used both for WebView-initiated
 * navigations and for explicit `Capacitor.Plugins.Browser.open`/
 * `ChravelNative.openOAuthUrl` calls from the web app.
 *
 * Uses strict URL parsing rather than substring matching so URLs like
 * `https://evil.com/?accounts.google.com=true` or
 * `https://accounts.google.com.evil.com/` do not get routed through the
 * auth session with our chravel://auth-callback redirect.
 */
function normalizeUrlPathname(pathname: string): string {
  // WHATWG URLs preserve trailing slashes (e.g. /auth/v1/authorize/ vs /auth/v1/authorize).
  // Supabase and some proxies emit a trailing slash; strict equality would skip OAuth routing.
  if (pathname.length <= 1) return pathname;
  return pathname.replace(/\/+$/, "");
}

export function isOAuthAuthorizeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;

    if (host === "accounts.google.com") return true;
    if (host === "appleid.apple.com") return true;

    if (
      host.endsWith(".supabase.co") &&
      normalizeUrlPathname(parsed.pathname) === "/auth/v1/authorize"
    ) {
      const provider = parsed.searchParams.get("provider");
      if (provider === "google" || provider === "apple") return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function evaluateWebViewRequestPolicy({
  url,
  isTopFrame,
  platformOS,
}: RequestPolicyInput): RequestPolicyResult {
  if (isTopFrame === false) {
    return { allowInWebView: true };
  }

  if (isAllowedChravelWebOrigin(url)) {
    return { allowInWebView: true };
  }

  if (isOAuthAuthorizeUrl(url)) {
    return {
      allowInWebView: false,
      externalUrlToOpen: url,
      openInAppBrowser: platformOS === "ios" || platformOS === "android",
      useAuthSession: platformOS === "ios" || platformOS === "android",
    };
  }

  try {
    const parsed = new URL(url);
    if (
      ALLOWED_HOSTS.some((h) => hostnameMatchesAllowedHost(parsed.hostname, h))
    ) {
      return { allowInWebView: true };
    }

    // Default for unhandled URLs: open externally. On native, http(s) links go
    // through an in-app browser sheet (SFSafariViewController / Custom Tabs) so
    // the user stays inside Chravel. Non-web schemes (mailto:, tel:, sms:, etc.)
    // and the web platform keep the Linking.openURL fallback because there is no
    // in-app browser equivalent for them.
    const isWebUrl = parsed.protocol === "http:" || parsed.protocol === "https:";
    const isNativePlatform = platformOS === "ios" || platformOS === "android";
    return {
      allowInWebView: false,
      externalUrlToOpen: url,
      openInAppBrowser: isWebUrl && isNativePlatform,
    };
  } catch {
    return { allowInWebView: false };
  }
}
