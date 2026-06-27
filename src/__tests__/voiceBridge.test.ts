// VoiceBridge orchestrates the capture + playback managers and translates
// voice:* bridge messages into chravel:voice-* WebView events. We mock both
// audio managers so we can assert the wiring without real native audio.

const mockCapture = {
  requestPermission: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};

jest.mock("../audio/capture", () => ({
  createCaptureManager: () => mockCapture,
}));

// Capture the constructed playback instance so tests can fire its callbacks.
let lastPlayback: {
  onRms?: (rms: number) => void;
  onQueueDrained?: () => void;
  enqueue: jest.Mock;
  flush: jest.Mock;
  dispose: jest.Mock;
};

jest.mock("../audio/playback", () => ({
  AudioPlaybackManager: jest.fn().mockImplementation(function (
    this: typeof lastPlayback,
  ) {
    this.onRms = undefined;
    this.onQueueDrained = undefined;
    this.enqueue = jest.fn().mockResolvedValue(undefined);
    this.flush = jest.fn().mockResolvedValue(undefined);
    this.dispose = jest.fn().mockResolvedValue(undefined);
    lastPlayback = this;
  }),
}));

jest.mock("../audio/constants", () => ({
  OUTPUT_SAMPLE_RATE: 24000,
}));

import { VoiceBridge } from "../voiceBridge";

function makeBridge() {
  const sendEvent = jest.fn();
  const bridge = new VoiceBridge();
  bridge.attach(sendEvent);
  return { bridge, sendEvent };
}

