/**
 * User Invitation API Tests, what are tested:
 * - query/get-invite-users-payload-passkey (get payload to sign)
 * - submit/invite-users (submit signed invitation with passkey auth)
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 * 
 * Flow:
 * 1. Call get-invite-users-payload-passkey with simple user data
 * 2. Sign the bodyToSign with passkey (use web interface at tests/web/api-testing.html)
 * 3. Submit with signedBody + webAuthnStamp to invite-users endpoint
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
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";

// Import test data from fixtures
import inviteUsersPasskeyRequest from "../../fixtures/test-data/users/invite-users-passkey-request.json" assert { type: "json" };
import simpleInviteRequest from "../../fixtures/test-data/users/simple-invite-users-request.json" assert { type: "json" };
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
  const testAccountId = TEST_DATA.accounts.testAccountId;

  const describePayloadTest = TEST_SUITE_FLAGS.runPayloadTest
    ? describe
    : describe.skip;

  describePayloadTest("POST /v1/query/get-invite-users-payload-passkey", () => {
    it(
      "should return payload to sign for inviting users with passkey",
      async () => {
        // Use fixture and prepare request with unique email
        const uniqueEmail = generateUniqueEmail(
          inviteUsersPasskeyRequest.newUsers[0].userEmail,
        );
        const requestBody = {
          ...inviteUsersPasskeyRequest,
          accountId: testAccountId,
          newUsers: [
            {
              ...inviteUsersPasskeyRequest.newUsers[0],
              userEmail: uniqueEmail,
            },
          ],
        };

        const response = await apiClient.post(
          endpoints.management.getInviteUsersPayload,
          requestBody,
          { authenticated: true },
        );

        // Assert response structure
        assertSuccessWithSchema(response, "InviteUsersRequestResponse");

        // Validate the bodyToSign structure
        const bodyToSign = response.data.bodyToSign;
        assertSchema(bodyToSign, "CreateUsersRequest");

        // Verify required fields in CreateUsersRequest
        expect(bodyToSign.type).toBe("ACTIVITY_TYPE_CREATE_USERS_V3");
        expect(bodyToSign.timestampMs).toBeDefined();
        expect(bodyToSign.organizationId).toBe(testAccountId);
        expect(bodyToSign.parameters).toBeDefined();
        expect(bodyToSign.parameters.users).toBeInstanceOf(Array);
        expect(bodyToSign.parameters.users.length).toBeGreaterThan(0);

        // Verify CreateUserParam structure in response
        const firstUser = bodyToSign.parameters.users[0];
        expect(firstUser.userName).toBe(
          inviteUsersPasskeyRequest.newUsers[0].userName,
        );
        expect(firstUser.userEmail).toBe(uniqueEmail);
        expect(firstUser.apiKeys).toBeInstanceOf(Array);
        expect(firstUser.authenticators).toBeInstanceOf(Array);
        expect(firstUser.oauthProviders).toBeInstanceOf(Array);
        expect(firstUser.userTags).toBeInstanceOf(Array);

        // Save invite users bodyToSign to generated-tx-passkey.json
        saveBodyToSign("inviteUsers", response.data.bodyToSign);
      },
      getTimeout("api"),
    );

    // it(
    //   "should handle multiple users in payload request",
    //   async () => {
    //     const requestBody = {
    //       accountId: testAccountId,
    //       newUsers: [
    //         {
    //           userName: "User One",
    //           userEmail: generateUniqueEmail("user1@example.com"),
    //           apiKeys: [],
    //           authenticators: [],
    //           oauthProviders: [],
    //           userTags: [],
    //         },
    //         {
    //           userName: "User Two",
    //           userEmail: generateUniqueEmail("user2@example.com"),
    //           apiKeys: [],
    //           authenticators: [],
    //           oauthProviders: [],
    //           userTags: [],
    //         },
    //       ],
    //     };

    //     const response = await apiClient.post(
    //       endpoints.management.getInviteUsersPayload,
    //       requestBody,
    //       { authenticated: true }
    //     );

    //     assertSuccessWithSchema(response, "InviteUsersRequestResponse");
    //     expect(response.data.bodyToSign.parameters.users.length).toBe(2);
    //   },
    //   getTimeout("api")
    // );
  });

  const describeInviteUsersTest = TEST_SUITE_FLAGS.runInviteUsersTest
    ? describe
    : describe.skip;

  describeInviteUsersTest("POST /v1/submit/invite-users", () => {
    it(
      "should invite users with passkey authentication",
      async () => {
        // Use the bodyToSign saved from the payload test (generated-tx-passkey.json)
        const bodyToSign = txRequest.inviteUsers?.bodyToSign;
        const webAuthnStamp = txRequest.inviteUsers?.webAuthnStamp;

        // Submit with signed body and webAuthnStamp
        const requestBody = {
          signedBody: bodyToSign,
          webAuthnStamp: webAuthnStamp,
        };

        // Validate request schema
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

        // Verify invited user details
        const invitedUser = response.data.newUsers[0];
        assertValidUuid(invitedUser.userId);
        expect(invitedUser.userName).toBeDefined();
        expect(invitedUser.userEmail).toBeDefined();
      },
      getTimeout("api"),
    );

    // it(
    //   "should invite multiple users at once",
    //   async () => {
    //     // Use fixture and add third user
    //     const requestBody = {
    //       ...simpleInviteRequest,
    //       accountId: testAccountId,
    //       newUsers: [
    //         {
    //           ...simpleInviteRequest.newUsers[0],
    //           userEmail: generateUniqueEmail(simpleInviteRequest.newUsers[0].userEmail),
    //         },
    //         {
    //           ...simpleInviteRequest.newUsers[1],
    //           userEmail: generateUniqueEmail(simpleInviteRequest.newUsers[1].userEmail),
    //         },
    //         {
    //           userName: "Simple User 3",
    //           userEmail: generateUniqueEmail("simpleuser3@example.com"),
    //         },
    //       ],
    //     };

    //     assertSchema(requestBody, "InviteUsersRequest");

    //     const response = await apiClient.post(
    //       endpoints.management.inviteUsers,
    //       requestBody,
    //       { authenticated: true }
    //     );

    //     if (response.status === 201) {
    //       assertSuccessWithSchema(response, "InviteUsersResponse", 201);
    //       expect(response.data.newUsers.length).toBe(3);
    //     }
    //   },
    //   getTimeout("api")
    // );
  });
});
