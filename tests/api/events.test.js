/**
 * Event History API Tests, what are tested:
 * - GET /v1/query/events                          (list persisted lifecycle events)
 *   · cursor paging, limit bounds
 *   · accountId / userId / transactionId / eventType / createdAfter / createdBefore filters
 *   · rejected inputs (bad cursor, out-of-range limit, unknown/non-listable event type)
 *
 * This is the pull-based counterpart to webhooks: every event that would be
 * delivered to a subscription is persisted here with the same public payload
 * (WebhookLifecycleEventPayload) plus a `createdAt`, newest first.
 *
 * Read-only, so gated only by enableEventsTests (on by default).
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertValidDateTime,
} from "../../utils/api-assertions.js";
import { getSchema } from "../../utils/schemas.js";

// A well-formed UUID that should not match any real account/user/transaction
const NONEXISTENT_ID = "00000000-0000-4000-8000-000000000000";

// Server-side paging bounds for GET /v1/query/events. Unlike the deliveries
// endpoint (which clamps), an out-of-range limit here is rejected with 400.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

// Public event names, sourced from the generated enum so this stays in lockstep
// with the OpenAPI spec.
const WEBHOOK_EVENT_TYPES = new Set(getSchema("WebhookEventType")?.enum ?? []);

/**
 * Validate a page of events: envelope shape, per-item schema, and newest-first
 * ordering. Returns the page for further assertions.
 */
function assertEventPage(response, { limit } = {}) {
  assertSuccessWithSchema(response, "ListEventsResponse");
  const page = response.data;

  expect(page.events).toBeInstanceOf(Array);
  expect(page.events.length).toBeLessThanOrEqual(limit ?? DEFAULT_LIMIT);
  // `nextCursor` is an opaque string when another page may exist, else null
  if (page.nextCursor != null) expect(typeof page.nextCursor).toBe("string");

  for (const event of page.events) {
    // EventHistoryItem = WebhookLifecycleEventPayload + createdAt
    assertSchema(event, "EventHistoryItem");
    assertValidUuid(event.id);
    assertValidUuid(event.integratorId);
    assertValidDateTime(event.createdAt);
    assertValidDateTime(event.occurredAt);
    expect(WEBHOOK_EVENT_TYPES.has(event.eventType)).toBe(true);
    // webhook.test is a manual delivery probe, not a lifecycle event — it is
    // never persisted here (and is rejected as an eventType filter).
    expect(event.eventType).not.toBe("webhook.test");
  }

  // Newest first, ordered by database creation time
  const createdAts = page.events.map((e) => Date.parse(e.createdAt));
  for (let i = 1; i < createdAts.length; i++) {
    expect(createdAts[i]).toBeLessThanOrEqual(createdAts[i - 1]);
  }

  return page;
}

const describeEvents = FEATURE_FLAGS.enableEventsTests ? describe : describe.skip;

