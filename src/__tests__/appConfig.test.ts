/**
 * Guards App Store review-sensitive invariants in app.config.js: the privacy
 * manifest, permission strings, and Android permissions must stay mutually
 * consistent (no half-configured capability) and must never re-enable
 * tracking. app.config.js is a plain CJS module, so it loads under ts-jest
 * with no Expo runtime.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const buildConfig = require("../../app.config.js");

interface CollectedDataType {
  NSPrivacyCollectedDataType: string;
  NSPrivacyCollectedDataTypeLinked: boolean;
  NSPrivacyCollectedDataTypeTracking: boolean;
  NSPrivacyCollectedDataTypePurposes: string[];
}

const config = buildConfig({ config: {} });
const infoPlist = config.ios.infoPlist as Record<string, unknown>;
const privacyManifests = config.ios.privacyManifests as {
  NSPrivacyTracking: boolean;
  NSPrivacyTrackingDomains: string[];
  NSPrivacyCollectedDataTypes: CollectedDataType[];
};
const androidPermissions = config.android.permissions as string[];

const collectedTypes = privacyManifests.NSPrivacyCollectedDataTypes;
const findType = (name: string) =>
  collectedTypes.find((t) => t.NSPrivacyCollectedDataType === name);

describe("app.config.js privacy manifest", () => {
  it("declares Audio Data (AI Concierge streams mic audio off-device)", () => {
    const audio = findType("NSPrivacyCollectedDataTypeAudioData");
    expect(audio).toBeDefined();
    expect(audio!.NSPrivacyCollectedDataTypeLinked).toBe(true);
    expect(audio!.NSPrivacyCollectedDataTypeTracking).toBe(false);
    expect(audio!.NSPrivacyCollectedDataTypePurposes).toEqual([
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
    ]);
  });

  it("pairs the Audio Data disclosure with a microphone usage string", () => {
    expect(findType("NSPrivacyCollectedDataTypeAudioData")).toBeDefined();
    expect(typeof infoPlist.NSMicrophoneUsageDescription).toBe("string");
    expect(
      (infoPlist.NSMicrophoneUsageDescription as string).length,
    ).toBeGreaterThan(0);
  });

  it("never enables tracking (no ATT surface)", () => {
    expect(privacyManifests.NSPrivacyTracking).toBe(false);
    expect(privacyManifests.NSPrivacyTrackingDomains).toEqual([]);
    for (const type of collectedTypes) {
      expect(type.NSPrivacyCollectedDataTypeTracking).toBe(false);
    }
  });
});

describe("app.config.js location consistency", () => {
  // Location is either fully configured (iOS usage string + Android runtime
  // permission + privacy-manifest disclosure) or fully absent. A
  // half-configured state is an App Store metadata-mismatch risk (5.1.1).
  it("declares all three location pieces together, or none", () => {
    const hasUsageString =
      typeof infoPlist.NSLocationWhenInUseUsageDescription === "string";
    const hasAndroidPermission = androidPermissions.includes(
      "ACCESS_FINE_LOCATION",
    );
    const hasManifestEntry =
      findType("NSPrivacyCollectedDataTypePreciseLocation") !== undefined;

    expect(hasAndroidPermission).toBe(hasUsageString);
    expect(hasManifestEntry).toBe(hasUsageString);
  });
});

describe("app.config.js review-critical identity", () => {
  it("keeps bundle ID, Apple Sign In, and display-name parity intact", () => {
    expect(config.ios.bundleIdentifier).toBe("com.chravel.app");
    expect(config.ios.usesAppleSignIn).toBe(true);
    expect(config.ios.entitlements["com.apple.developer.applesignin"]).toEqual([
      "Default",
    ]);
    // Guideline 2.3.7: home-screen name matches the store listing title.
    expect(infoPlist.CFBundleDisplayName).toBe("ChravelApp");
  });
});
