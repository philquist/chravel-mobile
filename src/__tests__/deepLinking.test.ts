jest.mock("expo-linking", () => ({
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
}));

jest.mock("../constants", () => ({
  WEB_APP_URL: "https://chravel.app",
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: "1.0.0",
      ios: { buildNumber: "1" },
      android: { versionCode: 1 },
    },
  },
}));

import {
  buildWebViewLaunchUrl,
  parseDeepLinkUrl,
  isAuthScreenUrl,
  AUTH_LAUNCH_PATH,
  buildNativeAuthLaunchUrl,
  buildCacheBustParam,
  NATIVE_OAUTH_CALLBACK_URL,
  rewriteOAuthUrlForNativeCallback,
  isNativeAuthReturnPath,
  preferExistingDeferredPath,
} from "../deepLinking";

describe("isAuthScreenUrl", () => {
  it("is true for /auth on chravel.app", () => {
    expect(isAuthScreenUrl("https://chravel.app/auth")).toBe(true);
  });

  it("is true for /auth/ subpaths", () => {
    expect(isAuthScreenUrl("https://chravel.app/auth/callback")).toBe(true);
  });

  it("is false for /terms (substring false positive)", () => {
    expect(isAuthScreenUrl("https://chravel.app/terms")).toBe(false);
  });

  it("is false for /author", () => {
    expect(isAuthScreenUrl("https://chravel.app/author/foo")).toBe(false);
  });

  it("is false for other hosts", () => {
    expect(isAuthScreenUrl("https://evil.com/auth")).toBe(false);
  });
});

describe("parseDeepLinkUrl", () => {
  describe("custom scheme (chravel://)", () => {
    it("parses chravel://trip/abc123", () => {
      expect(parseDeepLinkUrl("chravel://trip/abc123")).toBe("/trip/abc123");
    });

    it("parses chravel://auth-callback/12345", () => {
      expect(parseDeepLinkUrl("chravel://auth-callback/12345")).toBe("/auth-callback/12345");
    });

    it("preserves query strings", () => {
      expect(parseDeepLinkUrl("chravel://trip/abc?tab=chat")).toBe("/trip/abc?tab=chat");
    });

    it("preserves hash fragments", () => {
      expect(parseDeepLinkUrl("chravel://auth#access_token=xyz")).toBe("/auth#access_token=xyz");
    });

    it("handles path-only after scheme", () => {
      const result = parseDeepLinkUrl("chravel://join/invite123");
      expect(result).toBe("/join/invite123");
    });
  });

  describe("universal links (https://chravel.app)", () => {
    it("parses https://chravel.app/trip/abc", () => {
      expect(parseDeepLinkUrl("https://chravel.app/trip/abc")).toBe("/trip/abc");
    });

    it("parses short invite links (/j)", () => {
      expect(parseDeepLinkUrl("https://chravel.app/j/chravelhmbehnbu")).toBe(
        "/j/chravelhmbehnbu",
      );
    });

    it("parses www subdomain", () => {
      expect(parseDeepLinkUrl("https://www.chravel.app/trip/abc")).toBe("/trip/abc");
    });

    it("preserves query strings", () => {
      expect(parseDeepLinkUrl("https://chravel.app/trip/abc?tab=chat&thread=t1")).toBe(
        "/trip/abc?tab=chat&thread=t1"
      );
    });

    it("returns root path for domain only", () => {
      expect(parseDeepLinkUrl("https://chravel.app/")).toBe("/");
    });
  });

  describe("edge cases", () => {
    it("returns null for non-chravel https URLs (no pathname-only fallback)", () => {
      expect(parseDeepLinkUrl("https://google.com/search")).toBeNull();
    });

    it("returns null for https URLs whose path would be scheme-relative", () => {
      expect(parseDeepLinkUrl("https://evil.com//phish.example/path")).toBeNull();
    });

    it("returns null for chravel:// URLs that normalize to scheme-relative paths", () => {
      expect(parseDeepLinkUrl("chravel:////evil.com/x")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseDeepLinkUrl("")).toBeNull();
    });

    it("handles malformed chravel:// URLs via fallback", () => {
      // The fallback regex in parseDeepLinkUrl handles this
      const result = parseDeepLinkUrl("chravel://");
      expect(result).not.toBeNull();
    });
  });
});


describe("native auth launch contract", () => {
  it("keeps auth path constant as /auth", () => {
    expect(AUTH_LAUNCH_PATH).toBe("/auth");
  });

  it("builds /auth?app_context=native&_v=<build> from shared helper", () => {
    expect(buildNativeAuthLaunchUrl()).toBe(
      "https://chravel.app/auth?app_context=native&_v=1.0.0-1",
    );
  });
});

describe("buildCacheBustParam", () => {
  it("combines app version and iOS build number", () => {
    expect(buildCacheBustParam()).toBe("1.0.0-1");
  });

  it("stamps the native launch URL with the cache-bust token", () => {
    const url = new URL(buildNativeAuthLaunchUrl());
    expect(url.searchParams.get("_v")).toBe("1.0.0-1");
    expect(url.searchParams.get("app_context")).toBe("native");
  });

  it("does NOT stamp non-initial in-app navigations", () => {
    // buildWebViewLaunchUrl is used for runtime nav (deep links, notification
    // taps); the cache-bust token only belongs on the cold-start document.
    const url = new URL(buildWebViewLaunchUrl("/trip/abc"));
    expect(url.searchParams.has("_v")).toBe(false);
  });
});

