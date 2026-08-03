/**
 * User Invitation API Tests, what are tested:
 * - POST /v1/query/get-invite-users-payload-passkey (get payload to sign)
 * - POST /v1/submit/invite-users (submit signed invitation with passkey auth)
 *
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import { maybeUniqueEmail } from "../../utils/test-helpers.js";
import { saveBodyToSign, saveInvitedUserData } from "../../utils/test-data-persistence.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";

// Import test data from fixtures
import inviteUsersPasskeyRequest from "../../fixtures/test-data/users/invite-users-passkey-request.json" assert { type: "json" };
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeUserInvitation = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Flags to control which test suites to run
// INVITE_PAYLOAD=true/false - Test getting payload to sign
// INVITE_USERS=true/false - Test submitting with passkey auth
const TEST_SUITE_FLAGS = {
  runPayloadTest: FEATURE_FLAGS.invitePayload,
  runInviteUsersTest: FEATURE_FLAGS.inviteUsers,
};

describeUserInvitation("Byzantine User Invitation API", () => {
  // Under ci-test.js, the orchestrator sets CI_TEST_ORCHESTRATED=true and the
  // CI entity passkey account (the one with a registered passkey for signing)
  // takes priority. Direct `npx vitest` runs fall back to the generated
  // TEST_DATA so local runs don't accidentally hit the CI account.
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const testAccountId = orchestrated
    ? process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID
    : process.env.CGP_ACCOUNT_ID || TEST_DATA.accounts.testEntityAccountId;
  const inviterUserId = orchestrated
    ? process.env.CI_ENTITY_PASSKEY_ROOT_USER_ID
    :  process.env.CGP_ROOT_USER_ID || TEST_DATA.accounts.entityRootUserId;

  const describePayloadTest = TEST_SUITE_FLAGS.runPayloadTest
    ? describe
    : describe.skip;

  describePayloadTest("POST /v1/query/get-invite-users-payload-passkey", () => {
    it(
      "should generate payload for multiple users and save it",
      async () => {
        // Use CI_INVITE_EMAIL if set (e.g., Mailslurp disposable inbox for automated OTP),
        // otherwise generate unique emails to avoid conflicts
        const ciInviteEmail = process.env.CI_INVITE_EMAIL;
        const newUsersWithUniqueEmails = inviteUsersPasskeyRequest.newUsers.map(
          (user, index) => ({
            ...user,
            userEmail: (ciInviteEmail && index === 0)
              ? ciInviteEmail
              : maybeUniqueEmail(user.userEmail),
          }),
        );

        const requestBody = {
          accountId: testAccountId,
          newUsers: newUsersWithUniqueEmails,
        };

        const response = await apiClient.post(
          endpoints.management.getInviteUsersPayload,
          requestBody,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "InviteUsersRequestResponse");

        // Validate the bodyToSign structure
        const bodyToSign = response.data.bodyToSign;
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

  describeInviteUsersTest("POST /v1/submit/invite-users", () => {
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

        const response = await apiClient.post(
          endpoints.management.inviteUsers,
          requestBody,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "InviteUsersResponse", 201);

        // Validate response structure
        assertValidUuid(response.data.accountId);
        expect(response.data.newUsers).toBeInstanceOf(Array);
        expect(response.data.invitedAt).toBeDefined();

        // Verify multiple users were invited
        expect(response.data.newUsers.length).toBeGreaterThan(0);
        console.log(
          `✅ Successfully invited ${response.data.newUsers.length} user(s)`,
        );

        // Verify each invited user details
        response.data.newUsers.forEach((invitedUser) => {
          assertValidUuid(invitedUser.userId);
          expect(invitedUser.firstName).toBeDefined();
          expect(invitedUser.lastName).toBeDefined();
          expect(invitedUser.userEmail).toBeDefined();
        });

        // Save first invited user for OTP authentication flow
        const firstUser = response.data.newUsers[0];
        saveInvitedUserData(
          response.data.accountId,
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

    describe("GET /v1/query/get-invitations-by-account-id", () => {
      it(
        "should get invitations for entity account",
        async () => {
          if (!testAccountId) {
            console.warn(
              "⚠️  Skipping test - no CI_ENTITY_PASSKEY_ACCOUNT_ID or testEntityAccountId available",
            );
            return;
          }

          const response = await apiClient.get(
            endpoints.invitations.getByAccountId(testAccountId),
            { authenticated: true },
          );

          // Store response for reuse by the getInvitationsByEmail test
          accountInvitationsResponse = response;

          assertSuccessWithSchema(response, "GetInvitationsResponse");
          expect(response.data.invitations).toBeInstanceOf(Array);

          if (response.data.invitations.length > 0) {
            const invitation = response.data.invitations[0];
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
            `✅ Found ${response.data.invitations.length} invitation(s) for entity account ${testAccountId}`,
          );
        },
        getTimeout("api"),
      );
    });

    describe("GET /v1/query/get-invitations-by-email", () => {
      it(
        "should get all invitations for an email address",
        async () => {
          if (
            !accountInvitationsResponse ||
            accountInvitationsResponse.status !== 200 ||
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

          const response = await apiClient.get(
            endpoints.invitations.getByEmail(testEmail),
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "GetInvitationsResponse");
          expect(response.data.invitations).toBeInstanceOf(Array);

          if (response.data.invitations.length > 0) {
            const invitation = response.data.invitations[0];
            assertSchema(invitation, "GetInvitationResponse");
            expect(invitation.user_email).toBe(testEmail);
            console.log(
              `✅ Found ${response.data.invitations.length} invitation(s) for email ${testEmail}`,
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
