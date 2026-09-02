/**
 * Webhook Lifecycle Events — opt-in END-TO-END test.
 *
 * Drives a REAL customer.* lifecycle event and asserts it gets delivered:
 *   1. snapshot current delivery history
 *   2. POST a signed inbound Sumsub webhook (applicantReviewed) — same trigger as
 *      scripts/simulate-sumsub-review.js. The API re-fetches the applicant's LIVE
 *      status from Sumsub and emits the matching customer.* event.
 *   3. poll GET /v1/webhooks/deliveries until a NEW lifecycle delivery appears
 *   4. validate its payload against WebhookLifecycleEventPayload
 *
 * This is inherently non-deterministic (it depends on Sumsub sandbox state), so it
 * is DISABLED by default and gated behind ENABLE_WEBHOOK_LIFECYCLE_TESTS=true.
 *
 * Requirements (see .env.example):
 *   - ENABLE_WEBHOOK_LIFECYCLE_TESTS=true
 *   - SUMSUB_WEBHOOK_SECRET            (must match the TARGET API's secret)
 *   - SUMSUB_EXTERNAL_USER_ID          (the created user's UUID; GREEN in Sumsub
 *                                       sandbox if you expect customer.active)
 *   - A live subscription (TEST_WEBHOOK_SUBSCRIPTION_ID, or exactly one exists)
 *     subscribed to the expected event type, pointing at a receiver that 2xx's.
 *
 * Optional:
 *   - WEBHOOK_LIFECYCLE_EXPECTED_EVENT (default: customer.active)
 *   - WEBHOOK_LIFECYCLE_TIMEOUT_MS     (default: 30000)
 *
 * Never runs against production.
 */

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import axios from "axios";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { getEnvironmentBaseURL, isProduction } from "../../../config/environments.js";
import { getTimeout, FEATURE_FLAGS } from "../../../config/test.config.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertValidUuid,
} from "../../../utils/api-assertions.js";

const EXPECTED_EVENT =
  process.env.WEBHOOK_LIFECYCLE_EXPECTED_EVENT || "customer.active";
const POLL_TIMEOUT_MS = Number(process.env.WEBHOOK_LIFECYCLE_TIMEOUT_MS || 30000);
const POLL_INTERVAL_MS = 2000;

const externalUserId = process.env.SUMSUB_EXTERNAL_USER_ID;
const sumsubSecret = process.env.SUMSUB_WEBHOOK_SECRET;

// Gate: opt-in flag + never in prod + required inputs present.
const canRun =
  FEATURE_FLAGS.enableWebhookTests &&
  FEATURE_FLAGS.enableWebhookLifecycleTests &&
  !isProduction() &&
  Boolean(externalUserId) &&
  Boolean(sumsubSecret);

const describeLifecycle = canRun ? describe : describe.skip;

