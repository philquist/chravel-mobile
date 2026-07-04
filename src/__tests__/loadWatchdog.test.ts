import {
  createInitialLoadWatchdog,
  INITIAL_LOAD_WATCHDOG_MS,
} from "../loadWatchdog";

describe("createInitialLoadWatchdog", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires onTimeout once after the default deadline when armed", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout);

    watchdog.arm();
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);

    // No second fire later.
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS * 2);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not fire before the deadline", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout);

    watchdog.arm();
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS - 1);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("does not fire when settled before the deadline", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout);

    watchdog.arm();
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS - 1);
    watchdog.settle();
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS * 2);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("re-arms after settle (retry scenario) and fires on the new deadline", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout);

    watchdog.arm();
    watchdog.settle();
    watchdog.arm();
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("replaces the pending timer on repeated arm — one fire, timed from the last arm", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout);

    watchdog.arm();
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS - 1);
    watchdog.arm(); // re-arm just before the first would fire

    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels the pending timer and blocks future arms", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout);

    watchdog.arm();
    watchdog.dispose();
    watchdog.arm(); // no-op after dispose
    jest.advanceTimersByTime(INITIAL_LOAD_WATCHDOG_MS * 2);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("respects a custom timeout", () => {
    const onTimeout = jest.fn();
    const watchdog = createInitialLoadWatchdog(onTimeout, 500);

    watchdog.arm();
    jest.advanceTimersByTime(499);
    expect(onTimeout).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("exposes a 15-second default", () => {
    expect(INITIAL_LOAD_WATCHDOG_MS).toBe(15_000);
  });
});
