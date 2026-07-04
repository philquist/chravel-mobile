/**
 * Watchdog for the initial WebView load.
 *
 * The native splash stays up until the first `onLoadEnd` — but a load that
 * connects and then stalls fires neither `onLoadEnd` nor `onError`, which
 * would leave the splash up forever (App Store Guideline 2.1: an app that
 * hangs on launch is rejected). This timer guarantees a terminal state: if
 * nothing settles it within the deadline, the caller hides the splash and
 * shows the retryable ErrorScreen.
 *
 * Lives outside React (plain timer object, no hooks) so App.tsx orchestration
 * is unit-testable with fake timers.
 */

export const INITIAL_LOAD_WATCHDOG_MS = 15_000;

export interface InitialLoadWatchdog {
  /** (Re)start the timer — replaces any pending timer, so at most one fires. */
  arm(): void;
  /** A load-end or error arrived — cancel the pending timer. */
  settle(): void;
  /** Unmount cleanup — cancel and prevent any future arm/fire. */
  dispose(): void;
}

export function createInitialLoadWatchdog(
  onTimeout: () => void,
  timeoutMs: number = INITIAL_LOAD_WATCHDOG_MS,
): InitialLoadWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    arm() {
      if (disposed) return;
      clear();
      timer = setTimeout(() => {
        timer = null;
        onTimeout();
      }, timeoutMs);
    },
    settle() {
      clear();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
