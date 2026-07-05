import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  WEB_APP_URL,
  NATIVE_BRIDGE_VERSION,
  NATIVE_USER_AGENT_SUFFIX,
  COLORS,
  IS_TABLET,
} from "./constants";
import {
  buildNativeBootstrapJS,
  buildNativeDocumentEndJS,
  buildWebEvent,
  buildPushPermissionResponse,
  buildAppleSignInResponse,
  buildAppUrlOpenDispatch,
  buildClearPushRegistrationCache,
  parseBridgeMessage,
} from "./bridge";
import { runNativeAppleSignIn, getAppleSignInFailureCode } from "./appleAuth";
import {
  registerForPushNotifications,
  checkPushPermission,
  requestPushPermission,
  resolveNotificationResponse,
  consumeNotificationResponse,
  clearNotificationBadge,
} from "./notifications";
import { triggerHaptic } from "./haptics";
import { isAuthReturnFlowUrl } from "./authUrl";
import {
  buildWebViewLaunchUrl,
  buildNativeAuthLaunchUrl,
  getInitialURL,
  onDeepLink,
  parseDeepLinkUrl,
  isAuthScreenUrl,
  isJoinPath,
  isNativeAuthReturnPath,
  preferExistingDeferredPath,
  NATIVE_OAUTH_CALLBACK_URL,
  rewriteOAuthUrlForNativeCallback,
} from "./deepLinking";
import {
  configureRevenueCat,
  identifyUser,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
} from "./revenuecat";
import { VoiceBridge, type VoiceBridgeMessage } from "./voiceBridge";
import {
  evaluateWebViewRequestPolicy,
  isOAuthAuthorizeUrl,
  isBlockedPurchaseUrl,
} from "./webViewRequestFilter";
import { evaluateReadyDecision } from "./authRouting";
import { isFatalHttpError } from "./httpError";

interface ChravelWebViewProps {
  onError: () => void;
  onInitialLoadEnd?: () => void;
}

