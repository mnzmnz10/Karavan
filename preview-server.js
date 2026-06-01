const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "frontend", "build");
const port = Number(process.env.PORT || 8088);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer((req, res) => {
    if ((req.url || "").startsWith("/api/")) {
      const proxy = https.request(
        {
          hostname: "corlukaravan.shop",
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: "corlukaravan.shop",
            origin: "https://corlukaravan.shop",
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxy.on("error", (error) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy error", detail: error.message }));
      });
      req.pipe(proxy);
      return;
    }

    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);

    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, "index.html");
    }

    res.setHeader("Content-Type", types[path.extname(filePath)] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Karavan preview: http://127.0.0.1:${port}`);
  });
