/**
 * Instrumented "slow" webhook receiver for OBSERVING the Byzantine outbound
 * delivery worker's global in-flight cap (WEBHOOK_WORKER_MAX_IN_FLIGHT = 4).
 *
 * Difference vs webhook-receiver.js: this one HOLDS each request open for a
 * configurable delay before replying 200, and logs a live in-flight counter.
 * The delivery worker frees a slot only when your receiver responds, so an
 * instant 200 makes the cap invisible — each delivery is gone before the next
 * arrives, and you never see more than ~1 concurrently. Holding the slot open
 * lets pending deliveries stack up behind the cap so you can watch concurrency
 * plateau at 4.
 *
 * Keep the delay comfortably under the worker's ~10s total timeout (default
 * 2500ms) so deliveries still succeed and are not retried.
 *
 * Usage:
 *   node scripts/webhook-receiver-slow.js                 # :3000, 2500ms delay
 *   node scripts/webhook-receiver-slow.js 4000            # :4000
 *   WEBHOOK_DELAY_MS=4000 node scripts/webhook-receiver-slow.js
 *
 * Point ngrok at the SAME port, e.g.:
 *   ngrok http --url=estate-deeply-ether.ngrok-free.dev 3000
 *
 * Ctrl-C prints a summary with the max concurrency observed.
 */

import http from "node:http";

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const DELAY_MS = Number(process.env.WEBHOOK_DELAY_MS || 2500);
const CAP = 4; // WEBHOOK_WORKER_MAX_IN_FLIGHT — for annotating the logs only

// Per-subscriber delays, to simulate a SLOW subscriber starving the shared pool.
// webhook-fanout-test.js registers each subscription with a distinct
// ?fanout=<i> marker (i = 1..N), which arrives on the request URL here. Any
// index listed in WEBHOOK_SLOW_FANOUT holds WEBHOOK_SLOW_MS instead of the
// normal WEBHOOK_DELAY_MS. Example — subscribers 1 and 2 hang ~9s, rest ~100ms:
//   WEBHOOK_DELAY_MS=100 WEBHOOK_SLOW_MS=9000 WEBHOOK_SLOW_FANOUT=1,2 \
//     node scripts/webhook-receiver-slow.js 3000
const SLOW_MS = Number(process.env.WEBHOOK_SLOW_MS || 9000);
const SLOW_FANOUT = new Set(
  (process.env.WEBHOOK_SLOW_FANOUT || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

let inFlight = 0;
let maxInFlight = 0;
let total = 0;

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const server = http.createServer(async (req, res) => {
  // A slot is occupied the instant the request lands.
  const seq = ++total;
  inFlight += 1;
  if (inFlight > maxInFlight) maxInFlight = inFlight;

  // Drain the body so we can label the log line by event type.
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  await new Promise((resolve) => req.on("end", resolve));

  // Which subscriber is this? (?fanout=<i> set by webhook-fanout-test.js)
  let fanout = null;
  try {
    fanout = new URL(req.url, "http://localhost").searchParams.get("fanout");
  } catch {
    /* unparseable URL — treat as no fanout marker */
  }
  const isSlow = fanout !== null && SLOW_FANOUT.has(fanout);
  const delayForThis = isSlow ? SLOW_MS : DELAY_MS;

  let event = "?";
  try {
    const parsed = JSON.parse(body);
    event = parsed.eventType || parsed.event?.eventType || parsed.type || "?";
  } catch {
    /* non-JSON body */
  }
  const label = `${event} [sub#${fanout ?? "?"}]`;

  console.log(
    `[+] #${seq} arrived  ${label}  (hold ${delayForThis}ms${isSlow ? " SLOW" : ""})` +
      `  → in-flight: ${inFlight}` +
      (inFlight >= CAP ? "  ⟵ at cap" : ""),
  );

  // Hold the slot open so the worker can't immediately claim the next delivery.
  await sleep(delayForThis);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ received: true }));

  inFlight -= 1;
  console.log(
    `[-] #${seq} replied 200 ${label} (held ${delayForThis}ms)  → in-flight: ${inFlight}`,
  );
});

server.listen(PORT, () => {
  console.log(
    `Slow webhook receiver on http://localhost:${PORT}  (default hold ${DELAY_MS}ms)`,
  );
  if (SLOW_FANOUT.size > 0) {
    console.log(
      `Slow subscribers: sub#${[...SLOW_FANOUT].join(", sub#")} hold ${SLOW_MS}ms each.`,
    );
  }
  console.log(
    `Watching concurrency — max in-flight should plateau at the worker cap (${CAP}).`,
  );
  console.log("Ctrl-C for a summary.\n");
});

process.on("SIGINT", () => {
  console.log(
    `\n─── summary ───\n` +
      `total deliveries received: ${total}\n` +
      `max concurrent in-flight:  ${maxInFlight}  (worker cap is ${CAP})\n`,
  );
  process.exit(0);
});