export function ChravelWebView({ onError, onInitialLoadEnd }: ChravelWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const wasOnAuthRef = useRef(true); // WebView starts at /auth
  const currentUrlRef = useRef(buildNativeAuthLaunchUrl());
  const isAuthRedirectRef = useRef(false); // true after OAuth deep link
  const voiceBridgeRef = useRef(new VoiceBridge());
  const didProactiveRegisterRef = useRef(false); // proactive push register runs once per launch
  const isReadyRef = useRef(false);
  const initialUrlRef = useRef<string | null>(null);
  const loadingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReportedInitialLoadEndRef = useRef(false);
  const nativeBootstrapJS = useMemo(
    () => buildNativeBootstrapJS(Platform.OS, IS_TABLET, NATIVE_BRIDGE_VERSION),
    [],
  );
  const nativeDocumentEndJS = useMemo(
    () =>
      buildNativeDocumentEndJS(
        Platform.OS,
        insets.bottom,
        IS_TABLET,
        NATIVE_BRIDGE_VERSION,
      ),
    [insets.bottom],
  );

  const clearLoadingFallbackTimer = useCallback(() => {
    if (loadingHideTimerRef.current !== null) {
      clearTimeout(loadingHideTimerRef.current);
      loadingHideTimerRef.current = null;
    }
  }, []);

  const scheduleLoadingFallback = useCallback(() => {
    clearLoadingFallbackTimer();
    loadingHideTimerRef.current = setTimeout(() => {
      loadingHideTimerRef.current = null;
      setIsLoading(false);
    }, 2000);
  }, [clearLoadingFallbackTimer]);

  useEffect(() => () => clearLoadingFallbackTimer(), [clearLoadingFallbackTimer]);

  // ── Initialize native SDKs ──────────────────────────────────

  useEffect(() => {
    configureRevenueCat();
  }, []);

  // ── Voice bridge lifecycle ────────────────────────────────────

  useEffect(() => {
    return () => {
      voiceBridgeRef.current.dispose();
    };
  }, []);

  // ── Deep linking ────────────────────────────────────────────

  const navigateWebView = useCallback((path: string) => {
    const fullUrl = buildWebViewLaunchUrl(path);
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(fullUrl)}; true;`,
    );
  }, []);

  /** Apply a deep-link path (OAuth callback vs in-app route). Used for live links and deferred cold-start / notification paths. */
  const handleIncomingPath = useCallback(
    (path: string) => {
      if (isNativeAuthReturnPath(path)) {
        isAuthRedirectRef.current = true;
        clearLoadingFallbackTimer();
        setIsLoading(true);
        void WebBrowser.dismissBrowser();
        navigateWebView(path);
        return;
      }
      // Any non-callback route means OAuth redirect handling is complete (or not in play).
      // Reset the flag so a stale auth-redirect state cannot keep the loading overlay pinned.
      isAuthRedirectRef.current = false;
      if (isJoinPath(path)) {
        // Invite links (/j/:code, /join/:code) go through the Capacitor App
        // shim's appUrlOpen event so the web SPA router navigates in place.
        // Falls back to a full navigation if no listener is attached.
        const fullUrl = buildWebViewLaunchUrl(path);
        webViewRef.current?.injectJavaScript(
          buildAppUrlOpenDispatch(fullUrl, fullUrl),
        );
        return;
      }
      navigateWebView(path);
    },
    [navigateWebView, clearLoadingFallbackTimer],
  );

  /**
   * Open an IdP authorize URL via the OS auth session so Supabase can redirect
   * the OAuth result back into the app and the MAIN WebView (which shares
   * cookie/localStorage with chravel.app) can run Supabase's PKCE code exchange
   * / detectSessionInUrl.
   *
   * Always uses the chravel:// custom-scheme callback. ASWebAuthenticationSession
   * (iOS) and Custom Tabs (Android) natively capture a custom-scheme redirect and
   * hand it back here WITHOUT opening external Safari. The iOS 17.4+ https
   * callback (bound to webcredentials:chravel.app) was unreliable in the field —
   * the redirect could fail to return into the app and bounce the user back to
   * /auth (App Store Guideline 2.1(a)) — so we no longer use it.
   */
  const openOAuthAuthSession = useCallback(
    async (url: string) => {
      const callbackUrl = NATIVE_OAUTH_CALLBACK_URL;
      const nativeAuthUrl = rewriteOAuthUrlForNativeCallback(url, callbackUrl);
      const result = await WebBrowser.openAuthSessionAsync(
        nativeAuthUrl,
        callbackUrl,
      );
      if (result.type === "success" && result.url) {
        // result.url is the chravel://auth-callback redirect carrying the PKCE
        // ?code= (or legacy #access_token). Navigate the SAME WebView to it
        // (parseDeepLinkUrl preserves the query + hash and restricts to
        // chravel.app) so the web app exchanges it for a session in shared
        // storage. We never open the callback in a secondary WebView or Safari.
        const nextPath = parseDeepLinkUrl(result.url);
        if (nextPath && isNativeAuthReturnPath(nextPath)) {
          handleIncomingPath(nextPath);
        }
      }
    },
    [handleIncomingPath],
  );

  useEffect(() => {
    getInitialURL().then((path) => {
      if (!path) return;
      if (isReadyRef.current) {
        handleIncomingPath(path);
      } else {
        initialUrlRef.current = preferExistingDeferredPath(
          initialUrlRef.current,
          path,
        );
      }
    });

    const unsub = onDeepLink((path) => {
      if (isReadyRef.current) {
        handleIncomingPath(path);
      } else {
        initialUrlRef.current = preferExistingDeferredPath(
          initialUrlRef.current,
          path,
        );
      }
    });
    return unsub;
  }, [handleIncomingPath]);

  // ── Push notification taps ──────────────────────────────────

  const lastHandledNotificationIdRef = useRef<string | null>(null);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const consumed = consumeNotificationResponse(
        response,
        lastHandledNotificationIdRef.current,
      );
      if (consumed.isDuplicate || !consumed.resolved) return;

      lastHandledNotificationIdRef.current = consumed.notificationId;

      if (consumed.resolved.kind === "inline-action") {
        webViewRef.current?.injectJavaScript(
          buildWebEvent("chravel:notification-action", {
            action: consumed.resolved.action,
            userText: consumed.resolved.userText,
            type: consumed.resolved.type,
            tripId: consumed.resolved.tripId,
            threadId: consumed.resolved.threadId,
          }),
        );
        return;
      }

      if (isReadyRef.current) {
        handleIncomingPath(consumed.resolved.path);
      } else {
        initialUrlRef.current = consumed.resolved.path;
      }
    },
    [handleIncomingPath],
  );

  useEffect(() => {
    // Cold-start taps are stored natively before JS listeners attach; read
    // the launch response explicitly (expo-notifications contract).
    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      handleNotificationResponse(launchResponse);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    return () => subscription.remove();
  }, [handleNotificationResponse]);

  // ── App-icon badge clearing ─────────────────────────────────
  // The backend sets aps.badge on iOS pushes. Clear the badge (and dismiss
  // delivered notifications) whenever the app comes to the foreground, plus
  // once on mount for the cold-start case (where AppState is already active).
  useEffect(() => {
    void clearNotificationBadge();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void clearNotificationBadge();
      }
    });
    return () => subscription.remove();
  }, []);

  // ── Push token forwarding ───────────────────────────────────
  // The native shell only obtains the device token (APNs on iOS, FCM on
  // Android); the web app owns the push_device_tokens upsert, so it needs the
  // platform alongside the token.
  const emitPushToken = useCallback(
    (result: { token: string | null; error?: string }) => {
      webViewRef.current?.injectJavaScript(
        buildWebEvent("chravel:push-token", {
          token: result.token,
          platform: Platform.OS,
          error: result.error ?? null,
        }),
      );
    },
    [],
  );

  // ── Bridge message handler ──────────────────────────────────

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    const message = parseBridgeMessage(event.nativeEvent.data);
    if (!message) return;

    switch (message.type) {
      case "ready": {
        clearLoadingFallbackTimer();
        const decision = evaluateReadyDecision({
          isAuthRedirect: isAuthRedirectRef.current,
          currentUrl: currentUrlRef.current,
          pendingPath: initialUrlRef.current,
        });

        if (decision.keepLoadingOverlay) {
          scheduleLoadingFallback();
        } else {
          isAuthRedirectRef.current = false;
          setIsLoading(false);
        }

        isReadyRef.current = true;
        if (decision.applyPathNow) {
          initialUrlRef.current = null;
          handleIncomingPath(decision.applyPathNow);
        }

        // Proactively forward the push token on launch if permission was
        // already granted (returning users), without prompting — the
        // PushPrePrompt / web-driven push:register handles first-time prompts.
        // The web app upserts push_device_tokens once it receives the token.
        if (!didProactiveRegisterRef.current) {
          didProactiveRegisterRef.current = true;
          void registerForPushNotifications({ promptIfNeeded: false }).then(
            (result) => {
              if (result.token) emitPushToken(result);
            },
          );
        }
        break;
      }

      case "haptic":
        await triggerHaptic(message.style);
        break;

      case "browser:open":
        if (message.url) {
          // chravel-web's openInstalledAuthBrowser prefers
          // Capacitor.Plugins.Browser.open() for OAuth. Route those through
          // an auth session so the redirect to chravel://auth-callback is
          // captured and the main WebView can hydrate the Supabase session.
          if (isOAuthAuthorizeUrl(message.url)) {
            await openOAuthAuthSession(message.url);
          } else if (isBlockedPurchaseUrl(message.url, Platform.OS)) {
            // iOS: refuse to open an external checkout surface (Guideline
            // 3.1.1). Digital subscriptions must go through RevenueCat IAP.
            // Intentionally a no-op — do not steer to external payment.
          } else {
            await WebBrowser.openBrowserAsync(message.url, {
              // PAGE_SHEET (not POPOVER): a popover requires a non-nil source
              // anchor on iPad and crashes/no-ops without one (expo #33995),
              // while a page sheet presents safely on both iPhone and iPad.
              presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
            });
          }
        }
        break;

      case "oauth:open":
        if (message.url) {
          await openOAuthAuthSession(message.url);
        }
        break;

      case "push:register": {
        const result = await registerForPushNotifications();
        emitPushToken(result);
        break;
      }

      case "push:unregister":
        webViewRef.current?.injectJavaScript(
          `${buildClearPushRegistrationCache()}
${buildWebEvent("chravel:push-unregistered", { success: true })}`,
        );
        break;

      case "push:checkPermissions":
      case "push:requestPermissions": {
        // Always resolve the shim's pending promise — fall back to "denied"
        // if the native permission lookup throws, so web push flows that
        // await checkPermissions()/requestPermissions() can't hang forever.
        let receive: string = "denied";
        try {
          receive =
            message.type === "push:checkPermissions"
              ? await checkPushPermission()
              : await requestPushPermission();
        } catch {
          receive = "denied";
        }
        webViewRef.current?.injectJavaScript(
          buildPushPermissionResponse(message.requestId, receive),
        );
        break;
      }

      case "apple:signin": {
        // Run the native Apple sheet (ASAuthorization) and settle the web's
        // signInWithApple() promise. Always inject a response — success or
        // failure — so the awaiting web promise can't hang. On genuine
        // failure the web helper falls back to the browser OAuth flow; a
        // user CANCEL carries code:"canceled" and must be a web-side no-op
        // (returning to the sign-in screen), never an OAuth fallback — that
        // fallback flow is the prior 2.1(a) rejection vector.
        try {
          const credential = await runNativeAppleSignIn();
          webViewRef.current?.injectJavaScript(
            buildAppleSignInResponse(message.requestId, {
              ok: true,
              credential,
            }),
          );
        } catch (error) {
          webViewRef.current?.injectJavaScript(
            buildAppleSignInResponse(message.requestId, {
              ok: false,
              error: error instanceof Error ? error.message : "Apple sign-in failed",
              code: getAppleSignInFailureCode(error),
            }),
          );
        }
        break;
      }

      case "openAppSettings":
      case "openNotificationSettings":
        // iOS opens the app's settings page (closest to notification settings).
        await Linking.openSettings();
        break;

      case "revenuecat:identify":
        await identifyUser(message.userId);
        break;

      case "revenuecat:purchase": {
        const result = await purchasePackage(message.packageId);
        webViewRef.current?.injectJavaScript(
          buildWebEvent("chravel:purchase-result", {
            success: result.success,
            error: result.error ?? null,
          }),
        );
        break;
      }

      case "revenuecat:restore": {
        const result = await restorePurchases();
        webViewRef.current?.injectJavaScript(
          buildWebEvent("chravel:restore-result", {
            success: result.success,
            error: result.error ?? null,
          }),
        );
        break;
      }

      case "revenuecat:getCustomerInfo": {
        const info = await getCustomerInfo();
        const activeEntitlements = info
          ? Object.keys(info.entitlements.active)
          : [];
        webViewRef.current?.injectJavaScript(
          buildWebEvent("chravel:customer-info", {
            entitlements: activeEntitlements,
          }),
        );
        break;
      }

      case "share": {
        try {
          await Share.share({
            message: message.text ?? "",
            url: message.url,
            title: message.title,
          });
        } catch {
          // User cancelled or share failed.
        }
        break;
      }

      // Voice bridge messages
      case "voice:request-permission":
      case "voice:start-capture":
      case "voice:stop-capture":
      case "voice:play-audio":
      case "voice:flush-playback": {
        const bridge = voiceBridgeRef.current;
        // Lazily attach the sendEvent function so the bridge can
        // inject JS events back into the WebView.
        bridge.attach((eventName, detail) => {
          webViewRef.current?.injectJavaScript(
            buildWebEvent(eventName, detail),
          );
        });
        await bridge.handle(message as VoiceBridgeMessage);
        break;
      }
    }
  }, [handleIncomingPath, clearLoadingFallbackTimer, scheduleLoadingFallback, openOAuthAuthSession, emitPushToken]);

  // ── URL filter ──────────────────────────────────────────────

  const shouldLoadRequest = useCallback(
    (request: { url: string; isTopFrame?: boolean }) => {
      const decision = evaluateWebViewRequestPolicy({
        url: request.url,
        isTopFrame: request.isTopFrame,
        platformOS: Platform.OS,
      });

      if (decision.externalUrlToOpen) {
        if (decision.openInAppBrowser) {
          if (decision.useAuthSession) {
            void openOAuthAuthSession(decision.externalUrlToOpen);
          } else {
            void WebBrowser.openBrowserAsync(decision.externalUrlToOpen, {
              // PAGE_SHEET (not POPOVER): a popover requires a non-nil source
              // anchor on iPad and crashes/no-ops without one (expo #33995),
              // while a page sheet presents safely on both iPhone and iPad.
              presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
            });
          }
        } else {
          Linking.openURL(decision.externalUrlToOpen);
        }
      }

      return decision.allowInWebView;
    },
    [openOAuthAuthSession],
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <WebView
        ref={webViewRef}
        source={{
          uri: buildNativeAuthLaunchUrl(),
          headers:
            Platform.OS === "ios"
              ? { "Cache-Control": "no-cache" }
              : undefined,
        }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={nativeBootstrapJS}
        injectedJavaScript={nativeDocumentEndJS}
        onMessage={handleMessage}
        userAgent={Platform.OS === "ios"
          ? IS_TABLET
            ? `Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1 ${NATIVE_USER_AGENT_SUFFIX}`
            : `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ${NATIVE_USER_AGENT_SUFFIX}`
          : undefined}
        applicationNameForUserAgent={Platform.OS === "android" ? NATIVE_USER_AGENT_SUFFIX : undefined}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        // Android-only prop: lets the web app's navigator.geolocation reach the
        // OS permission flow (ACCESS_FINE_LOCATION is declared). iOS ignores
        // this — WKWebView geolocation is governed by
        // NSLocationWhenInUseUsageDescription in app.config.js.
        geolocationEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={false}
        domStorageEnabled={true}
        cacheEnabled={true}
        cacheMode={Platform.OS === "android" ? "LOAD_DEFAULT" : undefined}
        javaScriptCanOpenWindowsAutomatically={false}
        onShouldStartLoadWithRequest={(request) => shouldLoadRequest(request)}
        onNavigationStateChange={(navState) => {
          const url = navState.url ?? "";
          currentUrlRef.current = url;
          const onAuth = isAuthScreenUrl(url);
          const inAuthReturnFlow = isAuthReturnFlowUrl(url);

          // Finish OAuth only after leaving every auth bootstrap / callback
          // surface. Do not apply a deferred notification/deep-link path while
          // still on /auth or /auth-callback — e.g. /auth → /auth-callback must
          // not yank the WebView off the PKCE exchange before session hydration.
          if (!inAuthReturnFlow && url.startsWith(WEB_APP_URL)) {
            if (isAuthRedirectRef.current) {
              isAuthRedirectRef.current = false;
              clearLoadingFallbackTimer();
              setIsLoading(false);
            }

            if (initialUrlRef.current) {
              const pending = initialUrlRef.current;
              initialUrlRef.current = null;
              handleIncomingPath(pending);
            }
          }

          wasOnAuthRef.current = onAuth;
        }}
        onLoadEnd={() => {
          if (!hasReportedInitialLoadEndRef.current) {
            hasReportedInitialLoadEndRef.current = true;
            onInitialLoadEnd?.();
          }
          // Don't hide the overlay here — wait for the "ready" bridge
          // message from the web app (sent after auth hydration).
          // Fallback: hide after 2 seconds if the signal never arrives.
          // Replace any prior fallback so stacked loads / OAuth cannot fire stale timers.
          scheduleLoadingFallback();
        }}
        onError={() => onError()}
        onHttpError={(syntheticEvent) => {
          const { statusCode, url } = syntheticEvent.nativeEvent;
          // Fatal only for the main document on chravel.app (any ≥400) — a
          // 403/404 on /auth strands the user on a browser error page with no
          // retry. Sub-resource and third-party errors stay non-fatal (Android
          // fires this event for every resource).
          if (
            isFatalHttpError({
              statusCode,
              url,
              currentUrl: currentUrlRef.current,
            })
          ) {
            onError();
          }
        }}
        onContentProcessDidTerminate={() => {
          // WKWebView killed the content process (memory pressure). Reset
          // launch-time refs so the post-reload `ready` message re-forwards
          // the push token and deferred routes are not dropped.
          isReadyRef.current = false;
          didProactiveRegisterRef.current = false;
          webViewRef.current?.reload();
        }}
        pullToRefreshEnabled={Platform.OS === "android"}
        allowsBackForwardNavigationGestures={true}
        bounces={true}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.foreground} />
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  splashLockup: {
    width: "70%",
    height: "70%",
  },
});
