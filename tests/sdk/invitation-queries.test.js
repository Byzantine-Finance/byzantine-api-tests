/**
 * Invitation Query SDK Tests
 * - getInvitationsByAccountId
 * - getInvitationsByEmail
 *
 * Note: These tests use authenticated endpoints
 * Enable with: ENABLE_AUTH_TESTS=true
 *
 * These tests query invitations created by the user-invitation.test.js suite.
 * Run user-invitation tests first to create invitations, then run these tests.
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertValidUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";

// Skip if auth tests are disabled
const describeInvitationQueries = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeInvitationQueries("Invitation Query SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testEntityAccountId = TEST_DATA.accounts.testEntityAccountId;

  // Shared variable to store account invitations response for reuse
  let accountInvitationsResponse = null;

  describe("getInvitationsByAccountId()", () => {
    it(
      "should get all invitations for a user account",
      async () => {
        const sdkResponse = await client.api.getInvitationsByAccountId(
          testAccountId,
          DUMMY_AUTH,
        );

        // Store response for reuse in other tests
        accountInvitationsResponse = sdkResponse;

        assertSuccessWithSchema(sdkResponse, "GetInvitationsResponse");
        expect(sdkResponse.data.invitations).toBeInstanceOf(Array);

        // Verify invitation structure if invitations exist
        if (sdkResponse.data.invitations.length > 0) {
          const invitation = sdkResponse.data.invitations[0];
          assertSchema(invitation, "GetInvitationResponse");

          // Verify required fields
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
          expect(invitation.status).toMatch(
            /^(pending|accepted|rejected|cancelled)$/,
          );
          expect(invitation.created_at).toBeDefined();
          expect(invitation.updated_at).toBeDefined();

          console.log(
            `✅ Found ${sdkResponse.data.invitations.length} invitation(s) for account ${testAccountId}`,
          );
        } else {
          console.log(
            `ℹ️  No invitations found for account ${testAccountId}`,
          );
        }
      },
      getTimeout("api"),
    );

    it(
      "should get invitations for entity account",
      async () => {
        if (!testEntityAccountId) {
          console.warn(
            "⚠️  Skipping test - no testEntityAccountId in test data",
          );
          return;
        }

        const sdkResponse = await client.api.getInvitationsByAccountId(
          testEntityAccountId,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "GetInvitationsResponse");
        expect(sdkResponse.data.invitations).toBeInstanceOf(Array);

        console.log(
          `✅ Found ${sdkResponse.data.invitations.length} invitation(s) for entity account ${testEntityAccountId}`,
        );
      },
      getTimeout("api"),
    );
  });

  describe("getInvitationsByEmail()", () => {
    it(
      "should get all invitations for an email address",
      async () => {
        // Reuse the response from the first test
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

        // Extract email from first invitation
        const testEmail =
          accountInvitationsResponse.data.invitations[0].user_email;
        console.log(`📧 Using email from previous response: ${testEmail}`);

        const sdkResponse = await client.api.getInvitationsByEmail(
          testEmail,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "GetInvitationsResponse");
        expect(sdkResponse.data.invitations).toBeInstanceOf(Array);

        // Verify invitation structure
        if (sdkResponse.data.invitations.length > 0) {
          const invitation = sdkResponse.data.invitations[0];
          assertSchema(invitation, "GetInvitationResponse");

          // Verify user_email matches query
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
});
