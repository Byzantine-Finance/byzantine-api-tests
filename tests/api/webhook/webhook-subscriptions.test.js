/**
 * Webhook Subscriptions API Tests, what are tested:
 * - GET  /v1/webhooks/subscriptions                      (list subscriptions)
 * - POST /v1/webhooks/subscriptions                      (create subscription)
 * - POST /v1/webhooks/subscriptions/{id}/test            (send signed test webhook)
 * - PATCH /v1/webhooks/subscriptions/{id}                (update subscription)
 * - DELETE /v1/webhooks/subscriptions/{id}               (delete subscription)
 *
 * Read-only listing is always run (gated by enableWebhookTests).
 * The create/update/test/delete lifecycle additionally requires enableWriteTests.
 */

import { describe, it, expect, afterAll } from "vitest";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
} from "../../../utils/api-assertions.js";
import { getSchema } from "../../../utils/schemas.js";

import createSubscriptionRequest from "../../../fixtures/test-data/webhooks/create-subscription-request.json" assert { type: "json" };

// A well-formed UUID that should not correspond to any real subscription
const NONEXISTENT_SUBSCRIPTION_ID = "00000000-0000-4000-8000-000000000000";

// Every public event name, minus the one that cannot be subscribed to:
//   · webhook.test — manual delivery probe only ("Unsupported webhook event type")
// customer.deleted used to be rejected here too; as of the 2026-09-01 API it is
// subscribable like any other lifecycle event (re-probed against dev).
// Derived from the generated enum, so a new event type in the spec is picked up
// here automatically (e.g. customer.deactivated).
const NON_SUBSCRIBABLE_EVENT_TYPES = ["webhook.test"];
const SUBSCRIBABLE_EVENT_TYPES = (getSchema("WebhookEventType")?.enum ?? []).filter(
  (t) => !NON_SUBSCRIBABLE_EVENT_TYPES.includes(t),
);

const describeWebhooks = FEATURE_FLAGS.enableWebhookTests
  ? describe
  : describe.skip;

// Lifecycle (create/update/test/delete) only runs when write tests are enabled
const describeWrite =
  FEATURE_FLAGS.enableWebhookTests && FEATURE_FLAGS.enableWriteTests
    ? describe
    : describe.skip;

