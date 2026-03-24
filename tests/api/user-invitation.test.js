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
import { generateUniqueEmail } from "../../utils/test-helpers.js";
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
  // Use CI entity passkey account when available (has registered passkey for signing)
  const testAccountId = process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID || TEST_DATA.accounts.testEntityAccountId;
  const inviterUserId = process.env.CI_ENTITY_PASSKEY_ROOT_USER_ID || TEST_DATA.accounts.entityRootUserId;

  const describePayloadTest = TEST_SUITE_FLAGS.runPayloadTest
    ? describe
    : describe.skip;

  describePayloadTest("POST /v1/query/get-invite-users-payload-passkey", () => {
    it(
      "should generate payload for multiple users and save it",
      async () => {
        // Generate unique emails for each user to avoid conflicts
        const newUsersWithUniqueEmails = inviteUsersPasskeyRequest.newUsers.map(
          (user) => ({
            ...user,
            userEmail: generateUniqueEmail(user.userEmail),
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
          console.log(`   ${index + 1}. ${user.userName} (${user.userEmail})`);
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
          expect(invitedUser.userName).toBeDefined();
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
});
