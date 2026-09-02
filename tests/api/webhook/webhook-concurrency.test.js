/**
 * Webhook Delivery Concurrency — opt-in fan-out test.
 *
 * Validates the LOAD-GENERATION half of the outbound-worker in-flight-cap
 * experiment: one event fanned out to N subscriptions produces N deliveries
 * that all get delivered. It does NOT assert the cap value (4) itself — the cap
 * is observed at the receiver, where scripts/webhook/webhook-receiver-slow.js prints the
 * live in-flight plateau. This test asserts the burst is generated and drains.
 *
 * Flow:
 *   1. create N subscriptions → the same receiver URL, all on customer.created
 *   2. create one individual account → emits a single customer.created
 *   3. poll GET /v1/webhooks/deliveries until N deliveries for our subscriptions appear
 *   4. assert one delivery per subscription and that they all reach `succeeded`
 *   5. always clean up the N subscriptions
 *
 * Disabled by default — it writes an account on dev and needs a reachable
 * receiver (ideally scripts/webhook/webhook-receiver-slow.js behind ngrok, so the burst
 * stays in flight long enough to watch). Never runs against production.
 *
 * Requirements (see .env.example):
 *   - ENABLE_WEBHOOK_CONCURRENCY_TESTS=true
 *   - ENABLE_WRITE_TESTS=true
 *   - TEST_WEBHOOK_URL=<your ngrok receiver>
 * Optional:
 *   - FANOUT_COUNT (default 12)
 *   - WEBHOOK_CONCURRENCY_TIMEOUT_MS (default 40000)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { isProduction } from "../../../config/environments.js";
import { getTimeout, FEATURE_FLAGS } from "../../../config/test.config.js";
import { maybeUniqueEmail } from "../../../utils/test-helpers.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertValidUuid,
} from "../../../utils/api-assertions.js";
import validUser from "../../../fixtures/test-data/users/valid-user.json" assert { type: "json" };

const EVENT = "customer.created";
const COUNT = Number(process.env.FANOUT_COUNT || 12);
const POLL_TIMEOUT_MS = Number(process.env.WEBHOOK_CONCURRENCY_TIMEOUT_MS || 40000);
const POLL_INTERVAL_MS = 2000;
const receiverUrl = process.env.TEST_WEBHOOK_URL;

// Gate: opt-in flag + write tests + non-prod + a receiver URL present.
const canRun =
  FEATURE_FLAGS.enableWebhookTests &&
  FEATURE_FLAGS.enableWebhookConcurrencyTests &&
  FEATURE_FLAGS.enableWriteTests &&
  !isProduction() &&
  Boolean(receiverUrl);

const describeConcurrency = canRun ? describe : describe.skip;

if (FEATURE_FLAGS.enableWebhookConcurrencyTests && !canRun) {
  console.log(
    "ℹ️  Webhook concurrency test skipped — needs non-prod + ENABLE_WRITE_TESTS + TEST_WEBHOOK_URL",
  );
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Create COUNT subscriptions → the same receiver, all on EVENT. */
async function createFanoutSubscriptions() {
  const ids = [];
  for (let i = 0; i < COUNT; i++) {
    const res = await apiClient.post(
      endpoints.webhooks.subscriptions,
      { url: `${receiverUrl}?fanout=${i + 1}`, enabled: true, eventTypes: [EVENT] },
      { authenticated: true },
    );
    // No named schema for the create response; validate the essentials directly.
    expect(res.ok, `Subscription ${i + 1} failed: ${res.status} ${JSON.stringify(res.error)}`).toBe(true);
    assertValidUuid(res.data.subscription.id);
    ids.push(res.data.subscription.id);
  }
  return ids;
}

/** Trigger a single customer.created by creating one individual account. */
async function triggerOneEvent() {
  const ownerEmail = maybeUniqueEmail(validUser.userInfo.email);
  const payload = {
    ...validUser,
    userInfo: { ...validUser.userInfo, email: ownerEmail },
    rootUsers: (validUser.rootUsers || []).map((r) => ({
      ...r,
      email:
        r.email === validUser.userInfo.email
          ? ownerEmail
          : maybeUniqueEmail(r.email),
    })),
  };
  const res = await apiClient.post(endpoints.create.user, payload, {
    authenticated: true,
  });
  assertSuccessWithSchema(res, "CreateIndividualAccountResponse");
  return res;
}

async function deleteSubscriptions(ids) {
  for (const id of ids) {
    await apiClient
      .delete(endpoints.webhooks.subscription(id), { authenticated: true })
      .catch(() => {});
  }
}

describeConcurrency("Webhook Delivery Concurrency (fan-out)", () => {
  beforeAll(() => {
    // Fail fast if the trigger fixture drifts from the schema.
    assertSchema(validUser, "CreateIndividualAccountRequest");
  });

  it(
    `fans one ${EVENT} out to ${COUNT} deliveries that all succeed`,
    async () => {
      const subscriptionIds = await createFanoutSubscriptions();
      const wanted = new Set(subscriptionIds);
      console.log(`Created ${subscriptionIds.length} subscriptions → ${receiverUrl}`);

      try {
        await triggerOneEvent();
        console.log(`Triggered one ${EVENT}; polling deliveries ...`);

        // Poll until every subscription has a terminal delivery (or timeout).
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let ours = [];
        while (Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS);
          // Delivery history is paginated (default 100, max 250). Narrow to the
          // event type under test and take the largest page so the fan-out we are
          // waiting on cannot be pushed off by unrelated history.
          const poll = await apiClient.get(
            endpoints.webhooks.deliveriesQuery({
              eventType: EVENT,
              limit: 250,
              includeAttempts: false,
            }),
            { authenticated: true },
          );
          assertSuccessWithSchema(poll, "ListWebhookDeliveriesResponse");

          ours = poll.data.deliveries.filter((d) =>
            wanted.has(d.delivery.subscriptionId),
          );
          const terminal = ours.filter((d) =>
            ["succeeded", "failed"].includes(d.delivery.status),
          );
          if (ours.length >= COUNT && terminal.length >= COUNT) break;
        }

        // The deterministic claim: one event produced one delivery per subscription.
        const bySubscription = new Set(ours.map((d) => d.delivery.subscriptionId));
        expect(
          bySubscription.size,
          `Expected ${COUNT} deliveries (one per subscription) for the single ${EVENT} event`,
        ).toBe(COUNT);

        for (const d of ours) {
          assertValidUuid(d.delivery.id);
          expect(d.event.eventType).toBe(EVENT);
        }

        // With a receiver that 2xx's, every delivery should drain to succeeded.
        const succeeded = ours.filter((d) => d.delivery.status === "succeeded");
        console.log(
          `✅ ${bySubscription.size} deliveries generated; ${succeeded.length}/${COUNT} succeeded.`,
        );
        expect(
          succeeded.length,
          `Only ${succeeded.length}/${COUNT} deliveries succeeded — is the receiver at ${receiverUrl} reachable and replying 2xx?`,
        ).toBe(COUNT);
      } finally {
        await deleteSubscriptions(subscriptionIds);
        console.log(`🧹 Cleaned up ${subscriptionIds.length} subscriptions.`);
      }
    },
    getTimeout("e2e"),
  );
});
