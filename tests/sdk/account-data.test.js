/**
 * Account Data SDK Tests, what are tested:
 * - getUserDetails
 * - getEntityDetails
 * - getAccountDetails
 * - getCustomers
 * - getBankAccounts
 * - getAccountBalances
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

describe("Account Data SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityId = TEST_DATA.accounts.testEntityId;
  const testEntityAccountId = TEST_DATA.accounts.testEntityAccountId;
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const bankAccountsId = (orchestrated && process.env.TEST_BANK_ACCOUNT_TARGET_ID)
    ? process.env.TEST_BANK_ACCOUNT_TARGET_ID
    : testAccountId;
  const balancesAccountId = (orchestrated && process.env.CI_PASSKEY_ACCOUNT_ID)
    ? process.env.CI_PASSKEY_ACCOUNT_ID
    : testAccountId;

  describe("getUserDetails()", () => {
    it(
      "should get user details by user ID",
      async () => {
        const sdkResponse = await client.api.getUserDetails(
          { userId: testUserId },
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(sdkResponse, "GetUserResponse");

        // Verify accounts is now an array of GetAccountResponse objects
        assertSuccess(sdkResponse);
        expect(sdkResponse.data.accounts).toBeInstanceOf(Array);

        if (sdkResponse.data.accounts.length > 0) {
          const account = sdkResponse.data.accounts[0];
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
            `✅ Found ${sdkResponse.data.accounts.length} account(s); ` +
              `first has ${account.authenticators.length} authenticator(s)`,
          );
        }
      },
      getTimeout("api"),
    );
  });

  describe("getEntityDetails()", () => {
    it(
      "should get entity details by entity ID",
      async () => {
        const sdkResponse = await client.api.getEntityDetails(
          testEntityId,
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(sdkResponse, "GetEntityResponse");

        // Verify account structure (changed from accountId to account object)
        assertSuccess(sdkResponse);
        const { account, teamMembers, pendingInvitations } = sdkResponse.data;

        expect(account).toBeDefined();
        assertValidUuid(account.accountId);
        expect(account.accountName).toBeDefined();
        expect(account.accountType).toMatch(/^(individual|company)$/);
        expect(account.walletAddress).toBeDefined();
        expect(typeof account.isSelfCustodial).toBe("boolean");
        console.log(`✅ Account: ${account.accountName} (${account.accountType})`);

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

  describe("getAccountDetails()", () => {
    it(
      "should get user account details by account ID",
      async () => {
        const sdkResponse = await client.api.getAccountDetails(
          testAccountId,
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(sdkResponse, "GetAccountDetailsResponse");
        assertSuccess(sdkResponse);
        assertValidUuid(sdkResponse.data.accountId);
        expect(sdkResponse.data.accountName).toBeDefined();
        expect(sdkResponse.data.accountType).toMatch(/^(individual|company)$/);
        expect(sdkResponse.data.walletDetails).toBeDefined();
        expect(sdkResponse.data.walletDetails.walletAddress).toBeDefined();
        expect(typeof sdkResponse.data.walletDetails.isTurnkeyWallet).toBe("boolean");
        expect(typeof sdkResponse.data.walletDetails.isSmartAccount.ethereum).toBe("boolean");
        expect(typeof sdkResponse.data.walletDetails.isSmartAccount.base).toBe("boolean");
        // `users` replaced `rootUsers` and each entry now carries the user's role
        assertAccountDetailsUsers(sdkResponse.data);
      },
      getTimeout("api"),
    );

    it(
      "should get entity account details by account ID",
      async () => {
        const sdkResponse = await client.api.getAccountDetails(
          testEntityAccountId,
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(sdkResponse, "GetAccountDetailsResponse");
        assertSuccess(sdkResponse);
        assertValidUuid(sdkResponse.data.accountId);
        expect(sdkResponse.data.accountName).toBeDefined();
        expect(sdkResponse.data.accountType).toMatch(/^(individual|company)$/);
        expect(sdkResponse.data.walletDetails).toBeDefined();
        expect(sdkResponse.data.walletDetails.walletAddress).toBeDefined();
        expect(typeof sdkResponse.data.walletDetails.isTurnkeyWallet).toBe("boolean");
        expect(typeof sdkResponse.data.walletDetails.isSmartAccount.ethereum).toBe("boolean");
        expect(typeof sdkResponse.data.walletDetails.isSmartAccount.base).toBe("boolean");
        // `users` replaced `rootUsers` and each entry now carries the user's role
        assertAccountDetailsUsers(sdkResponse.data);
      },
      getTimeout("api"),
    );
  });

  describe("getCustomers()", () => {
    it(
      "should get all customers",
      async () => {
        const sdkResponse = await client.api.getCustomers(DUMMY_AUTH);
        assertSuccessWithSchema(sdkResponse, "GetCustomersResponse");
        const biz = sdkResponse.data.businessCustomers || [];
        const ind = sdkResponse.data.individualCustomers || [];
        console.log(`  Business: ${biz.length}, Individual: ${ind.length}`);
        [...biz.slice(0, 3), ...ind.slice(0, 3)].forEach((c) =>
          console.log(`  - ${JSON.stringify(c)}`),
        );
      },
      getTimeout("api"),
    );

    it(
      "should filter customers by type: individual",
      async () => {
        const sdkResponse = await client.api.getCustomers(DUMMY_AUTH, "individual");
        assertSuccessWithSchema(sdkResponse, "GetCustomersResponse");
        const ind = sdkResponse.data.individualCustomers || [];
        console.log(`  Individual customers: ${ind.length}`);
        ind.slice(0, 3).forEach((c) => console.log(`  - ${JSON.stringify(c)}`));
      },
      getTimeout("api"),
    );

    it(
      "should filter customers by type: business",
      async () => {
        const sdkResponse = await client.api.getCustomers(DUMMY_AUTH, "business");
        assertSuccessWithSchema(sdkResponse, "GetCustomersResponse");
        const biz = sdkResponse.data.businessCustomers || [];
        console.log(`  Business customers: ${biz.length}`);
        biz.slice(0, 3).forEach((c) => console.log(`  - ${JSON.stringify(c)}`));
      },
      getTimeout("api"),
    );
  });

  describe("getBankAccounts()", () => {
    it(
      "should get bank accounts for an account",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(
          bankAccountsId,
          DUMMY_AUTH,
        );
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetBankAccountsResponse");
      },
      getTimeout("api"),
    );

    it(
      "should filter bank accounts by currency",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(
          bankAccountsId,
          DUMMY_AUTH,
          "eur",
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
          balancesAccountId,
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
      "should get account balances with optional chainId and includeTestVaults",
      async () => {
        const sdkResponse = await client.api.getAccountBalances(
          balancesAccountId,
          DUMMY_AUTH,
          {
            chainId: 8453,
            includeTestVaults: false,
          },
        );
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetAccountBalancesResponse");
      },
      getTimeout("api"),
    );
  });
});
