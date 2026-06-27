const fs = require('fs');

const IS_PROD = process.env.EAS_BUILD_PROFILE === 'production';

// Fail the build if required variables are missing in production.
if (IS_PROD) {
  if (!process.env.REVENUECAT_IOS_API_KEY) {
    throw new Error("Build Failed: Missing REVENUECAT_IOS_API_KEY environment variable.");
  }
  if (!process.env.REVENUECAT_ANDROID_API_KEY) {
    throw new Error("Build Failed: Missing REVENUECAT_ANDROID_API_KEY environment variable.");
  }
  // Android push configuration missing check
  if (!fs.existsSync('./google-services.json') && !process.env.GOOGLE_SERVICES_JSON) {
    throw new Error("Build Failed: google-services.json is missing. Android push notifications will fail.");
  }
}

module.exports = ({ config }) => ({
    ...config,
        name: "ChravelApp",
        slug: "chravel-mobile",
        owner: "meechyourgoals",
        version: "1.0.0",
        orientation: "default",
        icon: "./assets/icon.png",
        userInterfaceStyle: "automatic",
        scheme: "chravel",
        // @ts-ignore
        newArchEnabled: true,
        splash: {
          backgroundColor: "#0b0b0f",
      },
        assetBundlePatterns: ["**/*"],
            ios: {
    supportsTablet: true,
          bundleIdentifier: "com.chravel.app",
          buildNumber: "1",
          usesAppleSignIn: true,
          infoPlist: {
      NSCameraUsageDescription: "Chravel uses the camera to capture photos and videos you choose to share with your trips.",
              NSPhotoLibraryUsageDescription: "Chravel needs access to your photo library so you can upload photos and videos to trip chats and shared albums.",
              NSPhotoLibraryAddUsageDescription: "Chravel needs permission to save trip photos and videos to your library when you choose to download media.",
              NSLocationWhenInUseUsageDescription: "Chravel uses your location (only while you're using the app) for optional location sharing and to help coordinate meetups during a trip.",
              NSMicrophoneUsageDescription: "Chravel uses your microphone for AI Concierge voice conversations when you tap the mic.",
              NSSpeechRecognitionUsageDescription: "Chravel uses speech recognition to transcribe your voice input for AI Concierge and chat dictation.",
              ITSAppUsesNonExemptEncryption: false,
              // Home-screen name must match the App Store listing title "Chravel"
              // (store.config.json) to avoid a Guideline 2.3.7 name-mismatch nit.
              CFBundleDisplayName: "Chravel",
        },
            associatedDomains: ["applinks:chravel.app", "applinks:www.chravel.app", "webcredentials:chravel.app"],
            entitlements: {
      "aps-environment": "production",
              "com.apple.developer.applesignin": ["Default"],
        },
            privacyManifests: {
      NSPrivacyTracking: false,
              NSPrivacyTrackingDomains: [],
              NSPrivacyCollectedDataTypes: [
        {
                  NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
                              NSPrivacyCollectedDataTypeLinked: true,
                              NSPrivacyCollectedDataTypeTracking: false,
                              NSPrivacyCollectedDataTypePurposes: [
                                "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                "NSPrivacyCollectedDataTypePurposeProductPersonalization",
                              ],
                    },
                    {
                              NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
                              NSPrivacyCollectedDataTypeLinked: true,
                              NSPrivacyCollectedDataTypeTracking: false,
                              NSPrivacyCollectedDataTypePurposes: [
                                "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                              ],
                    },
                    {
                              NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhoneNumber",
                                          NSPrivacyCollectedDataTypeLinked: true,
                                          NSPrivacyCollectedDataTypeTracking: false,
                                          NSPrivacyCollectedDataTypePurposes: [
                                            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                          ],
                                },
                                {
                                          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhotosOrVideos",
                                                      NSPrivacyCollectedDataTypeLinked: true,
                                                      NSPrivacyCollectedDataTypeTracking: false,
                                                      NSPrivacyCollectedDataTypePurposes: [
                                                        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                                      ],
                                            },
                                            {
                                                      NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePreciseLocation",
                                                                  NSPrivacyCollectedDataTypeLinked: true,
                                                                  NSPrivacyCollectedDataTypeTracking: false,
                                                                  NSPrivacyCollectedDataTypePurposes: [
                                                                    "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                                                  ],
                                                        },
                                                        {
                                                                  NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeUserID",
                                                                              NSPrivacyCollectedDataTypeLinked: true,
                                                                              NSPrivacyCollectedDataTypeTracking: false,
                                                                              NSPrivacyCollectedDataTypePurposes: [
                                                                                "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                                                              ],
                                                                    },
                                                                    {
                                                                              NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeProductInteraction",
                                                                                          NSPrivacyCollectedDataTypeLinked: true,
                                                                                          NSPrivacyCollectedDataTypeTracking: false,
                                                                                          NSPrivacyCollectedDataTypePurposes: [
                                                                                            "NSPrivacyCollectedDataTypePurposeAnalytics",
                                                                                            "NSPrivacyCollectedDataTypePurposeProductPersonalization",
                                                                                          ],
                                                                                },
                                                                                {
                                                                                          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeCrashData",
                                                                                          NSPrivacyCollectedDataTypeLinked: true,
                                                                                          NSPrivacyCollectedDataTypeTracking: false,
                                                                                          NSPrivacyCollectedDataTypePurposes: [
                                                                                            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                                                                          ],
                                                                                },
                                                                                {
                                                                                          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePurchaseHistory",
                                                                                                      NSPrivacyCollectedDataTypeLinked: true,
                                                                                                      NSPrivacyCollectedDataTypeTracking: false,
                                                                                                      NSPrivacyCollectedDataTypePurposes: [
                                                                                                        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                                                                                      ],
                                                                                            },
                                                                                                  ],
                                                                                                  NSPrivacyAccessedAPITypes: [
                                                                                            {
                                                                                                      NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
                                                                                                                  NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
                                                                                                        },
{
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
                      NSPrivacyAccessedAPITypeReasons: ["C617.1"],
            },
{
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
                      NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
            },
{
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
                      NSPrivacyAccessedAPITypeReasons: ["E174.1"],
            },
                  ],
            },
            },
              android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
              backgroundColor: "#191817",
        },
            package: "com.chravel.app",
                  googleServicesFile: "./google-services.json",
                  permissions: [
                    "CAMERA",
                    "ACCESS_FINE_LOCATION",
                    "RECORD_AUDIO",
                    "VIBRATE",
                    "RECEIVE_BOOT_COMPLETED",
                  ],
                  intentFilters: [
              {
                      action: "VIEW",
                                autoVerify: true,
                                data: [
                        { scheme: "https", host: "chravel.app", pathPrefix: "/trip" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/j" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/join" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/invite" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/tour" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/event" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/share" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/profile" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/organization" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/auth-callback" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/auth" },
{ scheme: "https", host: "chravel.app", pathPrefix: "/settings" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/trip" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/j" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/join" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/invite" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/tour" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/event" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/share" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/profile" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/organization" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/auth-callback" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/auth" },
{ scheme: "https", host: "www.chravel.app", pathPrefix: "/settings" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
  },
{
        action: "VIEW",
                  data: [
          { scheme: "chravel", host: "auth-callback" }
        ],
        category: ["BROWSABLE", "DEFAULT"],
          }
              ],
          },
            plugins: [
              // Runs first so its Info.plist mod runs LAST (config-plugins runs
              // mods in reverse registration order): strips the unused "audio"
              // UIBackgroundMode so we never regress App Store Guideline 2.5.4.
              "./plugins/withNoAudioBackgroundMode",
              "expo-notifications",
              // Native Sign in with Apple (ASAuthorization). The
              // com.apple.developer.applesignin entitlement + usesAppleSignIn
              // are already declared in ios above; this links the module so
              // window.ChravelNative.signInWithApple() works (Guideline 2.1(a)).
              "expo-apple-authentication",
              [
                "expo-audio",
          {
                  microphonePermission: "Chravel needs microphone access for voice conversations with AI Concierge",
                  // Chravel only records / plays audio in the FOREGROUND (voice
                  // notes + AI Concierge TTS). Disabling these keeps expo-audio
                  // from adding the "audio" UIBackgroundMode (Guideline 2.5.4)
                  // and the matching Android foreground-service permissions.
                  enableBackgroundRecording: false,
                  enableBackgroundPlayback: false,
                    },
              ],
              // NOTE: "@mykin-ai/expo-audio-stream" is intentionally NOT listed
              // as a config plugin. Its plugin unconditionally injects the
              // "audio" UIBackgroundMode (no opt-out), which Apple rejects under
              // Guideline 2.5.4. The native module still autolinks from the
              // dependency (expo-module.config.json) for Android PCM capture, so
              // voice capture is unaffected; RECORD_AUDIO is declared below.
              [
                "expo-splash-screen",
                {
                  backgroundColor: "#0b0b0f",
                  image: "./assets/splash-lockup.png",
                  imageWidth: 320,
                  resizeMode: "contain",
                  dark: {
                    backgroundColor: "#0b0b0f",
                  },
                  ios: {
                    backgroundColor: "#0b0b0f",
                    image: "./assets/splash-lockup.png",
                    imageWidth: 320,
                    resizeMode: "contain",
                  },
                  android: {
                    backgroundColor: "#0b0b0f",
                    // Android 12+ masks the splash icon to an inscribed
                    // circle, so the portrait lockup used on iOS would
                    // clip the wordmark/tagline. splash-icon-android.png
                    // is composed (see regenerate.py chord math) so the
                    // globe + gradient ChravelApp wordmark + tagline all
                    // sit inside the masked circle. imageWidth 240 ≈ the
                    // Android 12+ icon canvas — large enough for the
                    // tagline to remain legible on phone-class densities.
                    image: "./assets/splash-icon-android.png",
                    imageWidth: 240,
                    resizeMode: "contain",
                  },
                },
              ],
            ],
            extra: {
    eas: { projectId: "a543c88d-bece-4433-9aa2-d0e842a5c927" },
          webAppUrl: process.env.EXPO_PUBLIC_WEB_APP_URL || "https://chravel.app",
                revenueCatIosApiKey: process.env.REVENUECAT_IOS_API_KEY || "",
                revenueCatAndroidApiKey: process.env.REVENUECAT_ANDROID_API_KEY || "",
            },
});
