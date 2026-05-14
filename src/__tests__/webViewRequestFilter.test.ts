import {
  evaluateWebViewRequestPolicy,
  isOAuthAuthorizeUrl,
} from "../webViewRequestFilter";

describe("evaluateWebViewRequestPolicy", () => {
  it("keeps www.chravel.app routes inside the WebView", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://www.chravel.app/trip/abc?tab=calendar",
      platformOS: "android",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(true);
    expect(result.externalUrlToOpen).toBeUndefined();
  });

  it("does not treat look-alike hosts as chravel.app (suffix bypass)", () => {
    const malicious = "https://chravel.app.evil.com/phish";
    const result = evaluateWebViewRequestPolicy({
      url: malicious,
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe(malicious);
  });

  it("routes OAuth to in-app browser for native in-app contexts", () => {
    const oauthUrl =
      "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fchravel.app%2Fauth-callback";

    const result = evaluateWebViewRequestPolicy({
      url: oauthUrl,
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe(oauthUrl);
    expect(result.openInAppBrowser).toBe(true);
  });

  it("uses external open for non-native OAuth path", () => {
    const oauthUrl =
      "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fchravel.app%2Fauth-callback";

    const result = evaluateWebViewRequestPolicy({
      url: oauthUrl,
      platformOS: "web",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe(oauthUrl);
    expect(result.openInAppBrowser).toBe(false);
  });
});

describe("isOAuthAuthorizeUrl", () => {
  it("recognizes Google OAuth authorize URLs", () => {
    expect(
      isOAuthAuthorizeUrl(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=y",
      ),
    ).toBe(true);
  });

  it("recognizes Apple OAuth authorize URLs", () => {
    expect(
      isOAuthAuthorizeUrl("https://appleid.apple.com/auth/authorize?client_id=x"),
    ).toBe(true);
  });

  it("recognizes Supabase authorize URLs that carry a provider param", () => {
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fchravel.app%2Fauth-callback",
      ),
    ).toBe(true);
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co/auth/v1/authorize?provider=apple",
      ),
    ).toBe(true);
  });

  it("does not match Supabase URLs without a provider param", () => {
    expect(
      isOAuthAuthorizeUrl("https://abc.supabase.co/rest/v1/some-table"),
    ).toBe(false);
  });

  it("does not match chravel.app or unrelated URLs", () => {
    expect(isOAuthAuthorizeUrl("https://chravel.app/auth-callback")).toBe(false);
    expect(isOAuthAuthorizeUrl("https://example.com/")).toBe(false);
    expect(isOAuthAuthorizeUrl("https://maps.googleapis.com/maps/api/foo")).toBe(
      false,
    );
  });
});
