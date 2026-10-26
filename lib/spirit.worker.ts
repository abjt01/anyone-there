/// <reference lib="webworker" />
// Whisper lives here, off the main thread, so the candle keeps flickering
// while it decodes.

import { SpiritBox, type ListenOptions } from "./engine.ts";

export type ToWorker = { type: "wake" } | { type: "listen"; id: number; audio: Float32Array; opts: ListenOptions };

let box: Promise<SpiritBox> | null = null;

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "wake") {
      box ??= SpiritBox.load({
        localPath: "/models/",
        wasmPaths: "/ort/",
        onProgress: (p) => self.postMessage({ type: "progress", ...p }),
      });
      await box;
      self.postMessage({ type: "awake", threads: self.crossOriginIsolated ? navigator.hardwareConcurrency : 1 });
    } else if (msg.type === "listen") {
      if (!box) throw new Error("not awake");
      const hearing = await (await box).listen(msg.audio, msg.opts);
      self.postMessage({ type: "heard", id: msg.id, hearing });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: "id" in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
