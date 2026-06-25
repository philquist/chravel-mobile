const CHRAVEL_WEB_HOSTS = new Set(["chravel.app", "www.chravel.app"]);

/** True only for the sign-in route, not paths like /terms or /author that contain the substring "auth". */
export function isAuthScreenUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!CHRAVEL_WEB_HOSTS.has(parsed.hostname)) {
      return false;
    }
    return parsed.pathname === "/auth" || parsed.pathname.startsWith("/auth/");
  } catch {
    return false;
  }
}

/**
 * True while the WebView is on any auth bootstrap / OAuth callback surface
 * (sign-in route or PKCE exchange). Used to defer notification/deep-link
 * navigation until the session is hydrated — not only on /auth but also on
 * /auth-callback while Supabase exchanges the OAuth code.
 */
export function isAuthReturnFlowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!CHRAVEL_WEB_HOSTS.has(parsed.hostname)) {
      return false;
    }
    const pathname = parsed.pathname;
    return (
      pathname.startsWith("/auth-callback") ||
      pathname === "/auth" ||
      pathname.startsWith("/auth/")
    );
  } catch {
    return false;
  }
}