if (FEATURE_FLAGS.enableWebhookLifecycleTests && !canRun) {
  console.log(
    "ℹ️  Webhook lifecycle E2E skipped — needs non-prod env + SUMSUB_WEBHOOK_SECRET + SUMSUB_EXTERNAL_USER_ID",
  );
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Resolve the subscription to observe: explicit env id, else the only one. */
async function resolveSubscriptionId() {
  if (process.env.TEST_WEBHOOK_SUBSCRIPTION_ID) {
    return process.env.TEST_WEBHOOK_SUBSCRIPTION_ID;
  }
  const list = await apiClient.get(endpoints.webhooks.subscriptions, {
    authenticated: true,
  });
  assertSuccessWithSchema(list, "ListWebhookSubscriptionsResponse");
  const subs = list.data.subscriptions;
  if (subs.length !== 1) {
    throw new Error(
      `Expected exactly one subscription (or set TEST_WEBHOOK_SUBSCRIPTION_ID); found ${subs.length}`,
    );
  }
  return subs[0].subscription.id;
}

/** Fire the signed inbound Sumsub webhook (review trigger). */
async function triggerSumsubReview() {
  const baseURL = getEnvironmentBaseURL();
  const url = `${baseURL}${endpoints.providers.sumsubWebhook}`;
  const nowMs = Date.now().toString();

  const payload = {
    applicantId:
      process.env.SUMSUB_APPLICANT_ID || `sandbox-applicant-${externalUserId}`,
    inspectionId: `sandbox-inspection-${externalUserId}`,
    correlationId: `sandbox-correlation-${nowMs}`,
    levelName: process.env.SUMSUB_LEVEL_NAME || "basic-kyc-level",
    externalUserId,
    type: "applicantReviewed",
    reviewStatus: "completed",
    reviewResult: { reviewAnswer: process.env.SUMSUB_REVIEW_ANSWER || "GREEN" },
    createdAtMs: nowMs,
  };

  // Sign the exact bytes we send.
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", sumsubSecret)
    .update(body)
    .digest("hex");

  return axios.post(url, body, {
    headers: { "content-type": "application/json", "x-payload-digest": signature },
    validateStatus: () => true,
  });
}

const isLifecycleEvent = (eventType) =>
  typeof eventType === "string" &&
  (eventType.startsWith("customer.") || eventType.startsWith("transaction."));

describeLifecycle("Webhook Lifecycle Events (E2E)", () => {
  it(
    `should deliver a ${EXPECTED_EVENT} event after a Sumsub review`,
    async () => {
      const subscriptionId = await resolveSubscriptionId();
      console.log(`Observing subscription ${subscriptionId}`);

      // Delivery history is paginated (default 100, max 250), so scope every read
      // to the subscription under observation — otherwise unrelated history could
      // push the delivery we are waiting for off the page.
      const historyQuery = endpoints.webhooks.deliveriesQuery({
        subscriptionId,
        limit: 250,
        includeAttempts: false,
      });

      // 1. Snapshot existing delivery event ids so we only consider NEW ones.
      const before = await apiClient.get(historyQuery, {
        authenticated: true,
      });
      assertSuccessWithSchema(before, "ListWebhookDeliveriesResponse");
      const seenEventIds = new Set(
        before.data.deliveries.map((d) => d.event.id),
      );

      // 2. Trigger the review.
      const trigger = await triggerSumsubReview();
      console.log(`Sumsub webhook → ${trigger.status}`);
      if (trigger.status === 401) {
        throw new Error(
          "Inbound Sumsub webhook returned 401 — SUMSUB_WEBHOOK_SECRET does not match the target API's secret.",
        );
      }
      expect(trigger.status).toBe(200);

      // 3. Poll for a new lifecycle delivery.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let match = null;
      while (Date.now() < deadline && !match) {
        await sleep(POLL_INTERVAL_MS);
        const poll = await apiClient.get(historyQuery, {
          authenticated: true,
        });
        assertSuccessWithSchema(poll, "ListWebhookDeliveriesResponse");

        const fresh = poll.data.deliveries.filter(
          (d) =>
            !seenEventIds.has(d.event.id) && isLifecycleEvent(d.event.eventType),
        );
        if (fresh.length > 0) {
          // Prefer the expected event type, otherwise take any fresh lifecycle one
          match =
            fresh.find((d) => d.event.eventType === EXPECTED_EVENT) || fresh[0];
        }
      }

      if (!match) {
        throw new Error(
          `No new lifecycle delivery within ${POLL_TIMEOUT_MS}ms. ` +
            `Expected ${EXPECTED_EVENT}. Common causes: applicant not GREEN in Sumsub, ` +
            `subscription not subscribed to ${EXPECTED_EVENT}, or receiver not reachable.`,
        );
      }

      // 4. Validate the delivered event.
      console.log(
        `✅ Delivered ${match.event.eventType} (delivery ${match.delivery.id}, status ${match.delivery.status})`,
      );
      assertValidUuid(match.event.id);
      assertValidUuid(match.delivery.id);
      expect(match.delivery.subscriptionId).toBe(subscriptionId);
      assertSchema(match.event.payload, "WebhookLifecycleEventPayload");
      // The signed envelope names the event `type`; the delivery record wrapping
      // it still exposes the same value as `eventType`.
      expect(match.event.payload.type).toBe(match.event.eventType);

      if (EXPECTED_EVENT) {
        // Soft assert: surface a clear message if a different lifecycle event arrived
        expect(
          match.event.eventType,
          `Expected ${EXPECTED_EVENT} but received ${match.event.eventType} — is the applicant GREEN in Sumsub?`,
        ).toBe(EXPECTED_EVENT);
      }
    },
    getTimeout("e2e"),
  );
});
