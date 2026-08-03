/**
 * Event History SDK Tests, what are tested (via @byzantine/integrator-sdk):
 * - GET /v1/query/events   (list persisted lifecycle events, cursor-paginated)
 *
 * Mirrors tests/api/events.test.js but drives the request through the SDK
 * (response shape: { data, error, response }) instead of raw HTTP.
 *
 * NOTE: the bundled SDK (1.11.0) has no `listEvents()` method yet, so this uses
 * the SDK's typed escape hatch `client.api.client.GET(path, ...)`. That still
 * exercises everything the SDK owns for this endpoint — request building, query
 * serialization, the ECDSA auth middleware and response unwrapping. Swap the
 * calls for the named method once the SDK ships one.
 *
 * Read-only, so gated only by enableEventsTests (on by default).
 */

import { describe, it, expect } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
} from "../../utils/sdk-assertions.js";
import { getSchema } from "../../utils/schemas.js";

const EVENTS_PATH = "/v1/query/events";

// A well-formed UUID that should not match any real transaction
const NONEXISTENT_ID = "00000000-0000-4000-8000-000000000000";
const MAX_LIMIT = 250;

const WEBHOOK_EVENT_TYPES = new Set(getSchema("WebhookEventType")?.enum ?? []);

const describeEvents = FEATURE_FLAGS.enableEventsTests ? describe : describe.skip;

describeEvents("Event History SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  /** GET /v1/query/events with query params, via the SDK client. */
  const listEvents = (query = {}) =>
    client.api.client.GET(EVENTS_PATH, { params: { query } });

  /** Shared page assertions: envelope, per-item schema, newest-first ordering. */
  function assertEventPage(sdkResponse, { limit } = {}) {
    assertSuccessWithSchema(sdkResponse, "ListEventsResponse");
    const page = sdkResponse.data;

    expect(page.events).toBeInstanceOf(Array);
    if (limit) expect(page.events.length).toBeLessThanOrEqual(limit);

    for (const event of page.events) {
      assertSchema(event, "EventHistoryItem");
      assertValidUuid(event.id);
      expect(WEBHOOK_EVENT_TYPES.has(event.eventType)).toBe(true);
    }

    const createdAts = page.events.map((e) => Date.parse(e.createdAt));
    for (let i = 1; i < createdAts.length; i++) {
      expect(createdAts[i]).toBeLessThanOrEqual(createdAts[i - 1]);
    }

    return page;
  }

  describe("GET /v1/query/events", () => {
    it(
      "should list persisted lifecycle events newest first",
      async () => {
        const sdkResponse = await listEvents();
        const page = assertEventPage(sdkResponse);
        console.log(
          `✅ Found ${page.events.length} event(s) (nextCursor=${page.nextCursor ? "set" : "null"})`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should page through history with an opaque cursor",
      async () => {
        const firstResponse = await listEvents({ limit: 2 });
        const first = assertEventPage(firstResponse, { limit: 2 });

        if (!first.nextCursor) {
          console.log("ℹ️  Only one page of events — skipping cursor paging");
          return;
        }

        const secondResponse = await listEvents({
          limit: 2,
          cursor: first.nextCursor,
        });
        const second = assertEventPage(secondResponse, { limit: 2 });

        const firstIds = new Set(first.events.map((e) => e.id));
        for (const event of second.events) {
          expect(firstIds.has(event.id)).toBe(false);
        }
        console.log(
          `✅ Cursor paging returned ${second.events.length} further, non-overlapping event(s)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should filter by eventType and accountId",
      async () => {
        const all = await listEvents({ limit: MAX_LIMIT });
        assertSuccessWithSchema(all, "ListEventsResponse");

        const sample = all.data.events[0];
        if (!sample) {
          console.log("ℹ️  No event history to filter — skipping");
          return;
        }

        const byType = await listEvents({
          eventType: sample.eventType,
          limit: MAX_LIMIT,
        });
        const typePage = assertEventPage(byType, { limit: MAX_LIMIT });
        expect(typePage.events.length).toBeGreaterThan(0);
        for (const event of typePage.events) {
          expect(event.eventType).toBe(sample.eventType);
        }

        if (sample.accountId) {
          const byAccount = await listEvents({ accountId: sample.accountId });
          const accountPage = assertEventPage(byAccount);
          for (const event of accountPage.events) {
            expect(event.accountId).toBe(sample.accountId);
          }
        }
        console.log(
          `✅ eventType=${sample.eventType} filter returned ${typePage.events.length} matching event(s)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should return an empty page for a filter that matches nothing",
      async () => {
        const sdkResponse = await listEvents({ transactionId: NONEXISTENT_ID });
        const page = assertEventPage(sdkResponse);
        expect(page.events).toHaveLength(0);
        expect(page.nextCursor).toBeNull();
      },
      getTimeout("api"),
    );

    it(
      "should surface a rejected limit as an SDK error",
      async () => {
        // Out-of-range limits are rejected, not clamped
        const sdkResponse = await listEvents({ limit: MAX_LIMIT + 1 });
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should surface a rejected event type as an SDK error",
      async () => {
        // webhook.test is deliverable but is not a lifecycle event
        const sdkResponse = await listEvents({ eventType: "webhook.test" });
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should surface a malformed cursor as an SDK error",
      async () => {
        const sdkResponse = await listEvents({ cursor: "not-a-real-cursor" });
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );
  });
});
