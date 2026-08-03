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
import { getSchema } from "../../utils/schemas.js";

// Roles a user can hold in an account, sourced from the generated enum so this
// stays in lockstep with the OpenAPI spec.
const ACCOUNT_USER_ROLES = new Set(getSchema("AccountUserRole")?.enum ?? []);

/**
 * get-account-details returns `users` (UserSummaryWithRole), which replaced the
 * old `rootUsers` (UserSummary) and adds a `role` per user.
 */
function assertAccountDetailsUsers(data) {
  expect(data.rootUsers).toBeUndefined();
  expect(data.users).toBeInstanceOf(Array);
  expect(data.users.length).toBeGreaterThan(0);
  for (const user of data.users) {
    assertValidUuid(user.userId);
    expect(typeof user.firstName).toBe("string");
    expect(typeof user.lastName).toBe("string");
    expect(typeof user.email).toBe("string");
    expect(ACCOUNT_USER_ROLES.has(user.role)).toBe(true);
  }
}

describe("Account Data API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityAccountId = TEST_DATA.accounts.testEntityAccountId;
  const testEntityId = TEST_DATA.accounts.testEntityId;
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const bankAccountsId = (orchestrated && process.env.TEST_BANK_ACCOUNT_TARGET_ID)
    ? process.env.TEST_BANK_ACCOUNT_TARGET_ID
    : testAccountId;
  const balancesAccountId = (orchestrated && process.env.CI_PASSKEY_ACCOUNT_ID)
    ? process.env.CI_PASSKEY_ACCOUNT_ID
    : testAccountId;

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
          // `authenticators` (AuthenticatorView[]) is now required on every account
          expect(account.authenticators).toBeInstanceOf(Array);
          for (const authenticator of account.authenticators) {
            expect(typeof authenticator.credentialId).toBe("string");
            expect(typeof authenticator.createdAt).toBe("string");
          }
          console.log(
            `✅ Found ${response.data.accounts.length} account(s); ` +
              `first has ${account.authenticators.length} authenticator(s)`,
          );
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
          expect(member.firstName).toBeDefined();
          expect(member.lastName).toBeDefined();
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
            expect(invitation.firstName).toBeDefined();
            expect(invitation.lastName).toBeDefined();
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
        expect(response.data.walletDetails).toBeDefined();
        expect(response.data.walletDetails.walletAddress).toBeDefined();
        expect(typeof response.data.walletDetails.isTurnkeyWallet).toBe("boolean");
        expect(typeof response.data.walletDetails.isSmartAccount.ethereum).toBe("boolean");
        expect(typeof response.data.walletDetails.isSmartAccount.base).toBe("boolean");
        // `users` replaced `rootUsers` and each entry now carries the user's role
        assertAccountDetailsUsers(response.data);
      },
      getTimeout("api"),
    );

    it(
      "should get entity account details by account ID",
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
        expect(response.data.walletDetails).toBeDefined();
        expect(response.data.walletDetails.walletAddress).toBeDefined();
        expect(typeof response.data.walletDetails.isTurnkeyWallet).toBe("boolean");
        expect(typeof response.data.walletDetails.isSmartAccount.ethereum).toBe("boolean");
        expect(typeof response.data.walletDetails.isSmartAccount.base).toBe("boolean");
        assertAccountDetailsUsers(response.data);
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
          endpoints.accounts.getBankAccounts(bankAccountsId),
          { authenticated: true },
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
          endpoints.accounts.getBankAccounts(bankAccountsId, "eur"),
          { authenticated: true },
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
          endpoints.accounts.getAccountBalances(balancesAccountId),
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
      "should get account balances with optional chainId and includeTestVaults",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getAccountBalances(balancesAccountId, {
            chainId: 8453,
            includeTestVaults: false,
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
