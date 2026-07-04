import {
  parseBridgeMessage,
  buildWebEvent,
  buildPushPermissionResponse,
  buildAppleSignInResponse,
  buildClearPushRegistrationCache,
  buildInjectedJS,
  buildNativeBootstrapJS,
  buildNativeEnhancementsJS,
  buildNativeDocumentEndJS,
} from "../bridge";

describe("parseBridgeMessage", () => {
  it("parses a valid haptic message", () => {
    const result = parseBridgeMessage(JSON.stringify({ type: "haptic", style: "light" }));
    expect(result).toEqual({ type: "haptic", style: "light" });
  });

  it("parses a valid ready message", () => {
    const result = parseBridgeMessage(JSON.stringify({ type: "ready" }));
    expect(result).toEqual({ type: "ready" });
  });

  it("parses a valid share message", () => {
    const result = parseBridgeMessage(
      JSON.stringify({ type: "share", url: "https://chravel.app/trip/123", title: "Trip" })
    );
    expect(result).toEqual({ type: "share", url: "https://chravel.app/trip/123", title: "Trip" });
  });

  it("parses a valid browser:open message", () => {
    const result = parseBridgeMessage(
      JSON.stringify({ type: "browser:open", url: "https://example.com", presentationStyle: "popover" })
    );
    expect(result).toEqual({ type: "browser:open", url: "https://example.com", presentationStyle: "popover" });
  });


  it("parses a valid oauth:open message", () => {
    const result = parseBridgeMessage(
      JSON.stringify({ type: "oauth:open", url: "https://accounts.google.com/o/oauth2/v2/auth" })
    );
    expect(result).toEqual({ type: "oauth:open", url: "https://accounts.google.com/o/oauth2/v2/auth" });
  });

  it("parses a valid revenuecat:identify message", () => {
    const result = parseBridgeMessage(JSON.stringify({ type: "revenuecat:identify", userId: "user-123" }));
    expect(result).toEqual({ type: "revenuecat:identify", userId: "user-123" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseBridgeMessage("not json")).toBeNull();
  });

  it("returns null for missing type field", () => {
    expect(parseBridgeMessage(JSON.stringify({ style: "light" }))).toBeNull();
  });

  it("returns null for non-string type", () => {
    expect(parseBridgeMessage(JSON.stringify({ type: 123 }))).toBeNull();
  });

  it("returns null for non-object payload", () => {
    expect(parseBridgeMessage(JSON.stringify("hello"))).toBeNull();
  });

  it("returns null for null payload", () => {
    expect(parseBridgeMessage("null")).toBeNull();
  });

  it("returns null for invalid haptic style", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "haptic", style: "ultra-heavy" }))
    ).toBeNull();
  });

  it("returns null for missing revenuecat:purchase packageId", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "revenuecat:purchase" }))
    ).toBeNull();
  });

  it("returns null for invalid revenuecat:purchase packageId type", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "revenuecat:purchase", packageId: 123 }))
    ).toBeNull();
  });

  it("returns null for missing revenuecat:identify userId", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "revenuecat:identify" }))
    ).toBeNull();
  });

  it("returns null for invalid share field type", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "share", url: 123 }))
    ).toBeNull();
  });

  it("returns null for missing voice:play-audio audio data", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "voice:play-audio" }))
    ).toBeNull();
  });

  it("returns null for invalid voice:play-audio sampleRate type", () => {
    expect(
      parseBridgeMessage(
        JSON.stringify({ type: "voice:play-audio", audio: "...", sampleRate: "24000" })
      )
    ).toBeNull();
  });

  it("parses push:register and push:unregister messages", () => {
    expect(parseBridgeMessage(JSON.stringify({ type: "push:register" }))).toEqual({
      type: "push:register",
    });
    expect(parseBridgeMessage(JSON.stringify({ type: "push:unregister" }))).toEqual({
      type: "push:unregister",
    });
  });

  it("parses push:checkPermissions / push:requestPermissions with a requestId", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "push:checkPermissions", requestId: "cp_1" }))
    ).toEqual({ type: "push:checkPermissions", requestId: "cp_1" });
    expect(
      parseBridgeMessage(JSON.stringify({ type: "push:requestPermissions", requestId: "cp_2" }))
    ).toEqual({ type: "push:requestPermissions", requestId: "cp_2" });
  });

  it("returns null for push permission messages without a string requestId", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "push:checkPermissions" }))
    ).toBeNull();
    expect(
      parseBridgeMessage(JSON.stringify({ type: "push:requestPermissions", requestId: 123 }))
    ).toBeNull();
  });

  it("parses apple:signin with a requestId", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "apple:signin", requestId: "as_1" }))
    ).toEqual({ type: "apple:signin", requestId: "as_1" });
  });

  it("returns null for apple:signin without a string requestId", () => {
    expect(parseBridgeMessage(JSON.stringify({ type: "apple:signin" }))).toBeNull();
    expect(
      parseBridgeMessage(JSON.stringify({ type: "apple:signin", requestId: 7 }))
    ).toBeNull();
  });

  it("parses openAppSettings and openNotificationSettings messages", () => {
    expect(parseBridgeMessage(JSON.stringify({ type: "openAppSettings" }))).toEqual({
      type: "openAppSettings",
    });
    expect(
      parseBridgeMessage(JSON.stringify({ type: "openNotificationSettings" }))
    ).toEqual({ type: "openNotificationSettings" });
  });

  it("returns null for unknown message type", () => {
    expect(
      parseBridgeMessage(JSON.stringify({ type: "unknown:action" }))
    ).toBeNull();
  });
});

