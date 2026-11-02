// Minimal static server for the `out/` export (no dependencies). It mimics
// how S3/CloudFront would serve the site: files as-is, `/` -> index.html,
// unknown paths -> 404.html. Usage: npm run build && npm start
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  let file = join(root, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    if (!extname(file)) file += ".html";
  }
  try {
    const body = await readFile(file);
    const immutable = file.includes(`${join(root, "_next", "static")}`);
    res.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(body);
  } catch {
    const body = await readFile(join(root, "404.html")).catch(() => "Not found");
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  }
}).listen(port, () => console.log(`Serving out/ at http://localhost:${port}`));
