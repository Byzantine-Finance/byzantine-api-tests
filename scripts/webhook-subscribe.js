/**
 * Create a PERSISTENT webhook subscription on the current environment (dev by default)
 * and leave it alive, so you can trigger real lifecycle events and watch them arrive.
 *
 * Unlike the test suite, this does NOT delete the subscription afterwards.
 * Clean it up later with: node scripts/webhook-cleanup.js <subscriptionId>
 *
 * Event types default to the `eventTypes` in
 * fixtures/test-data/webhooks/create-subscription-request.json
 * (override with the WEBHOOK_EVENT_TYPES env var).
 *
 * Usage:
 *   node scripts/webhook-subscribe.js https://your-ngrok-url
 *   TEST_WEBHOOK_URL=https://your-ngrok-url node scripts/webhook-subscribe.js
 *   WEBHOOK_EVENT_TYPES="customer.created,customer.active" node scripts/webhook-subscribe.js <url>
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { apiClient } from "../utils/api-client.js";
import { endpoints } from "../config/endpoints.js";

const fixture = JSON.parse(
  fs.readFileSync(
    fileURLToPath(
      new URL(
        "../fixtures/test-data/webhooks/create-subscription-request.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

const url = process.argv[2] || process.env.TEST_WEBHOOK_URL || fixture.url;

if (!url) {
  console.error(
    "Missing URL.\nUsage: node scripts/webhook-subscribe.js <https-url>  (or set TEST_WEBHOOK_URL)",
  );
  process.exit(1);
}

// Default to the fixture's eventTypes; override with WEBHOOK_EVENT_TYPES
const eventTypes = process.env.WEBHOOK_EVENT_TYPES
  ? process.env.WEBHOOK_EVENT_TYPES.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : fixture.eventTypes;

const res = await apiClient.post(
  endpoints.webhooks.subscriptions,
  { url, enabled: true, eventTypes },
  { authenticated: true },
);

if (!res.ok) {
  console.error("❌ Failed to create subscription:", res.status, res.error);
  process.exit(1);
}

const { subscription, publicKey, algorithm } = res.data;
console.log("✅ Created persistent webhook subscription");
console.log("   id:        ", subscription.id);
console.log("   url:       ", subscription.url);
console.log("   enabled:   ", subscription.enabled);
console.log("   eventTypes:", subscription.eventTypes);
console.log("   publicKey: ", publicKey, `(${algorithm})`);
console.log("");
console.log("Now trigger an event (e.g. create an account) and watch your receiver.");
console.log(`Clean up later with: node scripts/webhook-cleanup.js ${subscription.id}`);