describe("buildPushPermissionResponse", () => {
  it("builds a JS string that resolves the shim's pending permission promise", () => {
    const result = buildPushPermissionResponse("cp_42", "granted");
    expect(result).toContain("window.__chravelPushResolvePermission");
    expect(result).toContain('"cp_42"');
    expect(result).toContain('"granted"');
    expect(result).toEndWith("true;");
  });
});

describe("buildAppleSignInResponse", () => {
  it("builds a JS string that resolves the signInWithApple promise with a credential", () => {
    const result = buildAppleSignInResponse("as_42", {
      ok: true,
      credential: { identityToken: "id-tok", rawNonce: "raw-nonce" },
    });
    expect(result).toContain("window.__chravelResolveAppleSignIn");
    expect(result).toContain('"as_42"');
    expect(result).toContain('"identityToken":"id-tok"');
    expect(result).toContain('"rawNonce":"raw-nonce"');
    expect(result).toEndWith("true;");
  });

  it("builds a JS string that rejects on failure", () => {
    const result = buildAppleSignInResponse("as_43", {
      ok: false,
      error: "ERR_REQUEST_CANCELED",
    });
    expect(result).toContain('"ok":false');
    expect(result).toContain('"error":"ERR_REQUEST_CANCELED"');
  });

  it("carries the machine-readable cancel code when set, and omits it otherwise", () => {
    const canceled = buildAppleSignInResponse("as_44", {
      ok: false,
      error: "The operation was canceled",
      code: "canceled",
    });
    expect(canceled).toContain('"code":"canceled"');

    const failure = buildAppleSignInResponse("as_45", {
      ok: false,
      error: "boom",
      code: undefined,
    });
    expect(failure).not.toContain('"code"');
  });
});

describe("buildClearPushRegistrationCache", () => {
  it("clears cached registration replay state in the injected shim", () => {
    const result = buildClearPushRegistrationCache();
    expect(result).toContain("window.__chravelPush.lastRegistration = null");
    expect(result).toContain("window.__chravelPush.lastRegistrationError = null");
    expect(result).toEndWith("true;");
  });
});

describe("buildWebEvent", () => {
  it("builds a CustomEvent dispatch string", () => {
    const result = buildWebEvent("chravel:push-token", { token: "abc123" });
    expect(result).toContain("window.dispatchEvent");
    expect(result).toContain("chravel:push-token");
    expect(result).toContain('"token":"abc123"');
    expect(result).toEndWith("true;");
  });

  it("handles null values in detail", () => {
    const result = buildWebEvent("chravel:push-token", { token: null as unknown as string, error: "denied" });
    expect(result).toContain('"token":null');
    expect(result).toContain('"error":"denied"');
  });
});

