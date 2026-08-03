/**
 * Webhook Deliveries API Tests, what are tested:
 * - GET  /v1/webhooks/deliveries                         (list delivery history)
 * - POST /v1/webhooks/deliveries/{id}/retry              (retry a delivery)
 * - Payload-shape validation of any delivered customer/transaction lifecycle
 *   event against WebhookLifecycleEventPayload (no-op until events flow).
 *
 * Read-only listing is always run (gated by enableWebhookTests).
 * Retry additionally requires enableWriteTests.
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../../config/test.config.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
} from "../../../utils/api-assertions.js";
import { getSchema } from "../../../utils/schemas.js";

// A well-formed UUID that should not correspond to any real delivery
const NONEXISTENT_DELIVERY_ID = "00000000-0000-4000-8000-000000000000";

// The set of public outbound event names, sourced from the generated enum so this
// stays in lockstep with the OpenAPI spec.
const WEBHOOK_EVENT_TYPES = new Set(getSchema("WebhookEventType")?.enum ?? []);

const isLifecycleEvent = (eventType) =>
  typeof eventType === "string" &&
  (eventType.startsWith("customer.") || eventType.startsWith("transaction."));

// Server-side paging defaults for GET /v1/webhooks/deliveries.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

/**
 * The delivery list is a page envelope: alongside `deliveries` it reports
 * `limit`, `offset`, `hasMore` and `attemptsIncluded`.
 */
function assertDeliveryPage(response, { limit, offset, attemptsIncluded } = {}) {
  assertSuccessWithSchema(response, "ListWebhookDeliveriesResponse");
  const page = response.data;

  expect(page.deliveries).toBeInstanceOf(Array);
  expect(typeof page.hasMore).toBe("boolean");
  expect(typeof page.attemptsIncluded).toBe("boolean");
  expect(page.limit).toBe(limit ?? DEFAULT_LIMIT);
  expect(page.offset).toBe(offset ?? 0);
  expect(page.deliveries.length).toBeLessThanOrEqual(page.limit);

  if (attemptsIncluded !== undefined) {
    expect(page.attemptsIncluded).toBe(attemptsIncluded);
  }
  // `attempts` is only populated when the page says attempts were included
  for (const d of page.deliveries) {
    if (page.attemptsIncluded) expect(d.attempts).toBeInstanceOf(Array);
  }
  return page;
}

const describeWebhooks = FEATURE_FLAGS.enableWebhookTests
  ? describe
  : describe.skip;

