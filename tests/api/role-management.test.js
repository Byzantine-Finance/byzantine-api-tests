/**
 * Role Management API Tests
 * - POST /v1/query/get-update-users-role-payload-passkey (get payload to sign)
 * - POST /v1/submit/update-users-role (submit signed role update with passkey auth)
 *
 * Tests updating user roles within a Byzantine account, including promoting/demoting
 * users to different roles (root, admin, view, etc.)
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  saveBodyToSign,
  loadInvitedUserData,
} from "../../utils/test-data-persistence.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";

// Import test data from fixtures
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeRoleManagement = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Flags to control which test suites to run
// UPDATE_ROLE_PAYLOAD=true/false - Test getting payload to sign
// UPDATE_ROLE=true/false - Test submitting with passkey auth
const TEST_SUITE_FLAGS = {
  runPayloadTest: FEATURE_FLAGS.updateRolePayload,
  runUpdateRoleTest: FEATURE_FLAGS.updateRole,
};

describeRoleManagement("Byzantine Role Management API", () => {
  // Use CI entity passkey account for role management (requires passkey signing)
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const testAccountId = orchestrated
    ? process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID
    : process.env.CGP_ACCOUNT_ID || TEST_DATA.accounts.testEntityAccountId;
  // The role the target user is moved to. "root" is what ci-test.js's Step 7
  // ("Promote invited user to root") expects: a freshly invited user starts out
  // as "view", so asking for "view" is rejected with "cannot be demoted to view".
  const role = "root";
  const invitedUser = loadInvitedUserData();

  // Target user, in priority order: the id ci-test.js passes explicitly for the
  // freshly invited user, then the last invited user recorded locally.
  //
  // This must never be the user whose passkey signs the request. In an
  // orchestrated run that signer is the account's root user
  // (CI_ENTITY_PASSKEY_ROOT_USER_ID), and setting its role to a non-root one
  // revokes its own permission to update the root quorum — every later
  // root-quorum call from that credential then fails with a Turnkey 403, and it
  // cannot promote itself back. Hence the explicit guard below.
  const roleTargetUserId =
    process.env.TEST_ROLE_TARGET_USER_ID || invitedUser.userId || null;
  const signingUserId = orchestrated
    ? process.env.CI_ENTITY_PASSKEY_ROOT_USER_ID
    : null;
  const userToPromote =
    roleTargetUserId && roleTargetUserId !== signingUserId
      ? roleTargetUserId
      : null;

  const describePayloadTest = TEST_SUITE_FLAGS.runPayloadTest
    ? describe
    : describe.skip;

  describePayloadTest(
    "POST /v1/query/get-update-users-role-payload-passkey",
    () => {
      it(
        `should generate payload for setting a user to the "${role}" role`,
        async () => {
          if (!userToPromote) {
            console.warn(
              "⚠️  No role target user available (or the only candidate is the " +
                "signing root user) — skipping",
            );
            return;
          }

          const requestBody = {
            accountId: testAccountId,
            role: role,
            userIds: [userToPromote],
          };

          const response = await apiClient.post(
            endpoints.roles.getUpdateUsersRolePayload,
            requestBody,
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "UpdateUsersRoleRequestResponse");

          // Validate the bodyToSign structure
          const bodyToSign = response.data.bodyToSign;
          assertSchema(bodyToSign, "UpdateRootQuorumRequest");

          // Verify the payload structure
          expect(bodyToSign.type).toBe("ACTIVITY_TYPE_UPDATE_ROOT_QUORUM");
          expect(bodyToSign.timestampMs).toBeDefined();
          expect(bodyToSign.organizationId).toBe(testAccountId);

          // Verify parameters
          expect(bodyToSign.parameters).toBeDefined();
          expect(bodyToSign.parameters.threshold).toBeGreaterThanOrEqual(1);
          expect(bodyToSign.parameters.userIds).toBeInstanceOf(Array);

          // Save for signing (would be signed by passkey in real flow)
          saveBodyToSign("promoteUser", bodyToSign);

          console.log(
            `✅ Generated payload to set user ${userToPromote} to the "${role}" role`,
          );
          console.log(
            `   Root quorum will have ${bodyToSign.parameters.userIds.length} user(s)`,
          );
          console.log(
            `   Threshold: ${bodyToSign.parameters.threshold} approval(s) required`,
          );
        },
        getTimeout("api"),
      );
    },
  );

  const describeUpdateRoleTest = TEST_SUITE_FLAGS.runUpdateRoleTest
    ? describe
    : describe.skip;

  describeUpdateRoleTest("POST /v1/submit/update-users-role", () => {
    it(
      "should update user role with passkey authentication",
      async () => {
        const bodyToSign = txRequest.promoteUser.bodyToSign;
        const webAuthnStamp = txRequest.promoteUser.webAuthnStamp;

        const signedPayload = {
          signedBody: bodyToSign,
          webAuthnStamp: webAuthnStamp,
        };

        // Step 3: Submit the signed payload
        const response = await apiClient.post(
          endpoints.roles.updateUsersRole,
          signedPayload,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "UpdateUsersRoleResponse");

        // Verify response
        assertValidUuid(response.data.accountId);
        expect(response.data.accountId).toBe(testAccountId);
        expect(response.data.threshold).toBeGreaterThanOrEqual(1);
        expect(response.data.rootUserIds).toBeInstanceOf(Array);

        console.log(
          `✅ Successfully updated user role for account ${testAccountId}`,
        );
        console.log(
          `   Root users: ${response.data.rootUserIds.length} user(s)`,
        );
        console.log(`   Threshold: ${response.data.threshold} approval(s)`);
      },
      getTimeout("passkey"),
    );
  });
});