describe("buildInjectedJS", () => {
  it("includes ChravelNative object with platform", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("window.Capacitor.Plugins.Browser");
    expect(result).toContain('window.ChravelNative');
    expect(result).toContain('platform: "ios"');
    expect(result).toContain("isNative: true");
    expect(result).toContain("version: nativeVersion");
    expect(result).toContain("userAgent: 'ChravelNative/' + nativeVersion");
    expect(result).toContain("openOAuthUrl: function(url)");
    expect(result).toContain('type: "oauth:open"');
  });

  it("injects the Capacitor PushNotifications shim with all required methods", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("window.Capacitor.Plugins.PushNotifications");
    expect(result).toContain("checkPermissions: function()");
    expect(result).toContain("requestPermissions: function()");
    expect(result).toContain("register: function()");
    expect(result).toContain("addListener: function(eventName, listener)");
    expect(result).toContain("removeAllListeners: function()");
    // Translates the native push-token event into Capacitor push events.
    expect(result).toContain("chravel:push-token");
  });

  it("includes ChravelNative settings deep-link methods", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("openAppSettings: function()");
    expect(result).toContain("openNotificationSettings: function()");
    expect(result).toContain('type: "openAppSettings"');
    expect(result).toContain('type: "openNotificationSettings"');
  });

  it("injects the native Apple Sign In bridge on iOS", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("signInWithApple: function()");
    expect(result).toContain("window.__chravelResolveAppleSignIn");
    expect(result).toContain("type: 'apple:signin'");
  });

  it("does NOT inject the Apple Sign In bridge on Android (web keeps OAuth fallback)", () => {
    const result = buildInjectedJS("android");
    expect(result).not.toContain("signInWithApple");
    expect(result).not.toContain("__chravelResolveAppleSignIn");
    expect(result).not.toContain("apple:signin");
  });

  it("emits syntactically valid injected JavaScript", () => {
    const result = buildInjectedJS("ios");
    expect(() => new Function(result)).not.toThrow();
  });


  it("keeps the document-start bootstrap DOM-free", () => {
    const result = buildNativeBootstrapJS("ios");
    expect(result).toContain("window.ChravelNative");
    expect(result).toContain("isNative: true");
    expect(result).not.toContain("document.");
    expect(result).not.toContain("MutationObserver");
    expect(result).not.toContain("wireNetworkPinnedSignals");
  });

  it("keeps DOM/network enhancements out of native detection", () => {
    const result = buildNativeEnhancementsJS("ios");
    expect(result).toContain("__chravelNativeEnhancementsInstalled");
    expect(result).toContain("wireNetworkPinnedSignals");
    expect(result).not.toContain("window.ChravelNative =");
  });

  it("keeps bootstrap idempotent when document-end fallback runs after document-start", () => {
    const result = buildNativeBootstrapJS("ios");
    expect(result).toContain("window.ChravelNative && window.ChravelNative.isNative");
  });

  it("includes bootstrap fallback plus enhancements for document-end injection", () => {
    const result = buildNativeDocumentEndJS("ios");
    expect(result).toContain("window.ChravelNative");
    expect(result).toContain("chravel:native-ready");
    expect(result).toContain("__chravelNativeEnhancementsInstalled");
    expect(result).toContain("wireNetworkPinnedSignals");
  });

  it("includes safe area CSS injection", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("bottomPadding + 'px !important; }'");
  });


  it("includes chat tab scroll patch keywords", () => {
    const result = buildInjectedJS("android");
    expect(result).toContain("TAB_KEYWORDS");
    expect(result).toContain("patchScrollableRow");
    expect(result).toContain("data-chravel-scroll-patched");
    expect(result).toContain("child.style.flexShrink = '0'");
  });

  it("includes pinned hydration network hooks", () => {
    const result = buildInjectedJS("android");
    expect(result).toContain("wireNetworkPinnedSignals");
    expect(result).toContain("maybePinnedMutation");
    expect(result).toContain("schedulePinnedHydration('fetch')");
    expect(result).toContain("schedulePinnedHydration('xhr')");
  });

  it("dispatches chravel:native-ready event", () => {
    const result = buildInjectedJS("android");
    expect(result).toContain("chravel:native-ready");
  });

  it("uses the provided native bridge version", () => {
    const result = buildInjectedJS("ios", 0, false, "9.8.7");
    expect(result).toContain('var nativeVersion = "9.8.7"');
  });

  it("keeps native enhancements idempotent for document-end injection", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("__chravelNativeEnhancementsInstalled");
  });

  it("avoids optional chaining in injected JS for broad WKWebView compatibility", () => {
    const result = buildInjectedJS("ios");
    expect(result).not.toContain("?.");
  });

  it("uses the provided platform string", () => {
    const result = buildInjectedJS("android");
    expect(result).toContain('platform: "android"');
  });

  it("includes isTablet: true when third arg is true", () => {
    const result = buildInjectedJS("ios", 0, true);
    expect(result).toContain("isTablet: true");
  });

  it("includes isTablet: false when third arg is false", () => {
    const result = buildInjectedJS("ios", 0, false);
    expect(result).toContain("isTablet: false");
  });

  it("defaults isTablet to false when omitted", () => {
    const result = buildInjectedJS("ios");
    expect(result).toContain("isTablet: false");
  });

  it("uses 20px safe area fallback for iPad on iOS", () => {
    const result = buildInjectedJS("ios", 0, true);
    expect(result).toContain("true ? 20 : 34");
  });

  it("uses 34px safe area fallback for iPhone on iOS", () => {
    const result = buildInjectedJS("ios", 0, false);
    expect(result).toContain("false ? 20 : 34");
  });
});

