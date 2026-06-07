/**
 * WebView ↔ Native bridge protocol.
 *
 * The WebView sends JSON messages via window.ReactNativeWebView.postMessage().
 * The native shell handles them in onMessage and can reply by injecting JS.
 *
 * To add a new action:
 * 1. Add a type to BridgeMessage
 * 2. Handle it in the switch inside App.tsx onMessage
 * 3. (Optional) add a response event the web app listens for
 */

// ── Web → Native messages ──────────────────────────────────────────

export type BridgeMessage =
  | { type: "haptic"; style: HapticStyle }
  | { type: "browser:open"; url: string; presentationStyle?: "fullscreen" | "pageSheet" | "formSheet" | "popover" }
  | { type: "oauth:open"; url: string }
  | { type: "push:register" }
  | { type: "push:unregister" }
  | { type: "push:checkPermissions"; requestId: string }
  | { type: "push:requestPermissions"; requestId: string }
  | { type: "openAppSettings" }
  | { type: "openNotificationSettings" }
  | { type: "revenuecat:purchase"; packageId: string }
  | { type: "revenuecat:restore" }
  | { type: "revenuecat:getCustomerInfo" }
  | { type: "share"; text?: string; url?: string; title?: string }
  | { type: "revenuecat:identify"; userId: string }
  | { type: "ready" } // web app signals it has loaded
  // Voice bridge messages (native audio I/O for Gemini Live)
  | { type: "voice:request-permission" }
  | { type: "voice:start-capture" }
  | { type: "voice:stop-capture" }
  | { type: "voice:play-audio"; audio: string; sampleRate?: number }
  | { type: "voice:flush-playback" };

export type HapticStyle =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error";

// ── Native → Web events (injected via webViewRef.injectJavaScript) ─

/**
 * Helper to build a JS string that dispatches a CustomEvent on the
 * web app's window. The web app listens with:
 *   window.addEventListener('chravel:push-token', (e) => e.detail.token)
 */
export function buildWebEvent(name: string, detail: Record<string, unknown>): string {
  const payload = JSON.stringify(detail);
  // The trailing `true;` prevents the WebView from navigating.
  return `window.dispatchEvent(new CustomEvent('${name}', { detail: ${payload} })); true;`;
}

/**
 * Build a JS string that resolves a pending PushNotifications permission
 * promise in the injected Capacitor shim. The shim posts a `requestId` with
 * `push:checkPermissions` / `push:requestPermissions`; native replies by
 * injecting this so `checkPermissions()` / `requestPermissions()` resolve with
 * a Capacitor-style `{ receive }` value.
 */
export function buildPushPermissionResponse(
  requestId: string,
  receive: string,
): string {
  return `window.__chravelPushResolvePermission && window.__chravelPushResolvePermission(${JSON.stringify(
    requestId,
  )}, ${JSON.stringify(receive)}); true;`;
}

/**
 * Clear cached Capacitor push registration replay state in the injected shim.
 * Must run on push:unregister so a subsequent addListener() cannot replay a
 * prior user's device token after account switch within the same WebView session.
 */
export function buildClearPushRegistrationCache(): string {
  return `if (window.__chravelPush) {
    window.__chravelPush.lastRegistration = null;
    window.__chravelPush.lastRegistrationError = null;
  } true;`;
}

/**
 * Minimal document-start JS that exposes native detection and bridge APIs before
 * the web bundle bootstraps. Keep this DOM-free: WKWebView runs it at document
 * start, before document.head/body are guaranteed to exist.
 */
