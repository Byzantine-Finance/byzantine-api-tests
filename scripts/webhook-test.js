/**
 * Send a manual signed test webhook to a subscription, to confirm the
 * delivery pipeline (subscription → ngrok → your receiver) works end to end.
 *
 * Usage:
 *   node scripts/webhook-test.js                  # test the only subscription (errors if 0 or >1)
 *   node scripts/webhook-test.js <subscriptionId> # test a specific subscription
 */

import { apiClient } from "../utils/api-client.js";
import { endpoints } from "../config/endpoints.js";

let id = process.argv[2];

if (!id) {
  const list = await apiClient.get(endpoints.webhooks.subscriptions, {
    authenticated: true,
  });
  if (!list.ok) {
    console.error("❌ Failed to list subscriptions:", list.status, list.error);
    process.exit(1);
  }
  const subs = list.data.subscriptions;
  if (subs.length === 0) {
    console.error("No subscriptions exist. Run scripts/webhook-subscribe.js first.");
    process.exit(1);
  }
  if (subs.length > 1) {
    console.error("Multiple subscriptions exist — pass an id explicitly:");
    for (const s of subs) console.error(`  ${s.subscription.id}  ${s.subscription.url}`);
    process.exit(1);
  }
  id = subs[0].subscription.id;
  console.log(`Using the only subscription: ${id} (${subs[0].subscription.url})`);
  console.log(`enabled=${subs[0].subscription.enabled}`);
}

const res = await apiClient.post(
  endpoints.webhooks.testSubscription(id),
  undefined,
  { authenticated: true },
);

if (!res.ok) {
  console.error("❌ Test webhook failed:", res.status, res.error);
  process.exit(1);
}

const { delivery, attempt } = res.data;
console.log(`Delivery ${delivery.id} status: ${delivery.status}`);
if (attempt) {
  console.log(`Attempt outcome: ${attempt.outcome}, HTTP ${attempt.statusCode}`);
}
if (delivery.status === "succeeded") {
  console.log("✅ Pipeline works — your receiver got it and replied 2xx.");
} else {
  console.log("⚠️  Delivery did not succeed. Check your receiver + ngrok port.");
  console.log("   terminalReason:", delivery.terminalReason);
}
