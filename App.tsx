import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import { ErrorScreen } from "./src/ErrorScreen";
import { ChravelWebView } from "./src/ChravelWebView";
import { PushPrePrompt } from "./src/PushPrePrompt";
import { TermsAgreement } from "./src/TermsAgreement";
import {
  createInitialLoadWatchdog,
  type InitialLoadWatchdog,
} from "./src/loadWatchdog";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [showTerms, setShowTerms] = useState(true);
  const [showPushPrompt, setShowPushPrompt] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Ref (not state): splash hiding never drives rendering, and both the
  // load-end handler and the watchdog may race to hide it.
  const hasHiddenSplashRef = useRef(false);
  const hideSplash = useCallback(() => {
    if (hasHiddenSplashRef.current) return;
    hasHiddenSplashRef.current = true;
    void SplashScreen.hideAsync();
  }, []);

  // Watchdog: if the initial load neither ends nor errors within the deadline
  // (stalled connection), drop the splash and show the retryable ErrorScreen
  // instead of hanging forever. Lives here (not in ChravelWebView) because the
  // WebView unmounts on error/retry while the timer must span retries.
  const watchdogRef = useRef<InitialLoadWatchdog | null>(null);
  if (watchdogRef.current === null) {
    watchdogRef.current = createInitialLoadWatchdog(() => {
      hideSplash();
      setHasError(true);
    });
  }
  useEffect(() => {
    watchdogRef.current?.arm();
    return () => watchdogRef.current?.dispose();
  }, []);

  const handleInitialWebLoadEnd = useCallback(() => {
    watchdogRef.current?.settle();
    hideSplash();
  }, [hideSplash]);

  // Hide the splash on error too: if onError fires before the first
  // onLoadEnd, the WebView unmounts and onInitialLoadEnd never arrives — the
  // ErrorScreen must not render underneath a splash that never hides.
  const handleWebViewError = useCallback(() => {
    watchdogRef.current?.settle();
    hideSplash();
    setHasError(true);
  }, [hideSplash]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    // Remounting ChravelWebView restarts the load; re-arm so a retry that
    // hangs times out back to the ErrorScreen instead of spinning forever.
    watchdogRef.current?.arm();
  }, []);

  // Mount the WebView immediately on cold start so chravel.app/auth begins
  // loading in the background while the user works through Terms/Push prompts.
  // Both overlays use opaque SafeAreaView containers, so they fully occlude
  // the WebView underneath until dismissed.
  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {hasError ? (
          <ErrorScreen onRetry={handleRetry} />
        ) : (
          <ChravelWebView
            onError={handleWebViewError}
            onInitialLoadEnd={handleInitialWebLoadEnd}
          />
        )}
        {!hasError && showTerms && (
          <View style={styles.overlay}>
            <TermsAgreement onComplete={() => setShowTerms(false)} />
          </View>
        )}
        {!hasError && !showTerms && showPushPrompt && (
          <View style={styles.overlay}>
            <PushPrePrompt onComplete={() => setShowPushPrompt(false)} />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
