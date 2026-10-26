// onnxruntime-web loads its wasm at runtime. Serve it from this site instead
// of a CDN, so the séance works offline and nothing is fetched from elsewhere.
import fs from "node:fs";
import path from "node:path";

const from = path.resolve("node_modules/onnxruntime-web/dist");
const to = path.resolve("public/ort");
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) {
  if (/^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(f)) fs.copyFileSync(path.join(from, f), path.join(to, f));
}
console.log("onnxruntime-web wasm copied to public/ort");
