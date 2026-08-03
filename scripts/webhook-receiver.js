/**
 * Local webhook receiver for manual testing of Byzantine webhook deliveries.
 *
 * Listens on a port (default 3000) and responds 200 to every request so that
 * Byzantine records the delivery as `succeeded`. Logs the method, the
 * x-byzantine-webhook-* signature headers, and the pretty-printed JSON body.
 *
 * Usage:
 *   node scripts/webhook-receiver.js            # listens on :3000
 *   PORT=80 sudo node scripts/webhook-receiver.js
 *   node scripts/webhook-receiver.js 4000       # listens on :4000
 *
 * Point ngrok at the SAME port, e.g.:
 *   ngrok http --url=estate-deeply-ether.ngrok-free.dev 3000
 */

import http from "node:http";

const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    console.log(`\n--- ${req.method} ${req.url} @ ${new Date().toISOString()}`);

    // Surface the Byzantine signature headers explicitly
    const webhookHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(([k]) =>
        k.toLowerCase().startsWith("x-byzantine-webhook-"),
      ),
    );
    if (Object.keys(webhookHeaders).length > 0) {
      console.log("webhook headers:", webhookHeaders);
    }

    // Pretty-print JSON bodies, fall back to raw text
    if (body) {
      try {
        console.log("body:", JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        console.log("body:", body);
      }
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  });
});

server.listen(PORT, () => {
  console.log(`Webhook receiver listening on http://localhost:${PORT}`);
  console.log(`Point ngrok at this port, then run the webhook tests.`);
});
