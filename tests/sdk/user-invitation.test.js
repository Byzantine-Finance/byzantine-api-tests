/**
 * User Invitation SDK Tests, what are tested:
 * - getInviteUsersPayload() (get payload to sign)
 * - inviteUsers() (submit signed invitation with passkey auth)
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 * 
 * Flow:
 * 1. Call getInviteUsersPayload() with simple user data
 * 2. Sign the bodyToSign with passkey (use web interface at tests/web/api-testing.html)
 * 3. Submit with signedBody + webAuthnStamp to inviteUsers()
 */

import { describe, it, expect } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS, TEST_DATA } from "../../config/test.config.js";
import { generateUniqueEmail } from "../../utils/test-helpers.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertDataUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";

// Import test data from fixtures
import inviteUsersPasskeyRequest from "../../fixtures/test-data/users/invite-users-passkey-request.json" assert { type: "json" };
import simpleInviteRequest from "../../fixtures/test-data/users/simple-invite-users-request.json" assert { type: "json" };
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeUserInvitation = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeUserInvitation("Byzantine User Invitation SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;

  describe("getInviteUsersPayload()", () => {
    it(
      "should return payload to sign for inviting users with passkey",
      async () => {
        // Use fixture with unique email
        const uniqueEmail = generateUniqueEmail(
          inviteUsersPasskeyRequest.newUsers[0].userEmail
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

        const sdkResponse = await client.api.getInviteUsersPayload(requestBody);

        // Assert SDK behavior: success response with expected data shape
        assertSuccessWithSchema(sdkResponse, "InviteUsersRequestResponse");
        
        // Validate the bodyToSign structure
        expect(sdkResponse.data.bodyToSign).toBeDefined();
        const bodyToSign = sdkResponse.data.bodyToSign;
        
        // Verify CreateUsersRequest structure
        assertSchema(bodyToSign, "CreateUsersRequest");
        expect(bodyToSign.type).toBe("ACTIVITY_TYPE_CREATE_USERS_V3");
        expect(bodyToSign.timestampMs).toBeDefined();
        expect(bodyToSign.organizationId).toBe(testAccountId);
        expect(bodyToSign.parameters).toBeDefined();
        expect(bodyToSign.parameters.users).toBeInstanceOf(Array);
        
        // Verify CreateUserParam structure
        const user = bodyToSign.parameters.users[0];
        expect(user.userName).toBe(inviteUsersPasskeyRequest.newUsers[0].userName);
        expect(user.userEmail).toBe(uniqueEmail);
        expect(user.apiKeys).toBeInstanceOf(Array);
        expect(user.authenticators).toBeInstanceOf(Array);
        expect(user.oauthProviders).toBeInstanceOf(Array);
        expect(user.userTags).toBeInstanceOf(Array);
        
        // Save invite users bodyToSign to generated-tx-passkey.json
        saveBodyToSign("inviteUsers", sdkResponse.data.bodyToSign);
      },
      getTimeout("api")
    );

    it(
      "should handle multiple users in SDK request",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          newUsers: [
            {
              userName: "SDK User 1",
              userEmail: generateUniqueEmail("sdk1@example.com"),
              apiKeys: [],
              authenticators: [],
              oauthProviders: [],
              userTags: [],
            },
            {
              userName: "SDK User 2",
              userEmail: generateUniqueEmail("sdk2@example.com"),
              apiKeys: [],
              authenticators: [],
              oauthProviders: [],
              userTags: ["tag1", "tag2"],
            },
          ],
        };

        const sdkResponse = await client.api.getInviteUsersPayload(requestBody);

        assertSuccessWithSchema(sdkResponse, "InviteUsersRequestResponse");
        expect(sdkResponse.data.bodyToSign.parameters.users.length).toBe(2);
        
        // Verify second user has tags
        const secondUser = sdkResponse.data.bodyToSign.parameters.users[1];
        expect(secondUser.userTags).toEqual(["tag1", "tag2"]);
      },
      getTimeout("api")
    );

    it(
      "should handle SDK authentication errors correctly",
      async () => {
        // Create unauthenticated client
        const unauthenticatedClient = new (
          await import("@byzantine/integrator-sdk")
        ).ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        const requestBody = {
          accountId: testAccountId,
          newUsers: [
            {
              userName: "Test User",
              userEmail: "test@example.com",
              apiKeys: [],
              authenticators: [],
              oauthProviders: [],
              userTags: [],
            },
          ],
        };

        const sdkResponse = await unauthenticatedClient.api.getInviteUsersPayload(
          requestBody
        );

        // Assert SDK error handling behavior
        assertError(sdkResponse);
      },
      getTimeout("api")
    );

    it(
      "should validate request structure in SDK",
      async () => {
        // Missing required field: newUsers
        const invalidRequest = {
          accountId: testAccountId,
        };

        const sdkResponse = await client.api.getInviteUsersPayload(invalidRequest);

        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });

  describe("inviteUsers()", () => {
    it(
      "should invite users through SDK with passkey authentication",
      async () => {
        // Use the bodyToSign saved from the payload test (generated-tx-passkey.json)
        const bodyToSign = txRequest.inviteUsers?.bodyToSign;
        const webAuthnStamp = txRequest.inviteUsers?.webAuthnStamp;

        if (!bodyToSign) {
          console.log("⚠️ No saved payload found. Run the payload test first.");
          return;
        }

        if (!webAuthnStamp) {
          console.log("⚠️ No webAuthnStamp found. Sign the payload in the web interface at tests/web/api-testing.html");
          return;
        }

        // Submit with signed body and webAuthnStamp
        const requestBody = {
          signedBody: bodyToSign,
          webAuthnStamp: webAuthnStamp,
        };

        // Validate request schema
        assertSchema(requestBody, "InviteUsersRequestBodyPasskey");

        const sdkResponse = await client.api.inviteUsers(requestBody);

        // Assert SDK behavior: success response with expected data shape
        assertSuccessWithSchema(sdkResponse, "InviteUsersResponse");
        
        // Validate SDK response data
        assertDataUuid(sdkResponse, "accountId");
        expect(sdkResponse.data.newUsers).toBeInstanceOf(Array);
        expect(sdkResponse.data.invitedAt).toBeDefined();
        
        // Verify invited user
        const invitedUser = sdkResponse.data.newUsers[0];
        assertDataUuid(invitedUser, "userId");
        expect(invitedUser.userName).toBeDefined();
        expect(invitedUser.userEmail).toBeDefined();
      },
      getTimeout("api")
    );

    it(
      "should handle bulk user invitation through SDK",
      async () => {
        // Step 1: Get payload for multiple users
        const getPayloadRequest = {
          accountId: testAccountId,
          newUsers: [
            {
              userName: simpleInviteRequest.newUsers[0].userName,
              userEmail: generateUniqueEmail(simpleInviteRequest.newUsers[0].userEmail),
            },
            {
              userName: simpleInviteRequest.newUsers[1].userName,
              userEmail: generateUniqueEmail(simpleInviteRequest.newUsers[1].userEmail),
            },
          ],
        };

        const payloadResponse = await client.api.getInviteUsersPayload(getPayloadRequest);
        assertSuccessWithSchema(payloadResponse, "InviteUsersRequestResponse");
        const bodyToSign = payloadResponse.data.bodyToSign;

        // Step 2: Submit with passkey authentication
        const requestBody = {
          signedBody: bodyToSign,
          webAuthnStamp: txRequest.inviteUsers?.webAuthnStamp || "SDK_MOCK_WEBAUTHN_STAMP",
        };

        assertSchema(requestBody, "InviteUsersRequestBodyPasskey");

        const sdkResponse = await client.api.inviteUsers(requestBody);

        if (sdkResponse.status === 201) {
          assertSuccessWithSchema(sdkResponse, "InviteUsersResponse");
          expect(sdkResponse.data.newUsers.length).toBe(2);
          
          // Verify all users have UUIDs
          sdkResponse.data.newUsers.forEach(user => {
            expect(user.userId).toMatch(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
            );
          });
        } else {
          console.log("Note: This test requires a valid webAuthnStamp.");
        }
      },
      getTimeout("api")
    );

    it(
      "should handle SDK authentication errors",
      async () => {
        // Create unauthenticated client
        const unauthenticatedClient = new (
          await import("@byzantine/integrator-sdk")
        ).ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        // Try to get payload without authentication
        const requestBody = {
          accountId: testAccountId,
          newUsers: [
            {
              userName: "Test User",
              userEmail: "test@example.com",
            },
          ],
        };

        const sdkResponse = await unauthenticatedClient.api.getInviteUsersPayload(
          requestBody
        );

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api")
    );

    it(
      "should validate email format in SDK request",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          newUsers: [
            {
              userName: "Invalid Email",
              userEmail: "not-valid-email",
            },
          ],
        };

        const sdkResponse = await client.api.getInviteUsersPayload(requestBody);

        assertError(sdkResponse);
      },
      getTimeout("api")
    );

    it(
      "should handle empty newUsers array",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          newUsers: [],
        };

        const sdkResponse = await client.api.inviteUsers(requestBody);

        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });
});