describe("Capacitor PushNotifications shim (runtime behavior)", () => {
  // Evaluate the document-start bootstrap against a fake window so we exercise
  // the injected shim exactly as a WebView would.
  class FakeEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  }
  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init ? init.detail : undefined;
    }
  }

  function installShim() {
    const eventListeners: Record<string, Array<(e: unknown) => void>> = {};
    const postMessage = jest.fn();
    const win: Record<string, unknown> = {
      ReactNativeWebView: { postMessage },
      addEventListener: (name: string, cb: (e: unknown) => void) => {
        (eventListeners[name] = eventListeners[name] || []).push(cb);
      },
      dispatchEvent: (evt: { type: string }) => {
        (eventListeners[evt.type] || []).forEach((cb) => cb(evt));
        return true;
      },
    };

    const js = buildNativeBootstrapJS("ios");
    // eslint-disable-next-line no-new-func
    const fn = new Function("window", "Event", "CustomEvent", js);
    fn(win, FakeEvent, FakeCustomEvent);

    const plugin = (win.Capacitor as { Plugins: { PushNotifications: any } }).Plugins
      .PushNotifications;
    const fireToken = (detail: { token?: string; error?: string }) =>
      (win.dispatchEvent as (e: unknown) => void)(
        new FakeCustomEvent("chravel:push-token", { detail }),
      );

    return { win, plugin, postMessage, fireToken };
  }

  it("exposes all five required methods", () => {
    const { plugin } = installShim();
    expect(typeof plugin.checkPermissions).toBe("function");
    expect(typeof plugin.requestPermissions).toBe("function");
    expect(typeof plugin.register).toBe("function");
    expect(typeof plugin.addListener).toBe("function");
    expect(typeof plugin.removeAllListeners).toBe("function");
  });

  it("delivers the token to a registration listener attached before register()", async () => {
    const { plugin, postMessage, fireToken } = installShim();
    const received: Array<{ value: string }> = [];

    await plugin.addListener("registration", (t: { value: string }) => received.push(t));
    await plugin.register();
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: "push:register" }),
    );

    // Native obtains the token and emits chravel:push-token.
    fireToken({ token: "fcm-token-123" });
    expect(received).toEqual([{ value: "fcm-token-123" }]);
  });

  it("replays the last registration to a listener added after the token arrived", async () => {
    const { plugin, fireToken } = installShim();
    fireToken({ token: "fcm-token-late" });

    const received: Array<{ value: string }> = [];
    await plugin.addListener("registration", (t: { value: string }) => received.push(t));
    expect(received).toEqual([{ value: "fcm-token-late" }]);
  });

  it("routes a token-less event to registrationError", async () => {
    const { plugin, fireToken } = installShim();
    const errors: Array<{ error: string }> = [];

    await plugin.addListener("registrationError", (e: { error: string }) => errors.push(e));
    fireToken({ error: "Permission not granted" });
    expect(errors).toEqual([{ error: "Permission not granted" }]);
  });

  it("clears cached registration on error so later listeners are not replayed stale tokens", async () => {
    const { plugin, fireToken, win } = installShim();
    fireToken({ token: "stale-token" });
    fireToken({ error: "Permission not granted" });

    const received: Array<{ value: string }> = [];
    await plugin.addListener("registration", (t: { value: string }) => received.push(t));
    expect(received).toEqual([]);
  });

  it("does not replay a prior registration after the cache is cleared", async () => {
    const { plugin, fireToken, win } = installShim();
    fireToken({ token: "user-a-token" });

    // eslint-disable-next-line no-new-func
    new Function("window", buildClearPushRegistrationCache())(win);

    const received: Array<{ value: string }> = [];
    await plugin.addListener("registration", (t: { value: string }) => received.push(t));
    expect(received).toEqual([]);
  });

  it("resolves checkPermissions via the native permission round-trip", async () => {
    const { plugin, postMessage, win } = installShim();
    const pending = plugin.checkPermissions();

    const sent = JSON.parse(postMessage.mock.calls[0][0]);
    expect(sent.type).toBe("push:checkPermissions");
    expect(typeof sent.requestId).toBe("string");

    // Native replies (as buildPushPermissionResponse would).
    (win.__chravelPushResolvePermission as (id: string, r: string) => void)(
      sent.requestId,
      "granted",
    );
    await expect(pending).resolves.toEqual({ receive: "granted" });
  });

  it("removeAllListeners clears registered listeners", async () => {
    const { plugin, fireToken } = installShim();
    const received: unknown[] = [];
    await plugin.addListener("registration", (t: unknown) => received.push(t));
    await plugin.removeAllListeners();
    fireToken({ token: "should-not-deliver" });
    expect(received).toEqual([]);
  });
});

