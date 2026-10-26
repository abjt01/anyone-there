// The checks openai/whisper runs on every 30-second window before it trusts
// the text (transcribe.py: no_speech_threshold, logprob_threshold,
// compression_ratio_threshold). This app runs them too, but only to show what
// Whisper's own guard would have done. It never throws anything away.

export const NO_SPEECH = 0.6;
export const LOGPROB = -1;
export const COMPRESSION = 2.4;

export type GuardVerdict = {
  // "nobody is talking": no_speech_prob over 0.6 and the text itself unsure
  silent: boolean;
  // the text repeats itself too much (gzip squeezes it more than 2.4 times)
  repetitive: boolean;
  // average log-probability under -1: Whisper would retry hotter
  unsure: boolean;
  compression: number;
  // what Whisper's default settings would do with these words:
  // print them, decode the window again at a higher temperature, or drop it as silence
  outcome: "kept" | "retried" | "dropped";
};

export async function compressionRatio(text: string): Promise<number> {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length === 0) return 0;
  // "deflate" is the zlib format, the same as Python's zlib.compress
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  const zipped = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytes.length / zipped.length;
}

export async function guardVerdict(h: { text: string; noSpeech: number; avgLogprob: number }): Promise<GuardVerdict> {
  const compression = await compressionRatio(h.text);
  const unsure = h.avgLogprob < LOGPROB;
  const silent = h.noSpeech > NO_SPEECH && unsure;
  const repetitive = compression > COMPRESSION;
  const outcome = silent || h.text.length === 0 ? "dropped" : repetitive || unsure ? "retried" : "kept";
  return { silent, repetitive, unsure, compression, outcome };
}
