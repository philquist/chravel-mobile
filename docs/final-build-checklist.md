# Chravel mobile final build checklist

This repository is the Expo native shell for the production web app hosted from
`https://github.com/Chravel-Inc/chravel-web`. Do not convert this repository into
a monorepo. Keep the native wrapper small and verify that the web app publishes
compatible routes, bridge events, auth callbacks, subscription package IDs, and
push payloads before each store submission.

## Repo checks

1. Install dependencies from this repository root with `npm ci`.
2. Run `npm test` and `npx tsc --noEmit`.
3. Confirm `EXPO_PUBLIC_WEB_APP_URL` points at the intended HTTPS origin for the
   build profile. Production should use `https://chravel.app`.
4. Confirm `REVENUECAT_IOS_API_KEY`, `REVENUECAT_ANDROID_API_KEY`, and
   `GOOGLE_SERVICES_JSON` are configured as EAS environment variables for
   production builds.
5. Confirm `google-services.json` and `play-store-service-account.json` are not
   committed. They must come from EAS secrets or local release-only files.

## EAS build commands

Use the mobile repository root as the working directory:

```sh
eas build --platform ios --profile production
eas build --platform android --profile production
```

Production Android builds must produce an AAB. Production iOS builds must use a
Release configuration. EAS remote versioning is enabled, so initialize or inspect
remote versions before the first production upload and let production builds
auto-increment afterward.

## EAS submit commands

```sh
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Before Android production submission, verify that Play Console API access and the
service account used by EAS Submit can upload to the configured track.

## Domain association files

The native app declares Universal Links and Android App Links for both
`chravel.app` and `www.chravel.app`. The web repo/hosting layer must serve valid
JSON at these URLs:

- `https://chravel.app/.well-known/apple-app-site-association`
- `https://www.chravel.app/.well-known/apple-app-site-association`
- `https://chravel.app/.well-known/assetlinks.json`
- `https://www.chravel.app/.well-known/assetlinks.json`

The Apple file must include app ID `2T6WY43H3X.com.chravel.app`. The Android file
must include package `com.chravel.app` and the SHA-256 fingerprint for the EAS
Android signing certificate.

## Store review smoke test

Run these checks on physical iOS and Android devices before submitting for
review:

1. Fresh install opens `/auth?app_context=native` on the production web origin.
2. OAuth opens in the native auth session and returns to `chravel://auth-callback`.
3. Universal/App Links open trip, invite, auth, settings, and profile routes in
   the app instead of the browser.
4. Push prompt, native permission request, token registration, notification tap,
   and inline notification actions work.
5. RevenueCat purchase, cancel, restore, and entitlement refresh paths work in
   sandbox/test tracks.
6. Camera/photo upload and voice/microphone flows work without broad Android
   storage permissions.
7. Terms, privacy policy, support, and account deletion are reachable from the
   app and from store metadata.
8. Reviewer credentials or a demo path are provided in App Store Connect and
   Play Console app access instructions.