describe("native Apple Sign In bridge (runtime behavior)", () => {
  class FakeEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  }
  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init ? init.detail : undefined;
    }
  }

  function installBootstrap(platform: string) {
    const eventListeners: Record<string, Array<(e: unknown) => void>> = {};
    const postMessage = jest.fn();
    const win: Record<string, unknown> = {
      ReactNativeWebView: { postMessage },
      addEventListener: (name: string, cb: (e: unknown) => void) => {
        (eventListeners[name] = eventListeners[name] || []).push(cb);
      },
      dispatchEvent: () => true,
    };
    const js = buildNativeBootstrapJS(platform);
    // eslint-disable-next-line no-new-func
    new Function("window", "Event", "CustomEvent", js)(win, FakeEvent, FakeCustomEvent);
    return { win, postMessage };
  }

  it("exposes signInWithApple on iOS and posts apple:signin with a requestId", () => {
    const { win, postMessage } = installBootstrap("ios");
    const native = win.ChravelNative as { signInWithApple?: () => Promise<unknown> };
    expect(typeof native.signInWithApple).toBe("function");

    native.signInWithApple!();
    const sent = JSON.parse(postMessage.mock.calls[0][0]);
    expect(sent.type).toBe("apple:signin");
    expect(typeof sent.requestId).toBe("string");
  });

  it("resolves the signInWithApple promise when native injects the credential", async () => {
    const { win, postMessage } = installBootstrap("ios");
    const native = win.ChravelNative as { signInWithApple: () => Promise<unknown> };
    const pending = native.signInWithApple();

    const sent = JSON.parse(postMessage.mock.calls[0][0]);
    const credential = { identityToken: "id-tok", rawNonce: "raw", authorizationCode: "code" };
    (win.__chravelResolveAppleSignIn as (id: string, r: unknown) => void)(sent.requestId, {
      ok: true,
      credential,
    });

    await expect(pending).resolves.toEqual(credential);
  });

  it("rejects the signInWithApple promise on a failure result", async () => {
    const { win, postMessage } = installBootstrap("ios");
    const native = win.ChravelNative as { signInWithApple: () => Promise<unknown> };
    const pending = native.signInWithApple();

    const sent = JSON.parse(postMessage.mock.calls[0][0]);
    (win.__chravelResolveAppleSignIn as (id: string, r: unknown) => void)(sent.requestId, {
      ok: false,
      error: "ERR_REQUEST_CANCELED",
    });

    await expect(pending).rejects.toThrow("ERR_REQUEST_CANCELED");
  });

  it("attaches the cancel code to the rejection Error so the web can no-op instead of falling back", async () => {
    const { win, postMessage } = installBootstrap("ios");
    const native = win.ChravelNative as { signInWithApple: () => Promise<unknown> };
    const pending = native.signInWithApple();

    const sent = JSON.parse(postMessage.mock.calls[0][0]);
    (win.__chravelResolveAppleSignIn as (id: string, r: unknown) => void)(sent.requestId, {
      ok: false,
      error: "The operation was canceled",
      code: "canceled",
    });

    await expect(pending).rejects.toMatchObject({
      message: "The operation was canceled",
      code: "canceled",
    });
  });

  it("leaves the rejection Error code-less for generic failures (fallback preserved)", async () => {
    const { win, postMessage } = installBootstrap("ios");
    const native = win.ChravelNative as { signInWithApple: () => Promise<unknown> };
    const pending = native.signInWithApple();

    const sent = JSON.parse(postMessage.mock.calls[0][0]);
    (win.__chravelResolveAppleSignIn as (id: string, r: unknown) => void)(sent.requestId, {
      ok: false,
      error: "boom",
    });

    await expect(pending).rejects.toThrow("boom");
    await pending.catch((err) => {
      expect((err as Error & { code?: string }).code).toBeUndefined();
    });
  });

  it("does not expose signInWithApple on Android", () => {
    const { win } = installBootstrap("android");
    const native = win.ChravelNative as { signInWithApple?: () => Promise<unknown> };
    expect(native.signInWithApple).toBeUndefined();
    expect(win.__chravelResolveAppleSignIn).toBeUndefined();
  });
});

expect.extend({
  toEndWith(received: string, suffix: string) {
    const pass = received.endsWith(suffix);
    return {
      pass,
      message: () => `expected "${received}" to end with "${suffix}"`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEndWith(suffix: string): R;
    }
  }
}
