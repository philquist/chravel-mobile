import { isAuthReturnFlowUrl, isAuthScreenUrl } from "../authUrl";

describe("isAuthReturnFlowUrl", () => {
  it("is true for /auth and /auth-callback on chravel.app", () => {
    expect(isAuthReturnFlowUrl("https://chravel.app/auth?app_context=native")).toBe(
      true,
    );
    expect(
      isAuthReturnFlowUrl(
        "https://chravel.app/auth-callback?code=pkce&app_context=native",
      ),
    ).toBe(true);
  });

  it("is false for authenticated app routes", () => {
    expect(isAuthReturnFlowUrl("https://chravel.app/trip/abc?tab=chat")).toBe(
      false,
    );
  });

  it("is false for non-chravel hosts", () => {
    expect(isAuthReturnFlowUrl("https://evil.com/auth")).toBe(false);
  });
});

describe("isAuthScreenUrl", () => {
  it("matches sign-in routes only", () => {
    expect(isAuthScreenUrl("https://chravel.app/auth")).toBe(true);
    expect(isAuthScreenUrl("https://chravel.app/auth-callback?code=x")).toBe(
      false,
    );
  });
});
