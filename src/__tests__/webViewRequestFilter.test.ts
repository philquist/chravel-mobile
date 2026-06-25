import {
  evaluateWebViewRequestPolicy,
  isOAuthAuthorizeUrl,
  isBlockedPurchaseUrl,
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
    // The SFSafariViewController sheet still shows the real URL in the address
    // bar, so the trust boundary is preserved while keeping the user in-app.
    expect(result.openInAppBrowser).toBe(true);
  });

  it("opens generic https URLs in the in-app browser on native", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://example.com/article",
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe("https://example.com/article");
    expect(result.openInAppBrowser).toBe(true);
    expect(result.useAuthSession).toBeUndefined();
  });

  it("opens generic https URLs in the in-app browser on Android", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://example.com/article",
      platformOS: "android",
      isTopFrame: true,
    });

    expect(result.openInAppBrowser).toBe(true);
  });

  it("falls back to system handler for generic https URLs on web", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://example.com/article",
      platformOS: "web",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe("https://example.com/article");
    expect(result.openInAppBrowser).toBe(false);
  });

  it("uses Linking.openURL for mailto: even on native", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "mailto:hello@example.com",
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe("mailto:hello@example.com");
    expect(result.openInAppBrowser).toBe(false);
  });

  it("uses Linking.openURL for tel: even on native", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "tel:+15551234567",
      platformOS: "android",
      isTopFrame: true,
    });

    expect(result.openInAppBrowser).toBe(false);
  });

  it("does not allow look-alike hosts that merely end with an allowed suffix", () => {
    const malicious = "https://evilsupabase.co/rest/v1/foo";
    const result = evaluateWebViewRequestPolicy({
      url: malicious,
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBe(malicious);
    expect(result.openInAppBrowser).toBe(true);
  });

  it("allows legitimate subdomains of allowlisted third-party hosts", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://abc.supabase.co/rest/v1/foo",
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(true);
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

  it("routes Supabase OAuth with trailing slash on authorize path through auth session", () => {
    const oauthUrl =
      "https://abc.supabase.co/auth/v1/authorize/?provider=google&redirect_to=https%3A%2F%2Fchravel.app%2Fauth-callback";

    const result = evaluateWebViewRequestPolicy({
      url: oauthUrl,
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.useAuthSession).toBe(true);
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

  it("blocks Stripe hosted checkout outright on iOS (Guideline 3.1.1)", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    // Blocked, not steered: no external open either (steering is also disallowed).
    expect(result.externalUrlToOpen).toBeUndefined();
    expect(result.openInAppBrowser).toBeUndefined();
  });

  it("blocks Stripe payment links on iOS", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://buy.stripe.com/test_abc123",
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(false);
    expect(result.externalUrlToOpen).toBeUndefined();
  });

  it("still allows Stripe hosted checkout in the WebView on Android", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      platformOS: "android",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(true);
  });

  it("does not block Stripe.js (Elements) on iOS — only the checkout surfaces", () => {
    const result = evaluateWebViewRequestPolicy({
      url: "https://js.stripe.com/v3/",
      platformOS: "ios",
      isTopFrame: true,
    });

    expect(result.allowInWebView).toBe(true);
  });
});

describe("isBlockedPurchaseUrl", () => {
  it("flags Stripe checkout / payment-link hosts on iOS only", () => {
    expect(isBlockedPurchaseUrl("https://checkout.stripe.com/c/pay/x", "ios")).toBe(true);
    expect(isBlockedPurchaseUrl("https://buy.stripe.com/x", "ios")).toBe(true);
    expect(isBlockedPurchaseUrl("https://checkout.stripe.com/c/pay/x", "android")).toBe(false);
    expect(isBlockedPurchaseUrl("https://buy.stripe.com/x", "web")).toBe(false);
  });

  it("does not flag non-purchase Stripe or unrelated hosts", () => {
    expect(isBlockedPurchaseUrl("https://js.stripe.com/v3/", "ios")).toBe(false);
    expect(isBlockedPurchaseUrl("https://api.stripe.com/v1/x", "ios")).toBe(false);
    expect(isBlockedPurchaseUrl("https://chravel.app/settings/billing", "ios")).toBe(false);
  });

  it("rejects look-alike hosts and non-https schemes", () => {
    expect(isBlockedPurchaseUrl("https://checkout.stripe.com.evil.com/x", "ios")).toBe(false);
    expect(isBlockedPurchaseUrl("http://checkout.stripe.com/x", "ios")).toBe(false);
    expect(isBlockedPurchaseUrl("not a url", "ios")).toBe(false);
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

  it("recognizes Supabase authorize URLs with a trailing slash before the query", () => {
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co/auth/v1/authorize/?provider=google&redirect_to=https%3A%2F%2Fchravel.app%2Fauth-callback",
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

  it("rejects substring spoofing of the Google hostname", () => {
    expect(
      isOAuthAuthorizeUrl("https://evil.com/?accounts.google.com=true"),
    ).toBe(false);
    expect(isOAuthAuthorizeUrl("https://accounts.google.com.evil.com/")).toBe(
      false,
    );
  });

  it("rejects substring spoofing of the Apple hostname", () => {
    expect(
      isOAuthAuthorizeUrl("https://evil.com/?next=appleid.apple.com"),
    ).toBe(false);
    expect(isOAuthAuthorizeUrl("https://appleid.apple.com.evil.com/")).toBe(
      false,
    );
  });

  it("rejects non-https schemes even on legitimate hostnames", () => {
    expect(
      isOAuthAuthorizeUrl("http://accounts.google.com/o/oauth2/v2/auth"),
    ).toBe(false);
    expect(
      isOAuthAuthorizeUrl(
        "http://abc.supabase.co/auth/v1/authorize?provider=google",
      ),
    ).toBe(false);
  });

  it("rejects bare supabase.co apex without a project subdomain", () => {
    expect(
      isOAuthAuthorizeUrl("https://supabase.co/auth/v1/authorize?provider=google"),
    ).toBe(false);
  });

  it("rejects Supabase look-alike hosts that merely contain the substring", () => {
    expect(
      isOAuthAuthorizeUrl(
        "https://evilsupabase.co/auth/v1/authorize?provider=google",
      ),
    ).toBe(false);
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co.evil.com/auth/v1/authorize?provider=google",
      ),
    ).toBe(false);
  });

  it("rejects Supabase URLs on the wrong path", () => {
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co/something-else?provider=google",
      ),
    ).toBe(false);
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co/auth/v1/token?provider=google",
      ),
    ).toBe(false);
  });

  it("rejects Supabase URLs with unsupported providers or no provider", () => {
    expect(
      isOAuthAuthorizeUrl(
        "https://abc.supabase.co/auth/v1/authorize?provider=github",
      ),
    ).toBe(false);
    expect(
      isOAuthAuthorizeUrl("https://abc.supabase.co/auth/v1/authorize"),
    ).toBe(false);
  });

  it("returns false (does not throw) for malformed input", () => {
    expect(isOAuthAuthorizeUrl("")).toBe(false);
    expect(isOAuthAuthorizeUrl("not a url")).toBe(false);
    expect(isOAuthAuthorizeUrl("//accounts.google.com/oauth")).toBe(false);
  });
});
