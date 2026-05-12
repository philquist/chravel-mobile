import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WEB_APP_URL, NATIVE_USER_AGENT_SUFFIX, COLORS, IS_TABLET } from "./constants";
import { buildInjectedJS, buildWebEvent, parseBridgeMessage } from "./bridge";
import {
  registerForPushNotifications,
  getNotificationDeepLink,
} from "./notifications";
import { triggerHaptic } from "./haptics";
import {
  buildWebViewLaunchUrl,
  buildNativeAuthLaunchUrl,
  getInitialURL,
  onDeepLink,
  parseDeepLinkUrl,
  isAuthScreenUrl,
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
import { evaluateWebViewRequestPolicy } from "./webViewRequestFilter";
import { evaluateReadyDecision } from "./authRouting";
import { GradientText } from "./GradientText";

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
  const isReadyRef = useRef(false);
  const initialUrlRef = useRef<string | null>(null);
  const loadingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAuthBrand, setShowAuthBrand] = useState(true);
  const hasReportedInitialLoadEndRef = useRef(false);

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
      if (path.startsWith("/auth-callback")) {
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
      navigateWebView(path);
    },
    [navigateWebView, clearLoadingFallbackTimer],
  );

  useEffect(() => {
    getInitialURL().then((path) => {
      if (!path) return;
      if (isReadyRef.current) {
        handleIncomingPath(path);
      } else {
        initialUrlRef.current = path;
      }
    });

    const unsub = onDeepLink((path) => {
      if (isReadyRef.current) {
        handleIncomingPath(path);
      } else {
        initialUrlRef.current = path;
      }
    });
    return unsub;
  }, [handleIncomingPath]);

  // ── Push notification taps ──────────────────────────────────

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<
          string,
          unknown
        >;
        const path = getNotificationDeepLink(data);
        if (path) {
          if (isReadyRef.current) {
            handleIncomingPath(path);
          } else {
            initialUrlRef.current = path;
          }
        }
      },
    );

    return () => subscription.remove();
  }, [handleIncomingPath]);

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
        break;
      }

      case "haptic":
        await triggerHaptic(message.style);
        break;

      case "browser:open":
        if (message.url) {
          await WebBrowser.openBrowserAsync(message.url, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.POPOVER,
          });
        }
        break;

      case "oauth:open":
        if (message.url) {
          const nativeAuthUrl = rewriteOAuthUrlForNativeCallback(message.url);
          const result = await WebBrowser.openAuthSessionAsync(nativeAuthUrl, NATIVE_OAUTH_CALLBACK_URL);
          if (result.type === "success" && result.url) {
            const nextPath = parseDeepLinkUrl(result.url);
            if (nextPath?.startsWith("/auth-callback")) {
              handleIncomingPath(nextPath);
            }
          }
        }
        break;

      case "push:register": {
        const result = await registerForPushNotifications();
        webViewRef.current?.injectJavaScript(
          buildWebEvent("chravel:push-token", {
            token: result.token,
            error: result.error ?? null,
          }),
        );
        break;
      }

      case "push:unregister":
        webViewRef.current?.injectJavaScript(
          buildWebEvent("chravel:push-unregistered", { success: true }),
        );
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
  }, [handleIncomingPath, clearLoadingFallbackTimer, scheduleLoadingFallback]);

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
            const nativeAuthUrl = rewriteOAuthUrlForNativeCallback(decision.externalUrlToOpen);
            void WebBrowser.openAuthSessionAsync(
              nativeAuthUrl,
              NATIVE_OAUTH_CALLBACK_URL,
            ).then((result) => {
              if (result.type === "success" && result.url) {
                const nextPath = parseDeepLinkUrl(result.url);
                if (nextPath?.startsWith("/auth-callback")) {
                  handleIncomingPath(nextPath);
                }
              }
            });
          } else {
            void WebBrowser.openBrowserAsync(decision.externalUrlToOpen, {
              presentationStyle: WebBrowser.WebBrowserPresentationStyle.POPOVER,
            });
          }
        } else {
          Linking.openURL(decision.externalUrlToOpen);
        }
      }

      return decision.allowInWebView;
    },
    [handleIncomingPath],
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <WebView
        ref={webViewRef}
        source={{ uri: buildNativeAuthLaunchUrl() }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={buildInjectedJS(Platform.OS, insets.bottom, IS_TABLET)}
        onMessage={handleMessage}
        userAgent={Platform.OS === "ios"
          ? IS_TABLET
            ? `Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1 ${NATIVE_USER_AGENT_SUFFIX}`
            : `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ${NATIVE_USER_AGENT_SUFFIX}`
          : undefined}
        applicationNameForUserAgent={Platform.OS === "android" ? NATIVE_USER_AGENT_SUFFIX : undefined}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        geolocationEnabled={false}
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
          setShowAuthBrand(onAuth);

          if (wasOnAuthRef.current && !onAuth && url.startsWith(WEB_APP_URL)) {
            if (isAuthRedirectRef.current) {
              // OAuth just completed — dismiss overlay now that we've
              // left /auth and landed on the authenticated page.
              isAuthRedirectRef.current = false;
              clearLoadingFallbackTimer();
              setIsLoading(false);
            }
            // Apply any deep link deferred while OAuth was finishing on /auth.
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
          const { statusCode } = syntheticEvent.nativeEvent;
          if (statusCode >= 500) onError();
        }}
        onContentProcessDidTerminate={() => {
          webViewRef.current?.reload();
        }}
        pullToRefreshEnabled={Platform.OS === "android"}
        allowsBackForwardNavigationGestures={true}
        bounces={true}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <GradientText style={styles.splashTitle}>ChravelApp</GradientText>
          <Image
            source={require("../assets/splash-icon.png")}
            style={styles.splashGlobe}
            resizeMode="contain"
          />
          <Text style={styles.splashTagline}>
            <Text style={styles.splashTaglineWhite}>Less </Text>
            <Text style={styles.splashTaglineGold}>Chaos </Text>
            <Text style={styles.splashTaglineWhite}>More </Text>
            <Text style={styles.splashTaglineGold}>Coordination</Text>
          </Text>
          <ActivityIndicator
            size="small"
            color="#c49746"
            style={styles.loadingSpinner}
          />
        </View>
      )}

      {showAuthBrand && (
        <View
          pointerEvents="none"
          style={[styles.authBrandContainer, { top: insets.top + 56 }]}
        >
          <GradientText style={styles.authBrandText}>ChravelApp</GradientText>
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
    backgroundColor: "#0b0b0f",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 28,
  },
  splashGlobe: {
    width: 160,
    height: 160,
    marginBottom: 28,
  },
  splashTagline: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  splashTaglineWhite: {
    color: "#FFFFFF",
  },
  splashTaglineGold: {
    color: "#c49746",
  },
  loadingSpinner: {
    marginTop: 24,
  },
  authBrandContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  authBrandText: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
