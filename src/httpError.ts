import { isChravelWebHost } from "./webViewRequestFilter";

/**
 * Decide whether a WebView HTTP error should tear down to the retryable
 * ErrorScreen.
 *
 * Fatal means the reviewer/user is stranded: an HTTP error on the MAIN
 * DOCUMENT (e.g. a 403/404/500 on chravel.app/auth) leaves them on a browser
 * error page with no way out (App Store Guideline 2.1). Everything else must
 * stay non-fatal: on Android `onReceivedHttpError` fires for EVERY
 * sub-resource, so a 404 image or a 4xx API call must never unmount the app.
 * (iOS fires for the main frame only, so the URL match there is
 * belt-and-braces.)
 */
export interface HttpErrorEventInput {
  statusCode: number;
  /** `nativeEvent.url` — typed string upstream, but treated as optional. */
  url: string | undefined;
  /** The main-document URL (currentUrlRef: launch URL until first nav event). */
  currentUrl: string;
}

export function isFatalHttpError(input: HttpErrorEventInput): boolean {
  const { statusCode, url, currentUrl } = input;
  if (statusCode < 400) return false;

  // Unattributable event: keep the pre-existing 5xx safety net but do not
  // extend 4xx to failures we can't pin to the main document.
  if (!url) return statusCode >= 500;

  const failed = parseHttpsUrl(url);
  if (!failed || !isChravelWebHost(failed.hostname)) {
    // A third-party sub-resource (Stripe, Supabase, CDN…) erroring must never
    // nuke the app.
    return false;
  }

  const current = parseHttpsUrl(currentUrl);
  if (!current) return false;

  // Main-document check: same path on a chravel.app host. Query/hash are
  // ignored — the launch URL carries app_context/_v cache-bust params that a
  // redirect may drop — and chravel.app / www.chravel.app are equivalent.
  return normalizePath(failed.pathname) === normalizePath(current.pathname);
}

function parseHttpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}
