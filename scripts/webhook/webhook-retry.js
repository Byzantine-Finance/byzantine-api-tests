/**
 * Retry a webhook delivery (re-sends an existing event — no new event created,
 * so it avoids the "duplicate test event" constraint). Handy to re-deliver a
 * previously-failed delivery once your receiver is finally up.
 *
 * Usage:
 *   node scripts/webhook/webhook-retry.js              # retry the most recent delivery
 *   node scripts/webhook/webhook-retry.js <deliveryId> # retry a specific delivery
 */

import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";

let deliveryId = process.argv[2];

if (!deliveryId) {
  const list = await apiClient.get(endpoints.webhooks.deliveries, {
    authenticated: true,
  });
  if (!list.ok) {
    console.error("❌ Failed to list deliveries:", list.status, list.error);
    process.exit(1);
  }
  const deliveries = list.data.deliveries;
  if (deliveries.length === 0) {
    console.error("No deliveries in history to retry.");
    process.exit(1);
  }
  // Most recent by createdAt
  const latest = [...deliveries].sort(
    (a, b) =>
      new Date(b.delivery.createdAt).valueOf() -
      new Date(a.delivery.createdAt).valueOf(),
  )[0];
  deliveryId = latest.delivery.id;
  console.log(
    `Retrying most recent delivery: ${deliveryId} (was: ${latest.delivery.status})`,
  );
}

const res = await apiClient.post(
  endpoints.webhooks.retryDelivery(deliveryId),
  undefined,
  { authenticated: true },
);

if (!res.ok) {
  console.error("❌ Retry failed:", res.status, res.error);
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
  console.log("⚠️  Still not succeeding. terminalReason:", delivery.terminalReason);
}
