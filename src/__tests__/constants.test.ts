describe("constants", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("uses the configured HTTPS web app origin", () => {
    jest.doMock("react-native", () => ({ Platform: { OS: "ios", isPad: false } }));
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: { webAppUrl: "https://staging.chravel.app/some/path" },
        },
      },
    }));

    const { WEB_APP_URL } = require("../constants");

    expect(WEB_APP_URL).toBe("https://staging.chravel.app");
  });

  it("falls back to production for non-HTTPS or invalid URLs", () => {
    jest.doMock("react-native", () => ({ Platform: { OS: "ios", isPad: false } }));
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: { webAppUrl: "http://localhost:3000" },
        },
      },
    }));

    const { WEB_APP_URL } = require("../constants");

    expect(WEB_APP_URL).toBe("https://chravel.app");
  });
});

describe("supportsHttpsAuthCallback", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function loadWithPlatform(os: string, version: string | number) {
    jest.doMock("react-native", () => ({
      Platform: { OS: os, isPad: false, Version: version },
    }));
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { expoConfig: {} },
    }));
    return require("../constants").supportsHttpsAuthCallback as () => boolean;
  }

  it("is true on iOS 17.4 (first version with https ASWebAuthenticationSession callbacks)", () => {
    expect(loadWithPlatform("ios", "17.4")()).toBe(true);
  });

  it("is true on newer iOS like 26.5 (iPadOS target)", () => {
    expect(loadWithPlatform("ios", "26.5")()).toBe(true);
  });

  it("is true on iOS 18.0", () => {
    expect(loadWithPlatform("ios", "18.0")()).toBe(true);
  });

  it("is false on iOS 17.3 (before https callback support)", () => {
    expect(loadWithPlatform("ios", "17.3")()).toBe(false);
  });

  it("is false on older iOS like 16.7", () => {
    expect(loadWithPlatform("ios", "16.7.2")()).toBe(false);
  });

  it("is false on Android regardless of version", () => {
    expect(loadWithPlatform("android", 34)()).toBe(false);
  });
});
