import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { runNativeAppleSignIn, getAppleSignInFailureCode } from "../appleAuth";

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock("expo-crypto", () => ({
  // 4 deterministic bytes so the raw nonce is predictable hex: "00010203".
  getRandomBytesAsync: jest.fn(async () => new Uint8Array([0, 1, 2, 3])),
  digestStringAsync: jest.fn(async (_algo: string, value: string) => `sha256(${value})`),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const mockedApple = AppleAuthentication as jest.Mocked<typeof AppleAuthentication>;
const mockedCrypto = Crypto as jest.Mocked<typeof Crypto>;

describe("runNativeAppleSignIn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApple.isAvailableAsync.mockResolvedValue(true);
  });

  it("sends the SHA256-hashed nonce to Apple but returns the RAW nonce", async () => {
    mockedApple.signInAsync.mockResolvedValue({
      identityToken: "id-token-xyz",
      authorizationCode: "auth-code-abc",
      email: "user@example.com",
      fullName: { givenName: "Ada", familyName: "Lovelace" },
    } as unknown as AppleAuthentication.AppleAuthenticationCredential);

    const result = await runNativeAppleSignIn();

    // Raw nonce is the hex of the deterministic random bytes.
    const rawNonce = "00010203";
    expect(mockedCrypto.digestStringAsync).toHaveBeenCalledWith("SHA-256", rawNonce);
    // The hashed nonce — not the raw one — is what Apple receives.
    expect(mockedApple.signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: `sha256(${rawNonce})` }),
    );
    // The web app receives the RAW nonce (Supabase re-hashes it).
    expect(result.rawNonce).toBe(rawNonce);
    expect(result.identityToken).toBe("id-token-xyz");
    expect(result.authorizationCode).toBe("auth-code-abc");
    expect(result.email).toBe("user@example.com");
    expect(result.fullName).toBe("Ada Lovelace");
  });

  it("requests FULL_NAME and EMAIL scopes", async () => {
    mockedApple.signInAsync.mockResolvedValue({
      identityToken: "id-token",
    } as unknown as AppleAuthentication.AppleAuthenticationCredential);

    await runNativeAppleSignIn();

    expect(mockedApple.signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      }),
    );
  });

  it("omits email/fullName/authorizationCode when Apple does not return them", async () => {
    mockedApple.signInAsync.mockResolvedValue({
      identityToken: "id-token",
      authorizationCode: null,
      email: null,
      fullName: null,
    } as unknown as AppleAuthentication.AppleAuthenticationCredential);

    const result = await runNativeAppleSignIn();

    expect(result.authorizationCode).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.fullName).toBeUndefined();
  });

  it("throws when Apple authentication is unavailable", async () => {
    mockedApple.isAvailableAsync.mockResolvedValue(false);
    await expect(runNativeAppleSignIn()).rejects.toThrow(/not available/i);
    expect(mockedApple.signInAsync).not.toHaveBeenCalled();
  });

  it("throws when no identity token is returned", async () => {
    mockedApple.signInAsync.mockResolvedValue({
      identityToken: null,
    } as unknown as AppleAuthentication.AppleAuthenticationCredential);

    await expect(runNativeAppleSignIn()).rejects.toThrow(/identity token/i);
  });

  it("propagates a user cancellation so the caller can fall back to web OAuth", async () => {
    mockedApple.signInAsync.mockRejectedValue(
      Object.assign(new Error("The operation was canceled"), {
        code: "ERR_REQUEST_CANCELED",
      }),
    );

    await expect(runNativeAppleSignIn()).rejects.toThrow("The operation was canceled");
  });
});

describe("getAppleSignInFailureCode", () => {
  it("maps the expo-apple-authentication cancel codes to 'canceled'", () => {
    expect(
      getAppleSignInFailureCode(
        Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }),
      ),
    ).toBe("canceled");
    expect(
      getAppleSignInFailureCode(
        Object.assign(new Error("canceled"), { code: "ERR_CANCELED" }),
      ),
    ).toBe("canceled");
  });

  it("returns undefined for real failures so the web OAuth fallback still runs", () => {
    expect(getAppleSignInFailureCode(new Error("no identity token"))).toBeUndefined();
    expect(
      getAppleSignInFailureCode(
        Object.assign(new Error("boom"), { code: "ERR_INVALID_RESPONSE" }),
      ),
    ).toBeUndefined();
  });

  it("tolerates non-Error and malformed inputs", () => {
    expect(getAppleSignInFailureCode(null)).toBeUndefined();
    expect(getAppleSignInFailureCode(undefined)).toBeUndefined();
    expect(getAppleSignInFailureCode("ERR_REQUEST_CANCELED")).toBeUndefined();
    expect(getAppleSignInFailureCode({ code: 42 })).toBeUndefined();
  });
});
