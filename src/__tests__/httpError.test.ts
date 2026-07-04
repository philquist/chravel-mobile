import { isFatalHttpError } from "../httpError";

const LAUNCH_URL = "https://chravel.app/auth?app_context=native&_v=abc123";

describe("isFatalHttpError", () => {
  it("is fatal for a 404 on the exact launch URL (initial-load main document)", () => {
    expect(
      isFatalHttpError({
        statusCode: 404,
        url: LAUNCH_URL,
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(true);
  });

  it("is fatal for a 403 on the main document even when query strings differ", () => {
    expect(
      isFatalHttpError({
        statusCode: 403,
        url: "https://chravel.app/auth",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(true);
  });

  it("is not fatal for a same-host sub-resource 404 (Android fires per resource)", () => {
    expect(
      isFatalHttpError({
        statusCode: 404,
        url: "https://chravel.app/assets/img.png",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(false);
  });

  it("is not fatal for third-party hosts, regardless of status", () => {
    expect(
      isFatalHttpError({
        statusCode: 404,
        url: "https://xyz.supabase.co/rest/v1/trips",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(false);
    expect(
      isFatalHttpError({
        statusCode: 500,
        url: "https://js.stripe.com/v3/",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(false);
  });

  it("is not fatal for a chravel.app look-alike host", () => {
    expect(
      isFatalHttpError({
        statusCode: 403,
        url: "https://chravel.app.evil.com/auth",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(false);
  });

  it("is fatal for a 500 on the main document (behavior preserved)", () => {
    expect(
      isFatalHttpError({
        statusCode: 500,
        url: LAUNCH_URL,
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(true);
  });

  it("falls back to the legacy 5xx rule when the event has no url", () => {
    expect(
      isFatalHttpError({ statusCode: 500, url: undefined, currentUrl: LAUNCH_URL }),
    ).toBe(true);
    expect(
      isFatalHttpError({ statusCode: 404, url: undefined, currentUrl: LAUNCH_URL }),
    ).toBe(false);
    expect(
      isFatalHttpError({ statusCode: 502, url: "", currentUrl: LAUNCH_URL }),
    ).toBe(true);
  });

  it("is not fatal below 400", () => {
    expect(
      isFatalHttpError({ statusCode: 399, url: LAUNCH_URL, currentUrl: LAUNCH_URL }),
    ).toBe(false);
    expect(
      isFatalHttpError({ statusCode: 302, url: LAUNCH_URL, currentUrl: LAUNCH_URL }),
    ).toBe(false);
  });

  it("normalizes trailing slashes on the path comparison", () => {
    expect(
      isFatalHttpError({
        statusCode: 404,
        url: "https://chravel.app/auth/",
        currentUrl: "https://chravel.app/auth?app_context=native",
      }),
    ).toBe(true);
  });

  it("treats www.chravel.app and chravel.app as the same document host", () => {
    expect(
      isFatalHttpError({
        statusCode: 403,
        url: "https://www.chravel.app/auth",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(true);
  });

  it("is not fatal for malformed or non-https URLs", () => {
    expect(
      isFatalHttpError({
        statusCode: 404,
        url: "not a url",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(false);
    expect(
      isFatalHttpError({
        statusCode: 404,
        url: "http://chravel.app/auth",
        currentUrl: LAUNCH_URL,
      }),
    ).toBe(false);
  });
});
