/**
 * User Invitation SDK Tests, what are tested:
 * - getInviteUsersPayloadPasskey() (get payload to sign)
 * - inviteUsers() (submit signed invitation with passkey auth)
 * - getInvitationsByAccountId()
 * - getInvitationsByEmail()
 * - getAllInvitations() (integrator-wide, offset-paginated)
 *
 * Note: the invite flow uses authenticated endpoints and modifies data.
 * Enable with: ENABLE_AUTH_TESTS=true (write tests are on by default;
 * disable with ENABLE_WRITE_TESTS=false)
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 *
 * Flow:
 * 1. Call getInviteUsersPayloadPasskey() with simple user data
 * 2. Sign the bodyToSign with passkey (use web interface at tests/web/api-testing.html)
 * 3. Submit with signedBody + webAuthnStamp to inviteUsers()
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import { maybeUniqueEmail } from "../../utils/test-helpers.js";
import {
  saveBodyToSign,
  saveInvitedUserData,
} from "../../utils/test-data-persistence.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import { getSchema } from "../../utils/schemas.js";

// Import test data from fixtures
import inviteUsersPasskeyRequest from "../../fixtures/test-data/users/invite-users-passkey-request.json" assert { type: "json" };
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };
import { TEST_DATA } from "../../config/test.config.js";

// Skip if auth/write tests are disabled
const describeUserInvitation = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Invitation queries are reads, so they get their own flag
const describeInvitationQueries = FEATURE_FLAGS.enableInvitationQueries
  ? describe
  : describe.skip;

// Flags to control which test suites to run
const TEST_SUITE_FLAGS = {
  runPayloadTest: FEATURE_FLAGS.invitePayload,
  runInviteUsersTest: FEATURE_FLAGS.inviteUsers,
};

// Under ci-test.js, the orchestrator sets CI_TEST_ORCHESTRATED=true and the
// CI entity passkey account (the one with a registered passkey for signing)
// takes priority. Direct `npx vitest` runs fall back to the generated
// TEST_DATA so local runs don't accidentally hit the CI account.
const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
const testAccountId = orchestrated
  ? process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID ||
    TEST_DATA.accounts.testEntityAccountId
  : TEST_DATA.accounts.testEntityAccountId;
const inviterUserId = orchestrated
  ? process.env.CI_ENTITY_PASSKEY_ROOT_USER_ID ||
    TEST_DATA.accounts.entityRootUserId
  : TEST_DATA.accounts.entityRootUserId;


// Sourced from the generated enum so it stays in lockstep with the spec.
const INVITATION_STATUSES = new Set(getSchema("InvitationStatus")?.enum ?? []);

// Server-side paging window for get-all-invitations. Unlike GET /v1/query/events
// (which rejects an out-of-range limit with 400), this endpoint clamps into
// [MIN_LIMIT, MAX_LIMIT] and still answers 200.
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/** Field-by-field check of one GetInvitationResponse item. */
function assertInvitationShape(invitation) {
  assertSchema(invitation, "GetInvitationResponse");
  assertValidUuid(invitation.invitation_id);
  assertValidUuid(invitation.account_id);
  assertValidUuid(invitation.user_id);
  assertValidUuid(invitation.inviter_id);
  expect(invitation.account_name).toBeDefined();
  expect(invitation.first_name).toBeDefined();
  expect(invitation.last_name).toBeDefined();
  expect(invitation.user_email).toBeDefined();
  expect(invitation.inviter_first_name).toBeDefined();
  expect(invitation.inviter_last_name).toBeDefined();
  expect(INVITATION_STATUSES.has(invitation.status)).toBe(true);
  expect(Number.isNaN(Date.parse(invitation.created_at))).toBe(false);
  expect(Number.isNaN(Date.parse(invitation.updated_at))).toBe(false);
}

/**
 * Envelope checks shared by every get-all-invitations page: schema, the echoed
 * paging window, per-item shape and `updated_at` ordering. `order` defaults to
 * "desc" because that is what the endpoint does when the param is omitted.
 * Returns the page for further assertions.
 */
