/**
 * Fan-out load generator for the Byzantine outbound webhook delivery worker.
 *
 * Creates N webhook subscriptions that all point at the SAME receiver URL and
 * all listen for the full set of customer.* events, then triggers the first
 * event (customer.created) by creating a single individual account. The API
 * fans that one event out to N pending deliveries in a single burst — which the
 * background worker drains at most WEBHOOK_WORKER_MAX_IN_FLIGHT (=4) at a time.
 *
 * The subscriptions are KEPT ALIVE by default so you can reuse the SAME account
 * to drive later customer.* events and watch each one fan out to all N
 * subscribers too. The script prints the created account's userId; feed it to
 * scripts/simulate-sumsub-review.js to trigger customer.under_review /
 * customer.active / etc. for that same applicant.
 *
 * Pair with scripts/webhook-receiver-slow.js (running behind ngrok at the URL
 * you pass here) to WATCH the in-flight count plateau at 4. A fast receiver
 * drains the burst too quickly to see the cap.
 *
 * Usage:
 *   node scripts/webhook-fanout-test.js https://your-ngrok-url
 *   FANOUT_COUNT=12 node scripts/webhook-fanout-test.js https://your-ngrok-url
 *   node scripts/webhook-fanout-test.js https://your-ngrok-url --cleanup
 *
 * Env:
 *   FANOUT_COUNT    subscriptions / simultaneous deliveries to generate (default 12)
 *   FANOUT_EVENTS   comma-separated event types to subscribe to
 *                   (default: all subscribable customer.* events)
 *   SETTLE_MS       with --cleanup, wait before deleting for deliveries to drain (default 20000)
 *   TEST_WEBHOOK_URL  receiver URL if not passed as the first arg
 *
 * Writes accounts on dev — refuses to run against production.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { apiClient } from "../utils/api-client.js";
import { endpoints } from "../config/endpoints.js";
import { isProduction } from "../config/environments.js";

// Inline, memoized unique-email helper. We intentionally do NOT import
// utils/test-helpers.js here: it pulls in config/test.config.js, which imports
// JSON without an import attribute and crashes when this script is run directly
// under Node. Memoizing per input email preserves the owner==root relationship
// (same input → same output) while keeping every run's emails unique.
const emailSuffix = `fanout-${Math.floor(Date.now() / 1000)}-${crypto
  .randomUUID()
  .slice(0, 8)}`;
const emailMap = new Map();
const uniqueEmail = (email) => {
  if (!emailMap.has(email)) {
    const [local, domain] = email.split("@");
    emailMap.set(email, `${local}+${emailSuffix}@${domain}`);
  }
  return emailMap.get(email);
};

const validUser = JSON.parse(
  fs.readFileSync(
    fileURLToPath(
      new URL("../fixtures/test-data/users/valid-user.json", import.meta.url),
    ),
    "utf8",
  ),
);

if (isProduction()) {
  console.error("❌ Refusing to run the fan-out load test against production.");
  process.exit(1);
}

// The subscribable customer.* lifecycle events. customer.deleted is emitted but
// NOT subscribable, so it is intentionally excluded.
const CUSTOMER_EVENTS = [
  "customer.created",
  "customer.updated",
  "customer.under_review",
  "customer.awaiting_associated_person_information",
  "customer.resubmission_requested",
  "customer.active",
  "customer.rejected",
];

const cliArgs = process.argv.slice(2);
const cleanup = cliArgs.includes("--cleanup");
const url =
  cliArgs.find((a) => !a.startsWith("--")) || process.env.TEST_WEBHOOK_URL;
const COUNT = Number(process.env.FANOUT_COUNT || 12);
const EVENT_TYPES = process.env.FANOUT_EVENTS
  ? process.env.FANOUT_EVENTS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : CUSTOMER_EVENTS;
// The event fired by this script's trigger (account creation).
const TRIGGER_EVENT = "customer.created";
const SETTLE_MS = Number(process.env.SETTLE_MS || 20000);

if (!url) {
  console.error(
    "Missing receiver URL.\n" +
      "Usage: node scripts/webhook-fanout-test.js <https-url> [--cleanup]  (or set TEST_WEBHOOK_URL)",
  );
  process.exit(1);
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// 1. Create COUNT subscriptions, all → same receiver, all on EVENT_TYPES.
//    A distinct ?fanout=<i> query keeps the subscription URLs unique in case
//    the API rejects duplicate URLs; the receiver ignores the query string.
console.log(
  `Creating ${COUNT} subscriptions → ${url}\n  events: ${EVENT_TYPES.join(", ")}`,
);
const created = [];
for (let i = 0; i < COUNT; i++) {
  const res = await apiClient.post(
    endpoints.webhooks.subscriptions,
    { url: `${url}?fanout=${i + 1}`, enabled: true, eventTypes: EVENT_TYPES },
    { authenticated: true },
  );
  if (!res.ok) {
    console.error(`❌ Subscription ${i + 1} failed:`, res.status, res.error);
    continue;
  }
  created.push(res.data.subscription.id);
}
console.log(`✅ Created ${created.length}/${COUNT} subscriptions.`);
if (created.length === 0) process.exit(1);

// 2. Trigger ONE event by creating a single individual account.
//    Uniquify emails (preserving owner==root) so repeated runs don't collide.
const ownerEmail = uniqueEmail(validUser.userInfo.email);
const payload = {
  ...validUser,
  userInfo: { ...validUser.userInfo, email: ownerEmail },
  rootUsers: (validUser.rootUsers || []).map((r) => ({
    ...r,
    email: uniqueEmail(r.email),
  })),
};

console.log(
  `\nTriggering ${TRIGGER_EVENT} (create individual account, ${ownerEmail}) ...`,
);
const acct = await apiClient.post(endpoints.create.user, payload, {
  authenticated: true,
});
if (!acct.ok) {
  console.error("❌ Account creation failed:", acct.status, acct.error);
  console.error("   No event fired.");
} else {
  const { userId, accountId } = acct.data;
  console.log(
    `✅ Account created — one ${TRIGGER_EVENT} should fan out to ${created.length} deliveries.`,
  );
  console.log(`   userId:    ${userId}`);
  console.log(`   accountId: ${accountId}`);
  console.log(
    "   Watch your slow receiver: in-flight should plateau at 4, draining in waves.",
  );
  console.log(
    "\nReuse this SAME account to drive later customer.* events (they will fan out\n" +
      `to all ${created.length} subscriptions too). E.g. drive a Sumsub review:`,
  );
  console.log(`   node scripts/simulate-sumsub-review.js ${userId}`);
}

// 3. Leave the subscriptions alive for reuse (default), or tear them down with
//    --cleanup after letting the initial burst drain.
if (!cleanup) {
  console.log(
    `\nLeaving ${created.length} subscriptions ALIVE for event reuse.`,
  );
  console.log("Delete them when done with: node scripts/webhook-cleanup.js --all");
} else {
  console.log(
    `\n--cleanup set — settling ${SETTLE_MS}ms for deliveries to drain, then deleting ...`,
  );
  await sleep(SETTLE_MS);
  let deleted = 0;
  for (const id of created) {
    const res = await apiClient.delete(endpoints.webhooks.subscription(id), {
      authenticated: true,
    });
    if (res.ok) deleted += 1;
  }
  console.log(`🧹 Cleaned up ${deleted}/${created.length} subscriptions.`);
}
