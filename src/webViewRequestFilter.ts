const ALLOWED_WEB_HOSTS = new Set(["chravel.app", "www.chravel.app"]);

/** True when `hostname` is one of the first-party chravel.app web hosts. */
export function isChravelWebHost(hostname: string): boolean {
  return ALLOWED_WEB_HOSTS.has(hostname);
}

const ALLOWED_HOSTS = [
  "supabase.co",
  "js.stripe.com",
  "checkout.stripe.com",
  "api.stripe.com",
  "maps.googleapis.com",
  "maps.google.com",
];

/**
 * External hosted-checkout surfaces that must NEVER render on iOS. App Store
 * Guideline 3.1.1 requires digital subscriptions to be sold via In-App Purchase
 * (RevenueCat here), and steering users to an external payment page — even in an
 * in-app browser sheet — is itself disallowed. The web app gates these buttons
 * on iOS too; this is the native defense-in-depth so no Stripe purchase page can
 * appear regardless of the web state. NOT applied on Android (Google Play policy
 * differs and the web gating is iOS-only). `checkout.stripe.com` is Stripe
 * Checkout Sessions; `buy.stripe.com` is Stripe Payment Links — both are
 * purchase-only surfaces, so blocking them can't break non-payment Stripe use
 * (Elements/js.stripe.com card fields load in subframes and are unaffected).
 */
const IOS_BLOCKED_PURCHASE_HOSTS = ["checkout.stripe.com", "buy.stripe.com"];

/**
 * True when `url` is an external digital-purchase surface that must be blocked
 * on this platform (iOS only — Guideline 3.1.1). Used both by the navigation
 * policy below and by the `browser:open` bridge handler so a
 * `Capacitor.Plugins.Browser.open(stripeUrl)` call can't escape the guard.
 */
export function isBlockedPurchaseUrl(url: string, platformOS: string): boolean {
  if (platformOS !== "ios") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return IOS_BLOCKED_PURCHASE_HOSTS.some((h) =>
      hostnameMatchesAllowedHost(parsed.hostname, h),
    );
  } catch {
    return false;
  }
}

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

  if (isBlockedPurchaseUrl(url, platformOS)) {
    // iOS: block outright — do not load in the WebView and do not open
    // externally (Guideline 3.1.1: subscriptions must use IAP, and steering to
    // external payment is disallowed). No externalUrlToOpen → the navigation is
    // simply refused and the user stays on the current page.
    return { allowInWebView: false };
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
