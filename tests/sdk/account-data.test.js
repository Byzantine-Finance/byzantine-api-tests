/**
 * Account Data SDK Tests, what are tested:
 * - getUserDetails
 * - getEntityDetails
 * - getBankAccounts
 * - getAccountBalances
 * - New fields: teamMembers, pendingInvitations in GetEntityResponse
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSuccess,
  assertValidUuid,
} from "../../utils/sdk-assertions.js";

describe("Account Data SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityId = TEST_DATA.accounts.testEntityId;

  describe("getUserDetails()", () => {
    it(
      "should get user details by user ID",
      async () => {
        const sdkResponse = await client.api.getUserDetails(testUserId);
        assertSuccessWithSchema(sdkResponse, "GetUserResponse");
      },
      getTimeout("api"),
    );
  });

  describe("getEntityDetails()", () => {
    it(
      "should get entity details by entity ID",
      async () => {
        const sdkResponse = await client.api.getEntityDetails(testEntityId);
        assertSuccessWithSchema(sdkResponse, "GetEntityResponse");

        // Verify teamMembers structure
        assertSuccess(sdkResponse);
        const { teamMembers, pendingInvitations } = sdkResponse.data;

        expect(teamMembers).toBeInstanceOf(Array);

        if (teamMembers.length > 0) {
          const member = teamMembers[0];

          // Verify TeamMember schema fields
          assertValidUuid(member.userId);
          expect(member.userName).toBeDefined();
          expect(member.userEmail).toBeDefined();
          expect(member.role).toMatch(
            /^(root|admin|view|self_custodial|beneficiary)$/,
          );
          expect(member.joinedAt).toBeDefined();

          console.log(`✅ Found ${teamMembers.length} team member(s)`);
          console.log(`   First member role: ${member.role}`);
        } else {
          console.log("ℹ️  No team members found for entity");
        }

        if (pendingInvitations != null) {
          expect(pendingInvitations).toBeInstanceOf(Array);

          if (pendingInvitations.length > 0) {
            const invitation = pendingInvitations[0];

            // Verify PendingInvitation schema fields
            assertValidUuid(invitation.invitationId);
            expect(invitation.userName).toBeDefined();
            expect(invitation.userEmail).toBeDefined();
            assertValidUuid(invitation.invitedBy);

            console.log(
              `✅ Found ${pendingInvitations.length} pending invitation(s)`,
            );
          } else {
            console.log("ℹ️  No pending invitations for entity");
          }
        } else {
          console.log("ℹ️  pendingInvitations is null");
        }

        if (sdkResponse.data.teamMembers.length > 0) {
          const validRoles = [
            "root",
            "admin",
            "view",
            "self_custodial",
            "beneficiary",
          ];

          sdkResponse.data.teamMembers.forEach((member) => {
            expect(validRoles).toContain(member.role);
          });

          console.log(
            `✅ Verified roles for ${sdkResponse.data.teamMembers.length} team member(s)`,
          );
        }
      },
      getTimeout("api"),
    );
  });

  describe("getBankAccounts()", () => {
    it(
      "should get bank accounts for an account",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(testAccountId);
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetBankAccountsResponse");
      },
      getTimeout("api"),
    );

    it(
      "should filter bank accounts by currency",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(
          testAccountId,
          "usd",
        );
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetBankAccountsResponse");
      },
      getTimeout("api"),
    );
  });

  describe("getAccountBalances()", () => {
    it(
      "should get account balances by account ID",
      async () => {
        const sdkResponse = await client.api.getAccountBalances(
          testAccountId,
          DUMMY_AUTH,
        );
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetAccountBalancesResponse");
        expect(sdkResponse.data.account_id).toBeDefined();
        expect(sdkResponse.data.sub_accounts).toBeInstanceOf(Array);
      },
      getTimeout("api"),
    );

    it(
      "should get account balances with optional chain_id and include_test_vaults",
      async () => {
        const sdkResponse = await client.api.getAccountBalances(
          testAccountId,
          DUMMY_AUTH,
          {
            chain_id: 1,
            include_test_vaults: false,
          },
        );
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetAccountBalancesResponse");
      },
      getTimeout("api"),
    );
  });
});
