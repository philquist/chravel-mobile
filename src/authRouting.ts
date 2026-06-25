import { isAuthReturnFlowUrl } from "./authUrl";

export interface ReadyDecisionInput {
  isAuthRedirect: boolean;
  currentUrl: string;
  pendingPath: string | null;
}

export interface ReadyDecision {
  keepLoadingOverlay: boolean;
  applyPathNow: string | null;
  deferPendingPath: boolean;
}

/**
 * Encodes the ready-state routing behavior for OAuth callbacks and deferred routes.
 */
export function evaluateReadyDecision({
  isAuthRedirect,
  currentUrl,
  pendingPath,
}: ReadyDecisionInput): ReadyDecision {
  const inAuthReturnFlow = isAuthReturnFlowUrl(currentUrl);

  if (pendingPath) {
    const shouldDeferPendingPath =
      isAuthRedirect &&
      inAuthReturnFlow &&
      !pendingPath.startsWith("/auth-callback");

    if (shouldDeferPendingPath) {
      return {
        keepLoadingOverlay: true,
        applyPathNow: null,
        deferPendingPath: true,
      };
    }

    return {
      keepLoadingOverlay: isAuthRedirect && inAuthReturnFlow,
      applyPathNow: pendingPath,
      deferPendingPath: false,
    };
  }

  return {
    keepLoadingOverlay: isAuthRedirect && inAuthReturnFlow,
    applyPathNow: null,
    deferPendingPath: false,
  };
}

export type AuthSurface = "auth-modal" | "marketing";

/**
 * Shared context mapping used by web/native entry points.
 */
export function resolveAuthSurface(appContext: string | null): AuthSurface {
  const normalized = appContext?.toLowerCase();
  if (normalized === "native" || normalized === "app" || normalized === "pwa") {
    return "auth-modal";
  }
  return "marketing";
}