export function buildNativeBootstrapJS(
  platform: string,
  isTablet: boolean = false,
  nativeVersion: string = "1.0.0",
): string {
  return `
    (function installChravelNativeBridge() {
      if (window.ChravelNative && window.ChravelNative.isNative) {
        return;
      }
      var nativeVersion = ${JSON.stringify(nativeVersion)};
      window.Capacitor = window.Capacitor || {};
      window.Capacitor.isNativePlatform = function() { return true; };
      window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.Browser = {
        open: function(options) {
          var payload = {
            type: 'browser:open',
            url: options && options.url ? String(options.url) : '',
            presentationStyle: options && options.presentationStyle ? String(options.presentationStyle) : undefined
          };
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          return Promise.resolve();
        },
        close: function() {
          return Promise.resolve();
        }
      };

      // ── Capacitor PushNotifications shim ────────────────────────
      // chravel-web (PR #683) reads window.Capacitor.Plugins.PushNotifications
      // and does NOT bundle @capacitor/push-notifications — the native shell
      // injects it here. register() reuses the existing push:register handler,
      // and the native 'chravel:push-token' event is translated below into the
      // Capacitor 'registration' / 'registrationError' events the web expects.
      var __chravelPush = window.__chravelPush || {
        listeners: {},
        permResolvers: {},
        lastRegistration: null,
        lastRegistrationError: null
      };
      window.__chravelPush = __chravelPush;

      function __chravelPushDispatch(event, payload) {
        var arr = __chravelPush.listeners[event];
        if (!arr) return;
        arr.slice().forEach(function(cb) {
          try { cb(payload); } catch (e) {}
        });
      }

      // Called from native (injected JS) to resolve a permission round-trip.
      window.__chravelPushResolvePermission = function(requestId, receive) {
        var resolve = __chravelPush.permResolvers[requestId];
        if (resolve) {
          delete __chravelPush.permResolvers[requestId];
          resolve({ receive: receive });
        }
      };

      function __chravelRequestPermission(type) {
        return new Promise(function(resolve) {
          var requestId = 'cp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
          __chravelPush.permResolvers[requestId] = resolve;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: type,
            requestId: requestId
          }));
        });
      }

      window.Capacitor.Plugins.PushNotifications = {
        checkPermissions: function() {
          return __chravelRequestPermission('push:checkPermissions');
        },
        requestPermissions: function() {
          return __chravelRequestPermission('push:requestPermissions');
        },
        register: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'push:register'
          }));
          return Promise.resolve();
        },
        addListener: function(eventName, listener) {
          if (!__chravelPush.listeners[eventName]) {
            __chravelPush.listeners[eventName] = [];
          }
          __chravelPush.listeners[eventName].push(listener);
          // Replay the last result so a listener added after a proactive /
          // on-launch registration (or app restart) still receives the token.
          if (eventName === 'registration' && __chravelPush.lastRegistration) {
            try { listener(__chravelPush.lastRegistration); } catch (e) {}
          } else if (eventName === 'registrationError' && __chravelPush.lastRegistrationError) {
            try { listener(__chravelPush.lastRegistrationError); } catch (e) {}
          }
          return Promise.resolve({
            remove: function() {
              var arr = __chravelPush.listeners[eventName];
              if (arr) {
                var i = arr.indexOf(listener);
                if (i !== -1) arr.splice(i, 1);
              }
              return Promise.resolve();
            }
          });
        },
        removeAllListeners: function() {
          __chravelPush.listeners = {};
          return Promise.resolve();
        }
      };

      // Translate the native push-token event into Capacitor push events.
      window.addEventListener('chravel:push-token', function(e) {
        var detail = (e && e.detail) ? e.detail : {};
        if (detail.token) {
          var payload = { value: String(detail.token) };
          __chravelPush.lastRegistration = payload;
          __chravelPush.lastRegistrationError = null;
          __chravelPushDispatch('registration', payload);
        } else {
          var err = { error: detail.error ? String(detail.error) : 'Push registration failed' };
          __chravelPush.lastRegistration = null;
          __chravelPush.lastRegistrationError = err;
          __chravelPushDispatch('registrationError', err);
        }
      });

      window.ChravelNative = {
        platform: "${platform}",
        isNative: true,
        version: nativeVersion,
        userAgent: 'ChravelNative/' + nativeVersion,
        isTablet: ${isTablet},
        openOAuthUrl: function(url) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "oauth:open",
            url: url ? String(url) : ""
          }));
        },
        openAppSettings: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "openAppSettings"
          }));
        },
        openNotificationSettings: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "openNotificationSettings"
          }));
        }
      };

      // ── Native Audio API for Gemini Live voice ──────────────────
      window.ChravelNativeAudio = {
        isAvailable: true,
        requestPermission: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'voice:request-permission'
          }));
        },
        startCapture: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'voice:start-capture'
          }));
        },
        stopCapture: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'voice:stop-capture'
          }));
        },
        playAudio: function(base64Pcm16, sampleRate) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'voice:play-audio',
            audio: base64Pcm16,
            sampleRate: sampleRate || 24000
          }));
        },
        flushPlayback: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'voice:flush-playback'
          }));
        }
      };

      window.dispatchEvent(new Event('chravel:native-ready'));
    })();
    true;
  `;
}