describe("VoiceBridge", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCapture.requestPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    mockCapture.start.mockResolvedValue(undefined);
    mockCapture.stop.mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("attach", () => {
    it("is idempotent — a second attach does not replace the first sendEvent", () => {
      const first = jest.fn();
      const second = jest.fn();
      const bridge = new VoiceBridge();
      bridge.attach(first);
      bridge.attach(second);

      lastPlayback.onRms?.(0.5);
      expect(first).toHaveBeenCalledWith("chravel:voice-playback-rms", { rms: 0.5 });
      expect(second).not.toHaveBeenCalled();
    });

    it("wires playback onRms → chravel:voice-playback-rms", () => {
      const { sendEvent } = makeBridge();
      lastPlayback.onRms?.(0.8);
      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-playback-rms", { rms: 0.8 });
    });

    it("wires playback onQueueDrained → chravel:voice-playback-complete", () => {
      const { sendEvent } = makeBridge();
      lastPlayback.onQueueDrained?.();
      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-playback-complete", {});
    });
  });

  describe("voice:request-permission", () => {
    it("emits chravel:voice-permission with the granted result", async () => {
      const { bridge, sendEvent } = makeBridge();
      mockCapture.requestPermission.mockResolvedValue({ granted: true, canAskAgain: false });

      await bridge.handle({ type: "voice:request-permission" });

      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-permission", {
        granted: true,
        canAskAgain: false,
      });
    });

    it("emits a PERMISSION_ERROR voice-error when the request throws", async () => {
      const { bridge, sendEvent } = makeBridge();
      mockCapture.requestPermission.mockRejectedValue(new Error("denied at OS level"));

      await bridge.handle({ type: "voice:request-permission" });

      expect(sendEvent).toHaveBeenCalledWith(
        "chravel:voice-error",
        expect.objectContaining({ code: "PERMISSION_ERROR" }),
      );
    });
  });

  describe("voice:start-capture", () => {
    it("starts capture, announces it, and forwards audio chunks", async () => {
      const { bridge, sendEvent } = makeBridge();
      mockCapture.start.mockImplementation(async (cb: (c: unknown) => void) => {
        cb({ audio: "base64chunk", rms: 0.4, timestamp: 1717000000 });
      });

      await bridge.handle({ type: "voice:start-capture" });

      expect(mockCapture.start).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-audio-data", {
        audio: "base64chunk",
        rms: 0.4,
        timestamp: 1717000000,
      });
      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-capture-started", {});
    });

    it("emits a CAPTURE_ERROR voice-error when start throws", async () => {
      const { bridge, sendEvent } = makeBridge();
      mockCapture.start.mockRejectedValue(new Error("mic busy"));

      await bridge.handle({ type: "voice:start-capture" });

      expect(sendEvent).toHaveBeenCalledWith(
        "chravel:voice-error",
        expect.objectContaining({ code: "CAPTURE_ERROR" }),
      );
      expect(sendEvent).not.toHaveBeenCalledWith("chravel:voice-capture-started", {});
    });
  });

  describe("voice:stop-capture", () => {
    it("stops capture and announces it", async () => {
      const { bridge, sendEvent } = makeBridge();
      await bridge.handle({ type: "voice:stop-capture" });

      expect(mockCapture.stop).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-capture-stopped", {});
    });

    it("emits a CAPTURE_ERROR voice-error when stop throws", async () => {
      const { bridge, sendEvent } = makeBridge();
      mockCapture.stop.mockRejectedValue(new Error("teardown failed"));

      await bridge.handle({ type: "voice:stop-capture" });

      expect(sendEvent).toHaveBeenCalledWith(
        "chravel:voice-error",
        expect.objectContaining({ code: "CAPTURE_ERROR" }),
      );
    });
  });

  describe("voice:play-audio", () => {
    it("enqueues with the provided sample rate", async () => {
      const { bridge } = makeBridge();
      await bridge.handle({ type: "voice:play-audio", audio: "pcm", sampleRate: 16000 });
      expect(lastPlayback.enqueue).toHaveBeenCalledWith("pcm", 16000);
    });

    it("defaults to OUTPUT_SAMPLE_RATE when sampleRate is omitted", async () => {
      const { bridge } = makeBridge();
      await bridge.handle({ type: "voice:play-audio", audio: "pcm" });
      expect(lastPlayback.enqueue).toHaveBeenCalledWith("pcm", 24000);
    });

    it("emits a PLAYBACK_ERROR voice-error when enqueue throws", async () => {
      const { bridge, sendEvent } = makeBridge();
      lastPlayback.enqueue.mockRejectedValue(new Error("decode failed"));

      await bridge.handle({ type: "voice:play-audio", audio: "bad" });

      expect(sendEvent).toHaveBeenCalledWith(
        "chravel:voice-error",
        expect.objectContaining({ code: "PLAYBACK_ERROR" }),
      );
    });
  });

  describe("voice:flush-playback", () => {
    it("flushes and announces the barge-in", async () => {
      const { bridge, sendEvent } = makeBridge();
      await bridge.handle({ type: "voice:flush-playback" });

      expect(lastPlayback.flush).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith("chravel:voice-playback-flushed", {});
    });

    it("emits a PLAYBACK_ERROR voice-error when flush throws", async () => {
      const { bridge, sendEvent } = makeBridge();
      lastPlayback.flush.mockRejectedValue(new Error("flush failed"));

      await bridge.handle({ type: "voice:flush-playback" });

      expect(sendEvent).toHaveBeenCalledWith(
        "chravel:voice-error",
        expect.objectContaining({ code: "PLAYBACK_ERROR" }),
      );
    });
  });

  describe("dispose", () => {
    it("stops capture, disposes playback, and detaches", async () => {
      const { bridge, sendEvent } = makeBridge();
      await bridge.dispose();

      expect(mockCapture.stop).toHaveBeenCalledTimes(1);
      expect(lastPlayback.dispose).toHaveBeenCalledTimes(1);

      // After dispose the sendEvent is cleared, so late playback callbacks no-op.
      sendEvent.mockClear();
      lastPlayback.onRms?.(0.9);
      expect(sendEvent).not.toHaveBeenCalled();
    });
  });
});
