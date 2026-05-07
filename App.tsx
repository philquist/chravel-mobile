import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import { ErrorScreen } from "./src/ErrorScreen";
import { ChravelWebView } from "./src/ChravelWebView";
import { PushPrePrompt } from "./src/PushPrePrompt";
import { TermsAgreement } from "./src/TermsAgreement";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [showTerms, setShowTerms] = useState(true);
  const [showPushPrompt, setShowPushPrompt] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Mount the WebView immediately on cold start so chravel.app/auth begins
  // loading in the background while the user works through Terms/Push prompts.
  // Both overlays use opaque SafeAreaView containers, so they fully occlude
  // the WebView underneath until dismissed.
  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {hasError ? (
          <ErrorScreen onRetry={() => setHasError(false)} />
        ) : (
          <ChravelWebView onError={() => setHasError(true)} />
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