describeWebhooks("Webhook Subscriptions API", () => {
  describe("GET /v1/webhooks/subscriptions", () => {
    it(
      "should list webhook subscriptions",
      async () => {
        const response = await apiClient.get(endpoints.webhooks.subscriptions, {
          authenticated: true,
        });
        assertSuccessWithSchema(response, "ListWebhookSubscriptionsResponse");
        expect(response.data.subscriptions).toBeInstanceOf(Array);
        console.log(
          `✅ Found ${response.data.subscriptions.length} webhook subscription(s)`,
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

      // Unique per run so the create never collides with an existing
      // subscription — dev enforces a unique (integrator, url) constraint, and a
      // persistent subscription (e.g. from scripts/webhook/webhook-subscribe.js) may
      // already use the base URL.
      const baseWebhookUrl =
        process.env.TEST_WEBHOOK_URL || createSubscriptionRequest.url;
      const subscriptionUrl = `${baseWebhookUrl.replace(/\/$/, "")}/test-${Date.now()}`;
      // `name` is an optional human-readable label on a subscription
      const subscriptionName = `api-test-${Date.now()}`;

      afterAll(async () => {
        // Best-effort cleanup in case the delete test didn't run (e.g. earlier failure)
        if (subscriptionId) {
          try {
            await apiClient.delete(
              endpoints.webhooks.subscription(subscriptionId),
              {
                authenticated: true,
              },
            );
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

          const response = await apiClient.post(
            endpoints.webhooks.subscriptions,
            body,
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "WebhookSubscriptionResponse", 201);

          const { subscription, publicKey, algorithm } = response.data;
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

          const response = await apiClient.get(
            endpoints.webhooks.subscriptions,
            {
              authenticated: true,
            },
          );
          assertSuccessWithSchema(response, "ListWebhookSubscriptionsResponse");

          const found = response.data.subscriptions.find(
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

          const response = await apiClient.post(
            endpoints.webhooks.testSubscription(subscriptionId),
            undefined,
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "TestWebhookDeliveryResponse");
          assertValidUuid(response.data.event.id);
          assertValidUuid(response.data.delivery.id);
          expect(response.data.delivery.subscriptionId).toBe(subscriptionId);
          console.log(
            `✅ Test webhook delivery ${response.data.delivery.id} (status: ${response.data.delivery.status})`,
          );
        },
        getTimeout("api"),
      );

      it(
        "should update the webhook subscription",
        async () => {
          expect(subscriptionId).not.toBeNull();

          const renamed = `${subscriptionName}-renamed`;
          const response = await apiClient.patch(
            endpoints.webhooks.subscription(subscriptionId),
            {
              enabled: false,
              eventTypes: ["transaction.withdrawal_initiated"],
              name: renamed,
            },
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "WebhookSubscriptionResponse");
          expect(response.data.subscription.id).toBe(subscriptionId);
          expect(response.data.subscription.enabled).toBe(false);
          expect(response.data.subscription.name).toBe(renamed);
          console.log(`✅ Updated webhook subscription ${subscriptionId}`);
        },
        getTimeout("api"),
      );

      it(
        "should delete the webhook subscription",
        async () => {
          expect(subscriptionId).not.toBeNull();

          const response = await apiClient.delete(
            endpoints.webhooks.subscription(subscriptionId),
            { authenticated: true },
          );

          assertSuccess(response);
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
        const response = await apiClient.patch(
          endpoints.webhooks.subscription(NONEXISTENT_SUBSCRIPTION_ID),
          { enabled: false },
          { authenticated: true },
        );
        assertError(response, 404);
      },
      getTimeout("api"),
    );

    it(
      "should return 404 when sending a test for a non-existent subscription",
      async () => {
        const response = await apiClient.post(
          endpoints.webhooks.testSubscription(NONEXISTENT_SUBSCRIPTION_ID),
          undefined,
          { authenticated: true },
        );
        assertError(response, 404);
      },
      getTimeout("api"),
    );
  });

  // Event-type filtering: now that real customer.* events emit, subscribers can
  // scope which events they receive. These document the dev API's actual
  // validation behavior (probed 2026-06-23).
  describeWrite("Subscription eventTypes validation", () => {
    const created = [];

    afterAll(async () => {
      for (const id of created) {
        try {
          await apiClient.delete(endpoints.webhooks.subscription(id), {
            authenticated: true,
          });
        } catch {
          // ignore cleanup errors
        }
      }
    });

    const uniqueUrl = (tag) =>
      `https://example.com/byzantine-webhook/${tag}-${Date.now()}`;

    it(
      "should round-trip a specific subset of event types",
      async () => {
        const eventTypes = [
          "customer.created",
          "customer.active",
          "customer.rejected",
        ];
        const response = await apiClient.post(
          endpoints.webhooks.subscriptions,
          { url: uniqueUrl("subset"), enabled: true, eventTypes },
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "WebhookSubscriptionResponse", 201);
        created.push(response.data.subscription.id);

        // Persisted set should match exactly (order-independent)
        expect([...response.data.subscription.eventTypes].sort()).toEqual(
          [...eventTypes].sort(),
        );
      },
      getTimeout("api"),
    );

    it(
      "should default to the full supported set when eventTypes is empty",
      async () => {
        const response = await apiClient.post(
          endpoints.webhooks.subscriptions,
          { url: uniqueUrl("empty"), enabled: true, eventTypes: [] },
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "WebhookSubscriptionResponse", 201);
        created.push(response.data.subscription.id);

        const persisted = response.data.subscription.eventTypes;
        // The default expands to exactly the subscribable set — every event type
        // in the spec except webhook.test
        expect([...persisted].sort()).toEqual([...SUBSCRIBABLE_EVENT_TYPES].sort());
      },
      getTimeout("api"),
    );

    it(
      "should reject an unknown event type",
      async () => {
        const response = await apiClient.post(
          endpoints.webhooks.subscriptions,
          {
            url: uniqueUrl("bogus"),
            enabled: true,
            eventTypes: ["customer.bogus"],
          },
          { authenticated: true },
        );
        if (response.ok) {
          // Shouldn't happen on dev, but clean up and surface it rather than silently passing
          created.push(response.data.subscription.id);
        }
        assertError(response, 400);
      },
      getTimeout("api"),
    );

    it(
      "should reject webhook.test as an unsupported subscription event type",
      async () => {
        // webhook.test is a valid WebhookEventType (it is delivered by the manual
        // test probe) but is NOT subscribable — the API rejects it on create with
        // "Unsupported webhook event type", distinct from the "Unknown webhook
        // event type" it returns for a name that isn't in the enum at all.
        const response = await apiClient.post(
          endpoints.webhooks.subscriptions,
          {
            url: uniqueUrl("webhook-test"),
            enabled: true,
            eventTypes: ["customer.created", "webhook.test"],
          },
          { authenticated: true },
        );
        if (response.ok) {
          created.push(response.data.subscription.id);
        }
        assertError(response, 400);
      },
      getTimeout("api"),
    );

    it(
      "should accept customer.deleted, which used to be rejected on subscribe",
      async () => {
        // Regression guard for the 2026-09-01 API change: customer.deleted is now
        // subscribable, and is part of the default set.
        const eventTypes = ["customer.created", "customer.deleted"];
        const response = await apiClient.post(
          endpoints.webhooks.subscriptions,
          { url: uniqueUrl("deleted"), enabled: true, eventTypes },
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "WebhookSubscriptionResponse", 201);
        created.push(response.data.subscription.id);

        expect([...response.data.subscription.eventTypes].sort()).toEqual(
          [...eventTypes].sort(),
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject an invalid webhook URL",
      async () => {
        const response = await apiClient.post(
          endpoints.webhooks.subscriptions,
          { url: "not-a-url", enabled: true, eventTypes: ["customer.created"] },
          { authenticated: true },
        );
        if (response.ok) {
          created.push(response.data.subscription.id);
        }
        assertError(response, 400);
      },
      getTimeout("api"),
    );

    it(
      "should reset to all supported events when PATCH sends an empty eventTypes array",
      async () => {
        // Start narrow, then PATCH with [] — the API treats an empty array as
        // "subscribe to everything", NOT "no change". (Omitting eventTypes is what
        // leaves the set untouched — covered by the next test.)
        const subset = ["customer.created", "customer.active"];
        const createRes = await apiClient.post(
          endpoints.webhooks.subscriptions,
          { url: uniqueUrl("patch-empty"), enabled: true, eventTypes: subset },
          { authenticated: true },
        );
        assertSuccessWithSchema(createRes, "WebhookSubscriptionResponse", 201);
        const id = createRes.data.subscription.id;
        created.push(id);

        const patchRes = await apiClient.patch(
          endpoints.webhooks.subscription(id),
          { eventTypes: [] },
          { authenticated: true },
        );
        assertSuccessWithSchema(patchRes, "WebhookSubscriptionResponse");

        const persisted = patchRes.data.subscription.eventTypes;
        // Expanded well beyond the original subset...
        expect(persisted.length).toBeGreaterThan(subset.length);
        // ...to exactly the subscribable set
        expect([...persisted].sort()).toEqual([...SUBSCRIBABLE_EVENT_TYPES].sort());
      },
      getTimeout("api"),
    );

    it(
      "should leave eventTypes unchanged when PATCH omits eventTypes",
      async () => {
        const subset = ["customer.created", "customer.active"];
        const createRes = await apiClient.post(
          endpoints.webhooks.subscriptions,
          { url: uniqueUrl("patch-omit"), enabled: true, eventTypes: subset },
          { authenticated: true },
        );
        assertSuccessWithSchema(createRes, "WebhookSubscriptionResponse", 201);
        const id = createRes.data.subscription.id;
        created.push(id);

        // Update an unrelated field — eventTypes omitted → partial update, no change
        const patchRes = await apiClient.patch(
          endpoints.webhooks.subscription(id),
          { enabled: false },
          { authenticated: true },
        );
        assertSuccessWithSchema(patchRes, "WebhookSubscriptionResponse");

        expect(patchRes.data.subscription.enabled).toBe(false);
        expect([...patchRes.data.subscription.eventTypes].sort()).toEqual(
          [...subset].sort(),
        );
      },
      getTimeout("api"),
    );
  });
});