describeEvents("Event History API", () => {
  describe("GET /v1/query/events", () => {
    it(
      "should list persisted lifecycle events newest first",
      async () => {
        const response = await apiClient.get(endpoints.events.list(), {
          authenticated: true,
        });
        const page = assertEventPage(response);
        console.log(
          `✅ Found ${page.events.length} event(s) (nextCursor=${page.nextCursor ? "set" : "null"})`,
        );

        if (page.events.length === 0) {
          console.log("ℹ️  No event history yet — filter checks will no-op");
        }
      },
      getTimeout("api"),
    );

    it(
      "should page through history with an opaque cursor",
      async () => {
        const firstPage = await apiClient.get(
          endpoints.events.list({ limit: 2 }),
          { authenticated: true },
        );
        const first = assertEventPage(firstPage, { limit: 2 });

        if (!first.nextCursor) {
          console.log("ℹ️  Only one page of events — skipping cursor paging");
          return;
        }

        const secondPage = await apiClient.get(
          endpoints.events.list({ limit: 2, cursor: first.nextCursor }),
          { authenticated: true },
        );
        const second = assertEventPage(secondPage, { limit: 2 });

        // A cursor page must not repeat rows from the page it came from
        const firstIds = new Set(first.events.map((e) => e.id));
        for (const event of second.events) {
          expect(firstIds.has(event.id)).toBe(false);
        }
        // ...and it continues strictly backwards in time
        if (second.events.length > 0) {
          expect(Date.parse(second.events[0].createdAt)).toBeLessThanOrEqual(
            Date.parse(first.events.at(-1).createdAt),
          );
        }
        console.log(
          `✅ Cursor paging returned ${second.events.length} further, non-overlapping event(s)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should honour the page size limit",
      async () => {
        const response = await apiClient.get(endpoints.events.list({ limit: 1 }), {
          authenticated: true,
        });
        const page = assertEventPage(response, { limit: 1 });
        expect(page.events.length).toBeLessThanOrEqual(1);

        const maxPage = await apiClient.get(
          endpoints.events.list({ limit: MAX_LIMIT }),
          { authenticated: true },
        );
        assertEventPage(maxPage, { limit: MAX_LIMIT });
      },
      getTimeout("api"),
    );

    it(
      "should filter by accountId and userId",
      async () => {
        const all = await apiClient.get(
          endpoints.events.list({ limit: MAX_LIMIT }),
          { authenticated: true },
        );
        assertSuccessWithSchema(all, "ListEventsResponse");

        const sample = all.data.events.find((e) => e.accountId);
        if (!sample) {
          console.log("ℹ️  No event carries an accountId — skipping");
          return;
        }

        const byAccount = await apiClient.get(
          endpoints.events.list({ accountId: sample.accountId }),
          { authenticated: true },
        );
        const accountPage = assertEventPage(byAccount);
        expect(accountPage.events.length).toBeGreaterThan(0);
        for (const event of accountPage.events) {
          expect(event.accountId).toBe(sample.accountId);
        }

        if (sample.userId) {
          const byUser = await apiClient.get(
            endpoints.events.list({ userId: sample.userId }),
            { authenticated: true },
          );
          const userPage = assertEventPage(byUser);
          expect(userPage.events.length).toBeGreaterThan(0);
          for (const event of userPage.events) {
            expect(event.userId).toBe(sample.userId);
          }
        }
        console.log(
          `✅ accountId filter returned ${accountPage.events.length} matching event(s)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should filter by eventType",
      async () => {
        const all = await apiClient.get(
          endpoints.events.list({ limit: MAX_LIMIT }),
          { authenticated: true },
        );
        assertSuccessWithSchema(all, "ListEventsResponse");

        const sample = all.data.events[0];
        if (!sample) {
          console.log("ℹ️  No event history to filter — skipping");
          return;
        }

        const filtered = await apiClient.get(
          endpoints.events.list({ eventType: sample.eventType, limit: MAX_LIMIT }),
          { authenticated: true },
        );
        const page = assertEventPage(filtered, { limit: MAX_LIMIT });
        expect(page.events.length).toBeGreaterThan(0);
        for (const event of page.events) {
          expect(event.eventType).toBe(sample.eventType);
        }
        console.log(
          `✅ eventType=${sample.eventType} filter returned ${page.events.length} matching event(s)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should filter by a createdAfter/createdBefore window",
      async () => {
        // Both bounds are exclusive, so "after now" can never match anything
        const future = await apiClient.get(
          endpoints.events.list({ createdAfter: new Date().toISOString() }),
          { authenticated: true },
        );
        const futurePage = assertEventPage(future);
        expect(futurePage.events).toHaveLength(0);
        expect(futurePage.nextCursor).toBeNull();

        const all = await apiClient.get(
          endpoints.events.list({ limit: MAX_LIMIT }),
          { authenticated: true },
        );
        assertSuccessWithSchema(all, "ListEventsResponse");
        const newest = all.data.events[0];
        if (!newest) {
          console.log("ℹ️  No event history to window — skipping");
          return;
        }

        // A window ending just before the newest event must exclude it
        const before = await apiClient.get(
          endpoints.events.list({ createdBefore: newest.createdAt }),
          { authenticated: true },
        );
        const beforePage = assertEventPage(before);
        expect(beforePage.events.some((e) => e.id === newest.id)).toBe(false);
        for (const event of beforePage.events) {
          expect(Date.parse(event.createdAt)).toBeLessThan(
            Date.parse(newest.createdAt),
          );
        }
        console.log(
          `✅ createdBefore=${newest.createdAt} excluded the newest event (${beforePage.events.length} older event(s))`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should return an empty page for a filter that matches nothing",
      async () => {
        const response = await apiClient.get(
          endpoints.events.list({ transactionId: NONEXISTENT_ID }),
          { authenticated: true },
        );
        const page = assertEventPage(response);
        expect(page.events).toHaveLength(0);
        expect(page.nextCursor).toBeNull();
      },
      getTimeout("api"),
    );

    it(
      "should reject a limit outside 1..250",
      async () => {
        for (const limit of [0, MAX_LIMIT + 1]) {
          const response = await apiClient.get(endpoints.events.list({ limit }), {
            authenticated: true,
          });
          // Out-of-range limits are rejected here, not clamped like on deliveries
          assertError(response, 400);
          expect(response.status).toBe(400);
        }
        console.log("✅ limit=0 and limit=251 both rejected with 400");
      },
      getTimeout("api"),
    );

    it(
      "should reject a malformed cursor",
      async () => {
        const response = await apiClient.get(
          endpoints.events.list({ cursor: "not-a-real-cursor" }),
          { authenticated: true },
        );
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should reject an unknown event type",
      async () => {
        const response = await apiClient.get(
          endpoints.events.list({ eventType: "customer.bogus" }),
          { authenticated: true },
        );
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should reject webhook.test as an event type filter",
      async () => {
        // webhook.test is a valid WebhookEventType for manual deliveries but is
        // not a lifecycle event, so it is never listed here.
        const response = await apiClient.get(
          endpoints.events.list({ eventType: "webhook.test" }),
          { authenticated: true },
        );
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should reject a malformed UUID filter",
      async () => {
        const response = await apiClient.get(
          endpoints.events.list({ accountId: "not-a-uuid" }),
          { authenticated: true },
        );
        assertError(response, 400, false);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should require integrator authentication",
      async () => {
        const response = await apiClient.get(endpoints.events.list());
        // Missing X-Pubkey is a malformed request, not an auth failure
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );
  });
});