/**
 * Post-load JS for native-only DOM/network UX patches. This intentionally runs
 * after the page exists so it cannot block document-start native detection.
 */
export function buildNativeEnhancementsJS(
  platform: string,
  bottomInset: number = 0,
  isTablet: boolean = false,
): string {
  return `
    if (!window.__chravelNativeEnhancementsInstalled) {
      window.__chravelNativeEnhancementsInstalled = true;

      // Add bottom safe area spacing for iOS home indicator.
      (function() {
        var style = document.createElement('style');
        var bottomPadding = Math.max(${bottomInset}, 0);
        // Fallback for older devices/simulators where inset might be 0 but we want some padding
        if (bottomPadding === 0 && "${platform}" === "ios") bottomPadding = ${isTablet} ? 20 : 34;
        style.textContent = [
          '#root { padding-bottom: ' + bottomPadding + 'px !important; }',
          'html { padding-bottom: ' + bottomPadding + 'px !important; }',
        ].join('\\n');
        var styleParent = document.head || document.documentElement || document.body;
        if (styleParent) styleParent.appendChild(style);
      })();

      // Improve mobile tab UX (overflow clipping) and nudge data refresh
      // after pin/unpin actions so the Pinned view hydrates reliably.
      (function() {
      var TAB_KEYWORDS = ['messages', 'broadcast', 'pinned', 'search', 'channel', 'chat', 'concierge', 'media', 'calendar'];

      function textIncludesAny(value, keywords) {
        var text = String(value || '').toLowerCase();
        for (var i = 0; i < keywords.length; i++) {
          if (text.indexOf(keywords[i]) !== -1) return true;
        }
        return false;
      }

      function looksLikeChatTabRow(el) {
        if (!el || !el.children || el.children.length < 3) return false;
        var text = String(el.textContent || '').toLowerCase();
        return textIncludesAny(text, TAB_KEYWORDS);
      }

      function patchScrollableRow(el) {
        if (!el || el.getAttribute('data-chravel-scroll-patched') === '1') return;

        el.style.overflowX = 'auto';
        el.style.overflowY = 'hidden';
        el.style.webkitOverflowScrolling = 'touch';
        el.style.scrollbarWidth = 'none';
        el.style.msOverflowStyle = 'none';
        el.style.touchAction = 'pan-x';
        el.style.flexWrap = 'nowrap';
        if (!el.style.paddingBottom) el.style.paddingBottom = '2px';

        for (var c = 0; c < el.children.length; c++) {
          var child = el.children[c];
          if (!child || !child.style) continue;
          child.style.flexShrink = '0';
        }

        el.setAttribute('data-chravel-scroll-patched', '1');
      }

      function isChatSurfaceRoute() {
        try {
          var path = String(window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
          return path.indexOf('/messages') !== -1 || path.indexOf('/chat') !== -1 || path.indexOf('/concierge') !== -1 || path.indexOf('/broadcast') !== -1;
        } catch (_error) {
          return false;
        }
      }

      function makeTabRowsScrollable() {
        if (!isChatSurfaceRoute()) return;
        try {
          var nodes = document.querySelectorAll('[role="tablist"], [data-testid*="tab"], [class*="tab"], [class*="segment"]');
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (!el || !el.children || el.children.length < 3) continue;
            var isOverflowing = el.scrollWidth > el.clientWidth + 4;
            if (!isOverflowing && !looksLikeChatTabRow(el)) continue;
            patchScrollableRow(el);
          }
        } catch (error) {
          console.log('ChravelNative tab overflow patch error', error);
        }
      }

      function nudgePinnedHydration(source) {
        try {
          window.dispatchEvent(new Event('focus'));
          window.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('pageshow'));
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new CustomEvent('chravel:pinned-updated', { detail: { source: source || 'native-bridge' } }));
        } catch (error) {
          console.log('ChravelNative pinned hydration nudge error', error);
        }
      }

      function schedulePinnedHydration(source) {
        nudgePinnedHydration(source);
        setTimeout(function() { nudgePinnedHydration(source); }, 60);
        setTimeout(function() { nudgePinnedHydration(source); }, 220);
      }

      function maybePinnedMutation(url, body) {
        var lowerUrl = String(url || '').toLowerCase();
        if (lowerUrl.indexOf('pin') !== -1) return true;
        if (!body || typeof body !== 'string') return false;
        var lowerBody = body.toLowerCase();
        return lowerBody.indexOf('pin') !== -1;
      }

      function wireNetworkPinnedSignals() {
        try {
          var nativeFetch = window.fetch;
          if (typeof nativeFetch === 'function' && !nativeFetch.__chravelPinnedPatched) {
            var wrappedFetch = function() {
              var url = arguments[0];
              var options = arguments[1] || {};
              var body = options && options.body ? options.body : '';
              return nativeFetch.apply(this, arguments).then(function(response) {
                if (response && response.ok && maybePinnedMutation(url, body)) {
                  schedulePinnedHydration('fetch');
                }
                return response;
              });
            };
            wrappedFetch.__chravelPinnedPatched = true;
            window.fetch = wrappedFetch;
          }

          var xhrOpen = XMLHttpRequest.prototype.open;
          var xhrSend = XMLHttpRequest.prototype.send;
          if (!xhrOpen.__chravelPinnedPatched) {
            XMLHttpRequest.prototype.open = function(method, url) {
              this.__chravelUrl = url;
              return xhrOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.open.__chravelPinnedPatched = true;
          }
          if (!xhrSend.__chravelPinnedPatched) {
            XMLHttpRequest.prototype.send = function(body) {
              this.__chravelBody = body;
              this.addEventListener('load', function() {
                if (this.status >= 200 && this.status < 300 && maybePinnedMutation(this.__chravelUrl, this.__chravelBody)) {
                  schedulePinnedHydration('xhr');
                }
              });
              return xhrSend.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send.__chravelPinnedPatched = true;
          }
        } catch (error) {
          console.log('ChravelNative pinned network patch error', error);
        }
      }

      function wirePinnedTabSignals() {
        document.addEventListener('click', function(event) {
          var target = event && event.target;
          if (!target) return;
          var text = '';
          var node = target;
          for (var i = 0; i < 4 && node; i++) {
            text += ' ' + String(node.textContent || '');
            node = node.parentElement;
          }
          var lower = text.toLowerCase();
          if (lower.indexOf('pinned') !== -1 || lower.indexOf('pin message') !== -1 || lower.indexOf('unpin') !== -1) {
            schedulePinnedHydration('click');
          }
        }, true);
      }

      function onRouteChange() {
        makeTabRowsScrollable();
        var href = String(window.location && window.location.href ? window.location.href : '').toLowerCase();
        if (href.indexOf('pinned') !== -1) {
          schedulePinnedHydration('route');
        }
      }

      var observer = new MutationObserver(function(mutations) {
        makeTabRowsScrollable();
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            var text = ((node.textContent || '') + ' ' + (((node).innerText) || '')).toLowerCase();
            if (text.indexOf('pinned successfully') !== -1 || text.indexOf('unpinned successfully') !== -1) {
              schedulePinnedHydration('toast');
            }
          }
        }
      });

      var pushState = history.pushState;
      history.pushState = function() {
        var result = pushState.apply(this, arguments);
        onRouteChange();
        return result;
      };

      var replaceState = history.replaceState;
      history.replaceState = function() {
        var result = replaceState.apply(this, arguments);
        onRouteChange();
        return result;
      };

      wireNetworkPinnedSignals();
      wirePinnedTabSignals();
      window.addEventListener('popstate', onRouteChange, true);
      window.addEventListener('resize', makeTabRowsScrollable, true);
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
      setTimeout(onRouteChange, 50);
      setTimeout(onRouteChange, 500);
      setTimeout(onRouteChange, 1200);
      })();
    }


    true;
  `;
}

