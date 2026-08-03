/**
 * User Invitation SDK Tests, what are tested:
 * - getInviteUsersPayloadPasskey() (get payload to sign)
 * - inviteUsers() (submit signed invitation with passkey auth)
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
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

// Import test data from fixtures
import inviteUsersPasskeyRequest from "../../fixtures/test-data/users/invite-users-passkey-request.json" assert { type: "json" };
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };
import { TEST_DATA } from "../../config/test.config.js";

// Skip if auth/write tests are disabled
const describeUserInvitation = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Flags to control which test suites to run
const TEST_SUITE_FLAGS = {
  runPayloadTest: FEATURE_FLAGS.invitePayload,
  runInviteUsersTest: FEATURE_FLAGS.inviteUsers,
};

describeUserInvitation("Byzantine User Invitation SDK", () => {
  const client = getSdkClient();
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

  // ── Invitation queries (run AFTER the invite submission above) ──
  // Declared after the invite describe so vitest's in-file ordering runs them
  // next. Gated only by the outer ENABLE_WRITE_TESTS flag so ad-hoc runs can
  // still query pre-existing invitations even with INVITE_USERS=false.
  describe("Invitation queries", () => {
    let accountInvitationsResponse = null;

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
            const invitation = sdkResponse.data.invitations[0];
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
            expect(invitation.status).toMatch(
              /^(pending|accepted|rejected|cancelled)$/,
            );
            expect(invitation.created_at).toBeDefined();
            expect(invitation.updated_at).toBeDefined();
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
            assertSchema(invitation, "GetInvitationResponse");
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
});