function assertInvitationPage(sdkResponse, { limit, offset, order = "desc" } = {}) {
  assertSuccessWithSchema(sdkResponse, "GetAllInvitationsResponse");
  const page = sdkResponse.data;

  expect(page.invitations).toBeInstanceOf(Array);
  expect(page.invitations.length).toBeLessThanOrEqual(page.limit);
  expect(page.total).toBeGreaterThanOrEqual(page.invitations.length);
  if (limit != null) expect(page.limit).toBe(limit);
  if (offset != null) expect(page.offset).toBe(offset);

  for (const invitation of page.invitations) assertInvitationShape(invitation);

  const updatedAts = page.invitations.map((i) => Date.parse(i.updated_at));
  for (let i = 1; i < updatedAts.length; i++) {
    if (order === "asc") {
      expect(updatedAts[i]).toBeGreaterThanOrEqual(updatedAts[i - 1]);
    } else {
      expect(updatedAts[i]).toBeLessThanOrEqual(updatedAts[i - 1]);
    }
  }

  return page;
}

describeUserInvitation("Byzantine User Invitation SDK", () => {
  const client = getSdkClient();

  const describePayloadTest = TEST_SUITE_FLAGS.runPayloadTest
    ? describe
    : describe.skip;

  describePayloadTest("getInviteUsersPayloadPasskey()", () => {
    it(
      "should generate payload for multiple users and save it",
      async () => {
        // Use CI_INVITE_EMAIL if set (e.g., Mailslurp disposable inbox for automated OTP),
        // otherwise generate unique emails to avoid conflicts
        const ciInviteEmail = process.env.CI_INVITE_EMAIL;
        const newUsersWithUniqueEmails = inviteUsersPasskeyRequest.newUsers.map(
          (user, index) => ({
            ...user,
            userEmail:
              ciInviteEmail && index === 0
                ? ciInviteEmail
                : maybeUniqueEmail(user.userEmail),
          }),
        );

        const requestBody = {
          accountId: testAccountId,
          newUsers: newUsersWithUniqueEmails,
        };

        const sdkResponse = await client.api.getInviteUsersPayloadPasskey(
          requestBody,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "InviteUsersRequestResponse");

        // Validate the bodyToSign structure
        const bodyToSign = sdkResponse.data.bodyToSign;
        assertSchema(bodyToSign, "CreateUsersRequest");

        // Verify multiple users in response
        const users = bodyToSign.parameters.users;
        expect(users.length).toBe(inviteUsersPasskeyRequest.newUsers.length);

        // Verify all users have unique emails
        const emails = users.map((u) => u.userEmail);
        const uniqueEmails = new Set(emails);
        expect(uniqueEmails.size).toBe(emails.length);

        // Save multi-user payload to generated-tx-passkey.json
        saveBodyToSign("inviteUsers", bodyToSign);

        console.log(
          `✅ Generated and saved payload for ${users.length} users:`,
        );
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (${user.userEmail})`);
        });
        console.log(
          `📝 Next step: Sign the bodyToSign with passkey to get webAuthnStamp`,
        );
      },
      getTimeout("api"),
    );
  });

  const describeInviteUsersTest = TEST_SUITE_FLAGS.runInviteUsersTest
    ? describe
    : describe.skip;

  describeInviteUsersTest("inviteUsers()", () => {
    it(
      "should invite multiple users at once with passkey authentication",
      async () => {
        // Use the bodyToSign saved from the payload test (generated-tx-passkey.json)
        const bodyToSign = txRequest.inviteUsers?.bodyToSign;
        const webAuthnStamp = txRequest.inviteUsers?.webAuthnStamp;

        // Submit with signed body, invitedBy, and webAuthnStamp
        const requestBody = {
          signedBody: bodyToSign,
          invitedBy: inviterUserId,
          webAuthnStamp: webAuthnStamp,
        };

        // Validate request schema (now using passkey flow)
        assertSchema(requestBody, "InviteUsersRequestBodyPasskey");

        const sdkResponse = await client.api.inviteUsers(
          requestBody,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "InviteUsersResponse");

        // Validate response structure
        assertValidUuid(sdkResponse.data.accountId);
        expect(sdkResponse.data.accountId).toBe(testAccountId);
        expect(sdkResponse.data.newUsers).toBeInstanceOf(Array);
        expect(sdkResponse.data.invitedAt).toBeDefined();

        // Verify multiple users were invited
        expect(sdkResponse.data.newUsers.length).toBeGreaterThan(0);
        console.log(
          `✅ Successfully invited ${sdkResponse.data.newUsers.length} user(s)`,
        );

        // Verify each invited user details
        sdkResponse.data.newUsers.forEach((invitedUser) => {
          assertValidUuid(invitedUser.userId);
          expect(invitedUser.firstName).toBeDefined();
          expect(invitedUser.lastName).toBeDefined();
          expect(invitedUser.userEmail).toBeDefined();
        });

        // Save first invited user for OTP authentication flow
        const firstUser = sdkResponse.data.newUsers[0];
        saveInvitedUserData(
          sdkResponse.data.accountId,
          firstUser.userId,
          firstUser.userEmail,
        );
      },
      getTimeout("api"),
    );
  });

});

// ── Invitation queries (run AFTER the invite submission above) ──
// Declared as a sibling of the write suite so a read-only run (or a production
// run, where writes are blocked) still exercises them.
describeInvitationQueries("Byzantine Invitation Queries SDK", () => {
  const client = getSdkClient();
  let accountInvitationsResponse = null;

  /** GET /v1/query/get-all-invitations with query params, via the SDK client. */
  const getAllInvitations = (query = {}) =>
    client.api.getAllInvitations(DUMMY_AUTH, query);

  describe("getInvitationsByAccountId()", () => {
    it(
      "should get invitations for entity account",
      async () => {
        if (!testAccountId) {
          console.warn(
            "⚠️  Skipping test - no CI_ENTITY_PASSKEY_ACCOUNT_ID or testEntityAccountId available",
          );
          return;
        }

        const sdkResponse = await client.api.getInvitationsByAccountId(
          testAccountId,
          DUMMY_AUTH,
        );

        // Store response for reuse by the getInvitationsByEmail test
        accountInvitationsResponse = sdkResponse;

        assertSuccessWithSchema(sdkResponse, "GetInvitationsResponse");
        expect(sdkResponse.data.invitations).toBeInstanceOf(Array);

        if (sdkResponse.data.invitations.length > 0) {
          assertInvitationShape(sdkResponse.data.invitations[0]);
        }

        console.log(
          `✅ Found ${sdkResponse.data.invitations.length} invitation(s) for entity account ${testAccountId}`,
        );
      },
      getTimeout("api"),
    );
  });

  describe("getInvitationsByEmail()", () => {
    it(
      "should get all invitations for an email address",
      async () => {
        if (
          !accountInvitationsResponse ||
          accountInvitationsResponse.error ||
          !accountInvitationsResponse.data ||
          accountInvitationsResponse.data.invitations.length === 0
        ) {
          console.warn(
            "⚠️  Skipping test - no invitations found from previous test to extract email",
          );
          return;
        }

        const testEmail =
          accountInvitationsResponse.data.invitations[0].user_email;
        console.log(`📧 Using email from previous response: ${testEmail}`);

        const sdkResponse = await client.api.getInvitationsByEmail(
          testEmail,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "GetInvitationsResponse");
        expect(sdkResponse.data.invitations).toBeInstanceOf(Array);

        if (sdkResponse.data.invitations.length > 0) {
          const invitation = sdkResponse.data.invitations[0];
          assertInvitationShape(invitation);
          expect(invitation.user_email).toBe(testEmail);
          console.log(
            `✅ Found ${sdkResponse.data.invitations.length} invitation(s) for email ${testEmail}`,
          );
        } else {
          console.log(`ℹ️  No invitations found for email ${testEmail}`);
        }
      },
      getTimeout("api"),
    );
  });

  // Integrator-wide listing: every invitation the integrator has issued, across
  // all of its accounts, newest `updated_at` first.
  describe("getAllInvitations()", () => {
    it(
      "should list invitations across every account with default paging",
      async () => {
        const sdkResponse = await getAllInvitations();

        const page = assertInvitationPage(sdkResponse, {
          limit: DEFAULT_LIMIT,
          offset: 0,
        });

        console.log(
          `✅ ${page.invitations.length} of ${page.total} invitation(s) on the first page ` +
            `(limit ${page.limit}, offset ${page.offset})`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should clamp an out-of-range limit instead of rejecting it",
      async () => {
        // Above the maximum: clamped down, not 400. This is the opposite of
        // GET /v1/query/events, which rejects a limit over its own maximum.
        const tooLarge = await getAllInvitations({ limit: MAX_LIMIT + 1 });
        assertInvitationPage(tooLarge, { limit: MAX_LIMIT, offset: 0 });

        // At or below the minimum: clamped up to a one-item page
        for (const limit of [0, -1]) {
          const tooSmall = await getAllInvitations({ limit });
          assertInvitationPage(tooSmall, { limit: MIN_LIMIT, offset: 0 });
        }

        // A negative offset is clamped to the first page too
        const negativeOffset = await getAllInvitations({ offset: -1 });
        assertInvitationPage(negativeOffset, { offset: 0 });

        console.log(
          `✅ limit clamped into [${MIN_LIMIT}, ${MAX_LIMIT}] and negative offset clamped to 0`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should walk pages by offset without changing the total",
      async () => {
        const first = await getAllInvitations({ limit: 1 });
        const firstPage = assertInvitationPage(first, { limit: 1, offset: 0 });

        if (firstPage.total < 2) {
          console.log(
            `ℹ️  Only ${firstPage.total} invitation(s) for this integrator — skipping paging`,
          );
          return;
        }

        const second = await getAllInvitations({ limit: 1, offset: 1 });
        const secondPage = assertInvitationPage(second, { limit: 1, offset: 1 });

        // `total` describes the whole collection, so it must not move with the window
        expect(secondPage.total).toBe(firstPage.total);
        expect(secondPage.invitations[0].invitation_id).not.toBe(
          firstPage.invitations[0].invitation_id,
        );

        // Past the end: an empty page, still reporting the full total
        const beyond = await getAllInvitations({ offset: firstPage.total });
        const emptyPage = assertInvitationPage(beyond, {
          offset: firstPage.total,
        });
        expect(emptyPage.invitations).toHaveLength(0);
        expect(emptyPage.total).toBe(firstPage.total);

        console.log(
          `✅ Paged through ${firstPage.total} invitation(s); offset ${firstPage.total} returns an empty page`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should sort on updated_at in the requested direction",
      async () => {
        const limit = 5;

        const descending = await getAllInvitations({ limit, order: "desc" });
        const descPage = assertInvitationPage(descending, {
          limit,
          order: "desc",
        });

        const ascending = await getAllInvitations({ limit, order: "asc" });
        const ascPage = assertInvitationPage(ascending, { limit, order: "asc" });

        // Both directions see the same collection, so with more invitations than
        // fit on one page the two pages must start at opposite ends.
        if (descPage.total > limit && descPage.invitations.length > 0) {
          expect(ascPage.invitations[0].invitation_id).not.toBe(
            descPage.invitations[0].invitation_id,
          );
        }

        console.log(
          `✅ order=desc/asc both honoured over updated_at (${descPage.total} invitation(s) total)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should include the invitations reported for a single account",
      async () => {
        if (
          !accountInvitationsResponse ||
          accountInvitationsResponse.error ||
          !accountInvitationsResponse.data ||
          accountInvitationsResponse.data.invitations.length === 0
        ) {
          console.warn(
            "⚠️  Skipping test - no per-account invitations to cross-check against",
          );
          return;
        }

        const sdkResponse = await getAllInvitations({ limit: MAX_LIMIT });
        const page = assertInvitationPage(sdkResponse, { limit: MAX_LIMIT });

        if (page.total > MAX_LIMIT) {
          console.log(
            `ℹ️  ${page.total} invitation(s) exceed one ${MAX_LIMIT}-item page — skipping the superset check`,
          );
          return;
        }

        // One page holds everything, so the integrator-wide listing must be a
        // superset of what the per-account query returned.
        const allIds = new Set(page.invitations.map((i) => i.invitation_id));
        for (const invitation of accountInvitationsResponse.data.invitations) {
          expect(
            allIds.has(invitation.invitation_id),
            `invitation ${invitation.invitation_id} from account ${testAccountId} is missing from get-all-invitations`,
          ).toBe(true);
        }

        console.log(
          `✅ All ${accountInvitationsResponse.data.invitations.length} invitation(s) for account ${testAccountId} ` +
            `appear in the integrator-wide listing of ${page.total}`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject malformed paging params",
      async () => {
        // `order` is a SortOrder enum, `limit` an integer — both are rejected at
        // query-string deserialization, before any clamping happens.
        const badOrder = await getAllInvitations({ order: "sideways" });
        assertError(badOrder);
        expect(badOrder.response.status).toBe(400);

        const badLimit = await getAllInvitations({ limit: "abc" });
        assertError(badLimit);
        expect(badLimit.response.status).toBe(400);

        console.log("✅ Malformed order and limit both rejected with 400");
      },
      getTimeout("api"),
    );
  });
});
