/**
 * Account Data API Tests, what are tested:
 * - query/get-user-details
 * - query/get-entity-details
 * - query/get-account-details
 * - query/get-customers
 * - query/get-bank-accounts
 * - query/get-account-balances
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, TEST_DATA } from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertSuccess,
  assertArraySchema,
  assertValidUuid,
} from "../../utils/api-assertions.js";

describe("Account Data API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityAccountId = TEST_DATA.accounts.testEntityAccountId;
  const testEntityId = TEST_DATA.accounts.testEntityId;

  describe("GET /v1/query/get-user-details", () => {
    it(
      "should get user details by user ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getUserDetails(testUserId),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetUserResponse");

        // Verify accounts is now an array of GetAccountResponse objects
        assertSuccess(response);
        expect(response.data.accounts).toBeInstanceOf(Array);

        if (response.data.accounts.length > 0) {
          const account = response.data.accounts[0];
          assertValidUuid(account.accountId);
          expect(account.accountName).toBeDefined();
          expect(account.accountType).toMatch(/^(individual|company)$/);
          expect(account.walletAddress).toBeDefined();
          expect(typeof account.isSelfCustodial).toBe("boolean");
          console.log(`✅ Found ${response.data.accounts.length} account(s)`);
        }
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-entity-details", () => {
    it(
      "should get entity details by entity ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getEntityDetails(testEntityId),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetEntityResponse");

        // Verify account structure (changed from accountId to account object)
        assertSuccess(response);
        const { account, teamMembers, pendingInvitations } = response.data;

        expect(account).toBeDefined();
        assertValidUuid(account.accountId);
        expect(account.accountName).toBeDefined();
        expect(account.accountType).toMatch(/^(individual|company)$/);
        expect(account.walletAddress).toBeDefined();
        expect(typeof account.isSelfCustodial).toBe("boolean");
        console.log(
          `✅ Account: ${account.accountName} (${account.accountType})`,
        );

        // Verify teamMembers structure
        expect(teamMembers).toBeInstanceOf(Array);

        if (teamMembers.length > 0) {
          const member = teamMembers[0];

          // Verify TeamMember schema fields (userId is now nullable)
          if (member.userId != null) {
            assertValidUuid(member.userId);
          }
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

        // pendingInvitations can be null, undefined, or array
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
          console.log("ℹ️  pendingInvitations is null or undefined");
        }

        if (response.data.teamMembers.length > 0) {
          const validRoles = [
            "root",
            "admin",
            "view",
            "self_custodial",
            "beneficiary",
          ];

          response.data.teamMembers.forEach((member) => {
            expect(validRoles).toContain(member.role);
          });

          console.log(
            `✅ Verified roles for ${response.data.teamMembers.length} team member(s)`,
          );
        }
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-account-details", () => {
    it(
      "should get user account details by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getAccountDetails(testAccountId),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetAccountDetailsResponse");
        assertSuccess(response);
        assertValidUuid(response.data.accountId);
        expect(response.data.accountName).toBeDefined();
        expect(response.data.accountType).toMatch(/^(individual|company)$/);
        expect(response.data.walletAddress).toBeDefined();
        expect(typeof response.data.isSelfCustodial).toBe("boolean");
      },
      getTimeout("api"),
    );

    it(
      "should get user account details by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getAccountDetails(testEntityAccountId),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetAccountDetailsResponse");
        assertSuccess(response);
        assertValidUuid(response.data.accountId);
        expect(response.data.accountName).toBeDefined();
        expect(response.data.accountType).toMatch(/^(individual|company)$/);
        expect(response.data.walletAddress).toBeDefined();
        expect(typeof response.data.isSelfCustodial).toBe("boolean");
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-customers", () => {
    it(
      "should get all customers",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getCustomers(),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetCustomersResponse");
      },
      getTimeout("api"),
    );

    it(
      "should filter customers by type: individual",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getCustomers("individual"),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetCustomersResponse");
      },
      getTimeout("api"),
    );

    it(
      "should filter customers by type: business",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getCustomers("business"),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "GetCustomersResponse");
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-bank-accounts", () => {
    it(
      "should get bank accounts for an account",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getBankAccounts(testAccountId),
        );
        assertSuccess(response);
        assertSuccessWithSchema(response, "GetBankAccountsResponse");
      },
      getTimeout("api"),
    );

    it(
      "should filter bank accounts by currency",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getBankAccounts(testAccountId, "usd"),
        );
        assertSuccess(response);
        assertSuccessWithSchema(response, "GetBankAccountsResponse");
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-account-balances", () => {
    it(
      "should get account balances by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getAccountBalances(testAccountId),
          { authenticated: true },
        );
        assertSuccess(response);
        assertSuccessWithSchema(response, "GetAccountBalancesResponse");
        expect(response.data.account_id).toBeDefined();
        expect(response.data.sub_accounts).toBeInstanceOf(Array);
      },
      getTimeout("api"),
    );

    it(
      "should get account balances with optional chain_id and include_test_vaults",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getAccountBalances(testAccountId, {
            chain_id: 1,
            include_test_vaults: false,
          }),
          { authenticated: true },
        );
        assertSuccess(response);
        assertSuccessWithSchema(response, "GetAccountBalancesResponse");
      },
      getTimeout("api"),
    );
  });
});
