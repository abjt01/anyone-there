// Serves the static export the way Render does: clean URLs, and the
// cross-origin isolation headers from render.yaml.
//   node --experimental-strip-types test/helpers/serve.ts out 4320

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".mp3": "audio/mpeg",
};

export function serve(dir: string, port: number): Promise<http.Server> {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    else if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
    const headers = {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    };
    if (!fs.existsSync(file)) {
      res.writeHead(404, { ...headers, "Content-Type": TYPES[".html"] });
      res.end(fs.existsSync(path.join(root, "404.html")) ? fs.readFileSync(path.join(root, "404.html")) : "not found");
      return;
    }
    res.writeHead(200, { ...headers, "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Content-Length": fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir = "out", port = "4320"] = process.argv.slice(2);
  await serve(dir, Number(port));
  console.log(`serving ${dir} on http://127.0.0.1:${port}`);
}
