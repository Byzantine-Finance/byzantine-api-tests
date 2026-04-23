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
import { generateUniqueEmail } from "../../utils/test-helpers.js";
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
  // Use CI entity passkey account when available (has registered passkey for signing)
  const testAccountId =
    process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID ||
    TEST_DATA.accounts.testEntityAccountId;
  const inviterUserId =
    process.env.CI_ENTITY_PASSKEY_ROOT_USER_ID ||
    TEST_DATA.accounts.entityRootUserId;

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
                : generateUniqueEmail(user.userEmail),
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