const describeWrite = FEATURE_FLAGS.enableWebhookTests && FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeWebhooks("Webhook Deliveries API", () => {
  describe("GET /v1/webhooks/deliveries", () => {
    it(
      "should list webhook delivery history",
      async () => {
        const response = await apiClient.get(endpoints.webhooks.deliveries, {
          authenticated: true,
        });
        // Defaults: limit 100, offset 0, attempts included for back-compat
        const page = assertDeliveryPage(response, { attemptsIncluded: true });
        console.log(
          `✅ Found ${page.deliveries.length} webhook delivery/deliveries (hasMore=${page.hasMore})`,
        );

        // Spot-check the nested shape when history exists
        if (page.deliveries.length > 0) {
          const first = page.deliveries[0];
          assertValidUuid(first.delivery.id);
          assertValidUuid(first.event.id);
          expect(first.attempts).toBeInstanceOf(Array);
        }
      },
      getTimeout("api"),
    );

    it(
      "should page delivery history with limit and offset",
      async () => {
        const firstPage = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({ limit: 1 }),
          { authenticated: true },
        );
        const first = assertDeliveryPage(firstPage, { limit: 1 });

        if (first.deliveries.length === 0) {
          console.log("ℹ️  No delivery history to page through — skipping");
          return;
        }

        const secondPage = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({ limit: 1, offset: 1 }),
          { authenticated: true },
        );
        const second = assertDeliveryPage(secondPage, { limit: 1, offset: 1 });

        // With more than one delivery on record the two pages must differ
        if (first.hasMore) {
          expect(second.deliveries.length).toBe(1);
          expect(second.deliveries[0].delivery.id).not.toBe(
            first.deliveries[0].delivery.id,
          );
        }
        console.log(
          `✅ Paged deliveries: offset 0 and offset 1 return distinct records`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should omit attempt records when includeAttempts=false",
      async () => {
        const response = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            limit: 5,
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        const page = assertDeliveryPage(response, {
          limit: 5,
          attemptsIncluded: false,
        });
        expect(page.attemptsIncluded).toBe(false);
        console.log(
          `✅ includeAttempts=false honoured (${page.deliveries.length} delivery/deliveries, attemptsIncluded=false)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should cap limit at the documented maximum",
      async () => {
        const response = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({ limit: 1000 }),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "ListWebhookDeliveriesResponse");
        // Over-large limits are clamped rather than rejected
        expect(response.data.limit).toBeLessThanOrEqual(MAX_LIMIT);
        console.log(`✅ limit=1000 clamped to ${response.data.limit}`);
      },
      getTimeout("api"),
    );

    it(
      "should filter delivery history by eventType",
      async () => {
        // Pick an event type that actually appears in history
        const all = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            limit: MAX_LIMIT,
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        assertSuccessWithSchema(all, "ListWebhookDeliveriesResponse");

        const sample = all.data.deliveries[0];
        if (!sample) {
          console.log("ℹ️  No delivery history to filter — skipping");
          return;
        }
        const eventType = sample.event.eventType;

        const filtered = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            eventType,
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        const page = assertDeliveryPage(filtered, { attemptsIncluded: false });

        expect(page.deliveries.length).toBeGreaterThan(0);
        for (const d of page.deliveries) {
          expect(d.event.eventType).toBe(eventType);
        }
        console.log(
          `✅ eventType=${eventType} filter returned ${page.deliveries.length} matching delivery/deliveries`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should filter delivery history by subscriptionId",
      async () => {
        const all = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            limit: MAX_LIMIT,
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        assertSuccessWithSchema(all, "ListWebhookDeliveriesResponse");

        const sample = all.data.deliveries.find(
          (d) => d.delivery?.subscriptionId,
        );
        if (!sample) {
          console.log("ℹ️  No delivery carries a subscriptionId — skipping");
          return;
        }
        const subscriptionId = sample.delivery.subscriptionId;

        const filtered = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            subscriptionId,
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        const page = assertDeliveryPage(filtered, { attemptsIncluded: false });

        expect(page.deliveries.length).toBeGreaterThan(0);
        for (const d of page.deliveries) {
          expect(d.delivery.subscriptionId).toBe(subscriptionId);
        }
        console.log(
          `✅ subscriptionId filter returned ${page.deliveries.length} matching delivery/deliveries`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should return an empty page for a filter that matches nothing",
      async () => {
        const response = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            eventId: NONEXISTENT_DELIVERY_ID,
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        const page = assertDeliveryPage(response, { attemptsIncluded: false });
        expect(page.deliveries).toHaveLength(0);
        expect(page.hasMore).toBe(false);
      },
      getTimeout("api"),
    );

    it(
      "should expose well-formed lifecycle event payloads when any exist",
      async () => {
        const response = await apiClient.get(endpoints.webhooks.deliveries, {
          authenticated: true,
        });
        assertSuccessWithSchema(response, "ListWebhookDeliveriesResponse");

        const lifecycleDeliveries = response.data.deliveries.filter((d) =>
          isLifecycleEvent(d.event?.eventType),
        );

        if (lifecycleDeliveries.length === 0) {
          // Expected on dev today — customer.*/transaction.* events only flow once
          // an applicant is driven through KYC. See webhook-lifecycle-events.test.js.
          console.log(
            "ℹ️  No customer.*/transaction.* deliveries in history — skipping payload-shape checks",
          );
          return;
        }

        for (const { event } of lifecycleDeliveries) {
          // eventType must be a known public event name
          expect(WEBHOOK_EVENT_TYPES.has(event.eventType)).toBe(true);
          // ...and the payload must match the stable public contract
          assertSchema(event.payload, "WebhookLifecycleEventPayload");
          expect(event.payload.eventType).toBe(event.eventType);
        }
        console.log(
          `✅ Validated ${lifecycleDeliveries.length} lifecycle event payload(s) against WebhookLifecycleEventPayload`,
        );
      },
      getTimeout("api"),
    );
  });

  describeWrite("POST /v1/webhooks/deliveries/{id}/retry", () => {
    // Only `failed` deliveries are retryable. succeeded/pending are rejected, and
    // so is `terminal_failed` — a terminal delivery has exhausted its attempts and
    // the API answers 400 "cannot be manually retried" (re-probed 2026-07-27).
    // These tests pick a delivery in the relevant state, or skip when history has
    // none of that kind.
    const RETRYABLE = new Set(["failed"]);

    it(
      "should retry a previously-failed delivery when one exists",
      async () => {
        const list = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            status: "failed",
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        assertSuccessWithSchema(list, "ListWebhookDeliveriesResponse");

        const failed = list.data.deliveries.find((d) =>
          RETRYABLE.has(d.delivery.status),
        );
        if (!failed) {
          console.log("ℹ️  No failed deliveries to retry — skipping");
          return;
        }

        const response = await apiClient.post(
          endpoints.webhooks.retryDelivery(failed.delivery.id),
          undefined,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "TestWebhookDeliveryResponse");
        assertValidUuid(response.data.event.id);
        assertValidUuid(response.data.delivery.id);
        console.log(`✅ Retried webhook delivery ${failed.delivery.id}`);
      },
      getTimeout("api"),
    );

    it(
      "should reject retrying a terminal_failed delivery",
      async () => {
        const list = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            status: "terminal_failed",
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        assertSuccessWithSchema(list, "ListWebhookDeliveriesResponse");

        const terminal = list.data.deliveries[0];
        if (!terminal) {
          console.log("ℹ️  No terminal_failed deliveries to probe — skipping");
          return;
        }

        const response = await apiClient.post(
          endpoints.webhooks.retryDelivery(terminal.delivery.id),
          undefined,
          { authenticated: true },
        );
        // A terminal delivery has exhausted its attempts and is not retryable.
        assertError(response, 400);
        console.log(
          `✅ Retry of terminal_failed delivery ${terminal.delivery.id} rejected with 400`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject retrying an already-succeeded delivery",
      async () => {
        const list = await apiClient.get(
          endpoints.webhooks.deliveriesQuery({
            status: "succeeded",
            includeAttempts: false,
          }),
          { authenticated: true },
        );
        assertSuccessWithSchema(list, "ListWebhookDeliveriesResponse");

        const succeeded = list.data.deliveries.find(
          (d) => d.delivery.status === "succeeded",
        );
        if (!succeeded) {
          console.log("ℹ️  No succeeded deliveries to probe — skipping");
          return;
        }

        const response = await apiClient.post(
          endpoints.webhooks.retryDelivery(succeeded.delivery.id),
          undefined,
          { authenticated: true },
        );
        // A succeeded delivery is terminal and cannot be manually retried.
        assertError(response, 400);
      },
      getTimeout("api"),
    );

    it(
      "should return 404 when retrying a non-existent delivery",
      async () => {
        const response = await apiClient.post(
          endpoints.webhooks.retryDelivery(NONEXISTENT_DELIVERY_ID),
          undefined,
          { authenticated: true },
        );
        assertError(response, 404);
      },
      getTimeout("api"),
    );
  });
});
