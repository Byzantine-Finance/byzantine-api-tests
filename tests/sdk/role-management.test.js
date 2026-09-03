/**
 * Role Management SDK Tests
 * - getUpdateUsersRolePayloadPasskey (get payload to sign)
 * - updateUsersRole (submit signed role update with passkey auth)
 *
 * Tests updating user roles within a Byzantine account, including promoting/demoting
 * users to different roles (root, admin, view, etc.)
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  saveBodyToSign,
  loadInvitedUserData,
} from "../../utils/test-data-persistence.js";
import {
  assertSuccessWithSchema,
  assertValidUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";

// Import test data from fixtures
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };
import { TEST_DATA } from "../../config/test.config.js";

// Skip if auth/write tests are disabled
const describeRoleManagement = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Flags to control which test suites to run
const TEST_SUITE_FLAGS = {
  runPayloadTest: FEATURE_FLAGS.updateRolePayload,
  runUpdateRoleTest: FEATURE_FLAGS.updateRole,
};

describeRoleManagement("Byzantine Role Management SDK", () => {
  const client = getSdkClient();
  // Use CI entity passkey account for role management (requires passkey signing)
  const testAccountId =
    process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID ||
    TEST_DATA.accounts.testEntityAccountId;
  const invitedUser = loadInvitedUserData();

  // Target user, in priority order: the id ci-test.js passes explicitly for the
  // freshly invited user, then the last invited user recorded locally. Both
  // belong to `testAccountId`; TEST_DATA.users.roleTargetUserId falls back to
  // the *locally* created entity's root user, which is not in the CI entity
  // account and is rejected with "is not associated with account".
  //
  // This must never be the user whose passkey signs the request — that signer
  // is the account's root user (CI_ENTITY_PASSKEY_ROOT_USER_ID), and moving it
  // off root revokes its own permission to update the root quorum, after which
  // every root-quorum call from that credential fails with a Turnkey 403 and it
  // cannot promote itself back. Hence the explicit guard below.
  const roleTargetUserId =
    process.env.TEST_ROLE_TARGET_USER_ID || invitedUser.userId || null;
  const userToPromote =
    roleTargetUserId &&
    roleTargetUserId !== process.env.CI_ENTITY_PASSKEY_ROOT_USER_ID
      ? roleTargetUserId
      : null;
  const role = "root";

  const describePayloadTest = TEST_SUITE_FLAGS.runPayloadTest
    ? describe
    : describe.skip;

  describePayloadTest(
    "getUpdateUsersRolePayloadPasskey()",
    () => {
      it(
        "should generate payload for promoting a user to root role",
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

          const sdkResponse =
            await client.api.getUpdateUsersRolePayloadPasskey(
              requestBody,
              DUMMY_AUTH,
            );

          assertSuccessWithSchema(sdkResponse, "UpdateUsersRoleRequestResponse");

          // Validate the bodyToSign structure
          const bodyToSign = sdkResponse.data.bodyToSign;
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
            `✅ Generated payload to promote user ${userToPromote} to root role`,
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

  describeUpdateRoleTest("updateUsersRole()", () => {
    it(
      "should update user role with passkey authentication",
      async () => {
        const bodyToSign = txRequest.promoteUser.bodyToSign;
        const webAuthnStamp = txRequest.promoteUser.webAuthnStamp;

        const signedPayload = {
          signedBody: bodyToSign,
          webAuthnStamp: webAuthnStamp,
        };

        const sdkResponse = await client.api.updateUsersRole(
          signedPayload,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "UpdateUsersRoleResponse");

        // Verify response
        assertValidUuid(sdkResponse.data.accountId);
        expect(sdkResponse.data.accountId).toBe(testAccountId);
        expect(sdkResponse.data.threshold).toBeGreaterThanOrEqual(1);
        expect(sdkResponse.data.rootUserIds).toBeInstanceOf(Array);

        console.log(
          `✅ Successfully updated user role for account ${testAccountId}`,
        );
        console.log(
          `   Root users: ${sdkResponse.data.rootUserIds.length} user(s)`,
        );
        console.log(
          `   Threshold: ${sdkResponse.data.threshold} approval(s)`,
        );
      },
      getTimeout("passkey"),
    );
  });
});