/**
 * Document-end injection: bootstrap fallback (if document-start was missed)
 * plus post-load DOM/network enhancements.
 */
export function buildNativeDocumentEndJS(
  platform: string,
  bottomInset: number = 0,
  isTablet: boolean = false,
  nativeVersion: string = "1.0.0",
): string {
  return `${buildNativeBootstrapJS(platform, isTablet, nativeVersion)}
${buildNativeEnhancementsJS(platform, bottomInset, isTablet)}`;
}

/**
 * Backwards-compatible combined injection builder for tests/direct callers.
 * WebView usage should prefer buildNativeBootstrapJS at document-start and
 * buildNativeDocumentEndJS at document-end.
 */
export function buildInjectedJS(
  platform: string,
  bottomInset: number = 0,
  isTablet: boolean = false,
  nativeVersion: string = "1.0.0",
): string {
  return `${buildNativeBootstrapJS(platform, isTablet, nativeVersion)}
${buildNativeEnhancementsJS(platform, bottomInset, isTablet)}`;
}

/**
 * Parse a raw postMessage string into a typed BridgeMessage.
 * Returns null for malformed payloads.
 */
export function parseBridgeMessage(raw: string): BridgeMessage | null {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return null;
    }

    switch (data.type) {
      case "haptic":
        if (
          typeof data.style === "string" &&
          ["light", "medium", "heavy", "success", "warning", "error"].includes(
            data.style,
          )
        ) {
          return data as BridgeMessage;
        }
        return null;

      case "browser:open":
      case "oauth:open":
        if (typeof data.url === "string") {
          return data as BridgeMessage;
        }
        return null;

      case "push:register":
      case "push:unregister":
      case "openAppSettings":
      case "openNotificationSettings":
      case "revenuecat:restore":
      case "revenuecat:getCustomerInfo":
      case "ready":
      case "voice:request-permission":
      case "voice:start-capture":
      case "voice:stop-capture":
      case "voice:flush-playback":
        return data as BridgeMessage;

      case "push:checkPermissions":
      case "push:requestPermissions":
        if (typeof data.requestId === "string") {
          return data as BridgeMessage;
        }
        return null;

      case "revenuecat:purchase":
        if (typeof data.packageId === "string") {
          return data as BridgeMessage;
        }
        return null;

      case "revenuecat:identify":
        if (typeof data.userId === "string") {
          return data as BridgeMessage;
        }
        return null;

      case "share":
        if (
          (data.text === undefined || typeof data.text === "string") &&
          (data.url === undefined || typeof data.url === "string") &&
          (data.title === undefined || typeof data.title === "string")
        ) {
          return data as BridgeMessage;
        }
        return null;

      case "voice:play-audio":
        if (
          typeof data.audio === "string" &&
          (data.sampleRate === undefined || typeof data.sampleRate === "number")
        ) {
          return data as BridgeMessage;
        }
        return null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}
