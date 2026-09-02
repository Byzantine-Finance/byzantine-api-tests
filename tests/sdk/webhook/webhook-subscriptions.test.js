/**
 * Webhook Subscriptions SDK Tests, what are tested (via @byzantine/integrator-sdk):
 * - listWebhookSubscriptions()                 (GET  /v1/webhooks/subscriptions)
 * - createWebhookSubscription(body)            (POST /v1/webhooks/subscriptions)
 * - sendTestWebhookDelivery(id)                (POST /v1/webhooks/subscriptions/{id}/test)
 * - updateWebhookSubscription(id, body)        (PATCH /v1/webhooks/subscriptions/{id})
 * - deleteWebhookSubscription(id)              (DELETE /v1/webhooks/subscriptions/{id})
 *
 * Mirrors tests/api/webhook/webhook-subscriptions.test.js but exercises the SDK
 * methods (response shape: { data, error, response }) instead of raw HTTP.
 *
 * Read-only listing is always run (gated by enableWebhookTests).
 * The create/update/test/delete lifecycle additionally requires enableWriteTests.
 */

import { describe, it, expect, afterAll } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
} from "../../../utils/sdk-assertions.js";

import createSubscriptionRequest from "../../../fixtures/test-data/webhooks/create-subscription-request.json" assert { type: "json" };

// A well-formed UUID that should not correspond to any real subscription
const NONEXISTENT_SUBSCRIPTION_ID = "00000000-0000-4000-8000-000000000000";

const describeWebhooks = FEATURE_FLAGS.enableWebhookTests
  ? describe
  : describe.skip;

// Lifecycle (create/update/test/delete) only runs when write tests are enabled
const describeWrite =
  FEATURE_FLAGS.enableWebhookTests && FEATURE_FLAGS.enableWriteTests
    ? describe
    : describe.skip;

