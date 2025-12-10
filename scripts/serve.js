import { createServer } from "http";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(dirname(__filename));

let PORT = 3000;

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

/**
 * Start the HTTP server so that we can test passkey in the browser
 * @param {number} port - The port to listen on
 */
function startServer(port) {
  const newServer = createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Handle POST request to save user data
    const urlPath = req.url.split("?")[0]; // Remove query string
    console.log(`Checking route: method=${req.method}, urlPath=${urlPath}`);
    if (req.method === "POST" && urlPath === "/save-user-data") {
      console.log("📝 Received POST request to save user data");
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const userData = JSON.parse(body);
          const filePath = join(
            __dirname,
            "fixtures/test-data/users/valid-user.json"
          );
          writeFileSync(filePath, JSON.stringify(userData, null, 2));
          console.log("✅ Saved user data to:", filePath);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error("❌ Error saving user data:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // Handle POST request to save transaction data
    if (req.method === "POST" && urlPath === "/save-tx-data") {
      console.log("📝 Received POST request to save transaction data");
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const txData = JSON.parse(body);
          const filePath = join(
            __dirname,
            "fixtures/test-data/__generated__/tx-passkey.json"
          );
          writeFileSync(filePath, JSON.stringify(txData, null, 2));
          console.log("✅ Saved transaction data to:", filePath);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error("❌ Error saving transaction data:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    try {
      // Remove leading slash and handle root path
      let relativePath =
        req.url === "/" ? "tests/web/test-passkey.html" : req.url.substring(1);
      let filePath = join(__dirname, relativePath);

      const ext = filePath.substring(filePath.lastIndexOf("."));
      const contentType = mimeTypes[ext] || "application/octet-stream";

      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404);
        res.end("File not found");
      } else {
        res.writeHead(500);
        res.end("Server error: " + error.message);
      }
    }
  });

  newServer
    .listen(port, () => {
      console.log(`\n🚀 Server running at http://localhost:${port}/`);
      console.log(
        `📄 Open http://localhost:${port}/tests/web/test-passkey.html in your browser\n`
      );
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(
          `⚠️  Port ${port} is already in use, trying ${port + 1}...`
        );
        startServer(port + 1);
      } else {
        console.error("Server error:", err);
        process.exit(1);
      }
    });
}

startServer(PORT);
