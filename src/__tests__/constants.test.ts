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