describeWebhooks("Webhook Subscriptions SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  describe("listWebhookSubscriptions()", () => {
    it(
      "should list webhook subscriptions",
      async () => {
        const sdkResponse = await client.api.listWebhookSubscriptions(DUMMY_AUTH);
        assertSuccessWithSchema(sdkResponse, "ListWebhookSubscriptionsResponse");
        expect(sdkResponse.data.subscriptions).toBeInstanceOf(Array);
        console.log(
          `✅ Found ${sdkResponse.data.subscriptions.length} webhook subscription(s)`,
        );
      },
      getTimeout("api"),
    );
  });

  describeWrite(
    "Subscription lifecycle (create → update → test → delete)",
    () => {
      // Subscription created in the first test, reused by the rest and cleaned up at the end
      let subscriptionId = null;

      // Unique per run so the create never collides with an existing subscription —
      // dev enforces a unique (integrator, url) constraint, and a persistent
      // subscription (e.g. from scripts/webhook/webhook-subscribe.js) may already use the base URL.
      const baseWebhookUrl =
        process.env.TEST_WEBHOOK_URL || createSubscriptionRequest.url;
      const subscriptionUrl = `${baseWebhookUrl.replace(/\/$/, "")}/sdk-test-${Date.now()}`;
      // `name` is an optional human-readable label on a subscription
      const subscriptionName = `sdk-test-${Date.now()}`;

      afterAll(async () => {
        // Best-effort cleanup in case the delete test didn't run (e.g. earlier failure)
        if (subscriptionId) {
          try {
            await client.api.deleteWebhookSubscription(subscriptionId, DUMMY_AUTH);
          } catch {
            // ignore cleanup errors
          }
        }
      });

      it(
        "should create a webhook subscription",
        async () => {
          const body = {
            ...createSubscriptionRequest,
            url: subscriptionUrl,
            name: subscriptionName,
          };

          const sdkResponse = await client.api.createWebhookSubscription(
            body,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(sdkResponse, "WebhookSubscriptionResponse");

          const { subscription, publicKey, algorithm } = sdkResponse.data;
          assertValidUuid(subscription.id);
          expect(subscription.url).toBe(subscriptionUrl);
          expect(subscription.name).toBe(subscriptionName);
          expect(subscription.enabled).toBe(true);
          expect(typeof publicKey).toBe("string");
          expect(typeof algorithm).toBe("string");

          subscriptionId = subscription.id;
          console.log(`✅ Created webhook subscription ${subscriptionId}`);
        },
        getTimeout("api"),
      );

      it(
        "should include the new subscription when listing",
        async () => {
          expect(subscriptionId).not.toBeNull();

          const sdkResponse = await client.api.listWebhookSubscriptions(DUMMY_AUTH);
          assertSuccessWithSchema(sdkResponse, "ListWebhookSubscriptionsResponse");

          const found = sdkResponse.data.subscriptions.find(
            (s) => s.subscription.id === subscriptionId,
          );
          expect(found).toBeDefined();
        },
        getTimeout("api"),
      );

      it(
        "should send a signed test webhook",
        async () => {
          expect(subscriptionId).not.toBeNull();

          const sdkResponse = await client.api.sendTestWebhookDelivery(
            subscriptionId,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(sdkResponse, "TestWebhookDeliveryResponse");
          assertValidUuid(sdkResponse.data.event.id);
          assertValidUuid(sdkResponse.data.delivery.id);
          expect(sdkResponse.data.delivery.subscriptionId).toBe(subscriptionId);
          console.log(
            `✅ Test webhook delivery ${sdkResponse.data.delivery.id} (status: ${sdkResponse.data.delivery.status})`,
          );
        },
        getTimeout("api"),
      );

      it(
        "should update the webhook subscription",
        async () => {
          expect(subscriptionId).not.toBeNull();

          const renamed = `${subscriptionName}-renamed`;
          const sdkResponse = await client.api.updateWebhookSubscription(
            subscriptionId,
            {
              enabled: false,
              eventTypes: ["transaction.withdrawal_initiated"],
              name: renamed,
            },
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(sdkResponse, "WebhookSubscriptionResponse");
          expect(sdkResponse.data.subscription.id).toBe(subscriptionId);
          expect(sdkResponse.data.subscription.enabled).toBe(false);
          expect(sdkResponse.data.subscription.name).toBe(renamed);
          console.log(`✅ Updated webhook subscription ${subscriptionId}`);
        },
        getTimeout("api"),
      );

      it(
        "should delete the webhook subscription",
        async () => {
          expect(subscriptionId).not.toBeNull();

          const sdkResponse = await client.api.deleteWebhookSubscription(
            subscriptionId,
            DUMMY_AUTH,
          );

          // Delete returns 200 with no schema body — assert success, not a schema
          expect(sdkResponse.error).toBeUndefined();
          expect(sdkResponse.response.status).toBe(200);
          console.log(`✅ Deleted webhook subscription ${subscriptionId}`);
          subscriptionId = null; // prevent afterAll from re-deleting
        },
        getTimeout("api"),
      );
    },
  );

  describeWrite("Subscription error handling", () => {
    it(
      "should return 404 when updating a non-existent subscription",
      async () => {
        const sdkResponse = await client.api.updateWebhookSubscription(
          NONEXISTENT_SUBSCRIPTION_ID,
          { enabled: false },
          DUMMY_AUTH,
        );
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(404);
      },
      getTimeout("api"),
    );

    it(
      "should return 404 when sending a test for a non-existent subscription",
      async () => {
        const sdkResponse = await client.api.sendTestWebhookDelivery(
          NONEXISTENT_SUBSCRIPTION_ID,
          DUMMY_AUTH,
        );
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(404);
      },
      getTimeout("api"),
    );
  });

  // Event-type filtering via the SDK (mirrors the API suite).
  describeWrite("Subscription eventTypes validation", () => {
    const created = [];

    afterAll(async () => {
      for (const id of created) {
        try {
          await client.api.deleteWebhookSubscription(id, DUMMY_AUTH);
        } catch {
          // ignore cleanup errors
        }
      }
    });

    const uniqueUrl = (tag) =>
      `https://example.com/byzantine-webhook/sdk-${tag}-${Date.now()}`;

    it(
      "should round-trip a specific subset of event types",
      async () => {
        const eventTypes = [
          "customer.created",
          "customer.active",
          "customer.rejected",
        ];
        const sdkResponse = await client.api.createWebhookSubscription(
          { url: uniqueUrl("subset"), enabled: true, eventTypes },
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(sdkResponse, "WebhookSubscriptionResponse");
        created.push(sdkResponse.data.subscription.id);

        expect([...sdkResponse.data.subscription.eventTypes].sort()).toEqual(
          [...eventTypes].sort(),
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject an unknown event type",
      async () => {
        const sdkResponse = await client.api.createWebhookSubscription(
          {
            url: uniqueUrl("bogus"),
            enabled: true,
            eventTypes: ["customer.bogus"],
          },
          DUMMY_AUTH,
        );
        if (!sdkResponse.error) {
          created.push(sdkResponse.data.subscription.id);
        }
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should reject webhook.test as an unsupported subscription event type",
      async () => {
        // webhook.test is deliverable (manual test probe) but not subscribable.
        const sdkResponse = await client.api.createWebhookSubscription(
          {
            url: uniqueUrl("webhook-test"),
            enabled: true,
            eventTypes: ["customer.created", "webhook.test"],
          },
          DUMMY_AUTH,
        );
        if (!sdkResponse.error) {
          created.push(sdkResponse.data.subscription.id);
        }
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should accept customer.deleted, which used to be rejected on subscribe",
      async () => {
        // Regression guard for the 2026-09-01 API change (mirrors the API suite).
        const eventTypes = ["customer.created", "customer.deleted"];
        const sdkResponse = await client.api.createWebhookSubscription(
          { url: uniqueUrl("deleted"), enabled: true, eventTypes },
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(sdkResponse, "WebhookSubscriptionResponse");
        created.push(sdkResponse.data.subscription.id);

        expect([...sdkResponse.data.subscription.eventTypes].sort()).toEqual(
          [...eventTypes].sort(),
        );
      },
      getTimeout("api"),
    );
  });
});