describe("buildWebViewLaunchUrl", () => {
  it("adds app_context=native to auth launch URL", () => {
    expect(buildWebViewLaunchUrl("/auth")).toBe(
      "https://chravel.app/auth?app_context=native",
    );
  });

  it("preserves deep-link path/query while appending app_context", () => {
    expect(buildWebViewLaunchUrl("/trip/abc?tab=chat&thread=t1")).toBe(
      "https://chravel.app/trip/abc?tab=chat&thread=t1&app_context=native",
    );
  });

  it("preserves hash fragments", () => {
    expect(buildWebViewLaunchUrl("/auth#access_token=xyz")).toBe(
      "https://chravel.app/auth?app_context=native#access_token=xyz",
    );
  });

  it("does not rewrite deep links to root", () => {
    expect(buildWebViewLaunchUrl("/join/invite123")).toBe(
      "https://chravel.app/join/invite123?app_context=native",
    );
  });

  it("forces app_context=native when param already exists", () => {
    expect(
      buildWebViewLaunchUrl("/trip/abc?app_context=web&tab=plan"),
    ).toBe("https://chravel.app/trip/abc?app_context=native&tab=plan");
  });

  it("does not resolve scheme-relative paths to a foreign origin", () => {
    expect(buildWebViewLaunchUrl("//evil.com/phish")).toBe(
      "https://chravel.app/auth?app_context=native",
    );
  });
});


describe("rewriteOAuthUrlForNativeCallback", () => {
  it("rewrites redirect_to query param to the native callback", () => {
    const url = "https://abc.supabase.co/auth/v1/authorize?provider=apple&redirect_to=https%3A%2F%2Fchravel.app%2Fauth-callback";
    expect(rewriteOAuthUrlForNativeCallback(url)).toContain(
      `redirect_to=${encodeURIComponent(NATIVE_OAUTH_CALLBACK_URL)}`
    );
  });

  it("normalizes the host when forcing redirect_to to the native callback", () => {
    const url = "https://abc.supabase.co/auth/v1/authorize?provider=apple&redirect_to=https%3A%2F%2Fwww.chravel.app%2Fauth-callback";
    const rewritten = rewriteOAuthUrlForNativeCallback(url);
    expect(new URL(rewritten).searchParams.get("redirect_to")).toBe(
      NATIVE_OAUTH_CALLBACK_URL
    );
  });

  it("exposes the native callback as the chravel:// custom scheme", () => {
    expect(NATIVE_OAUTH_CALLBACK_URL).toBe("chravel://auth-callback");
  });

  it("does not mutate urls with no redirect_to", () => {
    const url = "https://appleid.apple.com/auth/authorize?foo=bar";
    expect(rewriteOAuthUrlForNativeCallback(url)).toBe(url);
    expect(rewriteOAuthUrlForNativeCallback(url, NATIVE_OAUTH_CALLBACK_URL)).toBe(url);
  });

  it("fails open on malformed urls", () => {
    const url = "not a url";
    expect(rewriteOAuthUrlForNativeCallback(url)).toBe(url);
  });
});

describe("isNativeAuthReturnPath", () => {
  it("accepts legacy auth-callback route", () => {
    expect(isNativeAuthReturnPath("/auth-callback#access_token=x")).toBe(true);
  });

  it("accepts /auth callback-style routes", () => {
    expect(isNativeAuthReturnPath("/auth#access_token=x")).toBe(true);
    expect(isNativeAuthReturnPath("/auth/callback?code=123")).toBe(true);
    expect(isNativeAuthReturnPath("/auth?code=123")).toBe(true);
    expect(isNativeAuthReturnPath("/auth?error=access_denied")).toBe(true);
  });

  it("rejects bare /auth and marketing query params", () => {
    expect(isNativeAuthReturnPath("/auth")).toBe(false);
    expect(isNativeAuthReturnPath("/auth?app_context=native")).toBe(false);
  });

  it("rejects non-auth routes", () => {
    expect(isNativeAuthReturnPath("/trip/abc")).toBe(false);
  });
});

describe("preferExistingDeferredPath", () => {
  it("keeps an existing notification-deferred path", () => {
    expect(
      preferExistingDeferredPath(
        "/trip/t1?tab=chat&thread=th1",
        "/auth",
      ),
    ).toBe("/trip/t1?tab=chat&thread=th1");
  });

  it("uses the linking path when nothing is deferred yet", () => {
    expect(preferExistingDeferredPath(null, "/trip/t1")).toBe("/trip/t1");
  });

  it("keeps the richer notification path when a generic link event arrives second", () => {
    expect(
      preferExistingDeferredPath(
        "/trip/t1?tab=chat&thread=th1",
        "/trip/t1?tab=chat",
      ),
    ).toBe("/trip/t1?tab=chat&thread=th1");
  });
});
