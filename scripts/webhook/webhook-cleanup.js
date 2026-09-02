/**
 * List or delete webhook subscriptions on the current environment.
 *
 * Usage:
 *   node scripts/webhook/webhook-cleanup.js                  # list all subscriptions
 *   node scripts/webhook/webhook-cleanup.js <subscriptionId> # delete that subscription
 *   node scripts/webhook/webhook-cleanup.js --all            # delete ALL subscriptions
 */

import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";

const arg = process.argv[2];

async function listSubscriptions() {
  const res = await apiClient.get(endpoints.webhooks.subscriptions, {
    authenticated: true,
  });
  if (!res.ok) {
    console.error("❌ Failed to list subscriptions:", res.status, res.error);
    process.exit(1);
  }
  return res.data.subscriptions;
}

async function deleteSubscription(id) {
  const res = await apiClient.delete(endpoints.webhooks.subscription(id), {
    authenticated: true,
  });
  if (!res.ok) {
    console.error(`❌ Failed to delete ${id}:`, res.status, res.error);
    return false;
  }
  console.log(`✅ Deleted ${id}`);
  return true;
}

if (!arg) {
  const subs = await listSubscriptions();
  if (subs.length === 0) {
    console.log("No webhook subscriptions.");
  } else {
    console.log(`${subs.length} subscription(s):`);
    for (const s of subs) {
      console.log(
        `  ${s.subscription.id}  enabled=${s.subscription.enabled}  ${s.subscription.url}`,
        `  events=[${s.subscription.eventTypes}]`,
      );
    }
    console.log("\nDelete one with: node scripts/webhook/webhook-cleanup.js <id>");
  }
} else if (arg === "--all") {
  const subs = await listSubscriptions();
  for (const s of subs) {
    await deleteSubscription(s.subscription.id);
  }
  console.log("Done.");
} else {
  await deleteSubscription(arg);
}
