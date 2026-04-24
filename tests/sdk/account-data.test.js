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

describe("Account Data SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityId = TEST_DATA.accounts.testEntityId;
  const testEntityAccountId = TEST_DATA.accounts.testEntityAccountId;
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const bankAccountsId = (orchestrated && process.env.CI_PASSKEY_ACCOUNT_ID)
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
          console.log(`✅ Found ${sdkResponse.data.accounts.length} account(s)`);
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
        expect(sdkResponse.data.walletAddress).toBeDefined();
        expect(typeof sdkResponse.data.isSelfCustodial).toBe("boolean");
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
        expect(sdkResponse.data.walletAddress).toBeDefined();
        expect(typeof sdkResponse.data.isSelfCustodial).toBe("boolean");
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
      },
      getTimeout("api"),
    );

    it(
      "should filter customers by type: individual",
      async () => {
        const sdkResponse = await client.api.getCustomers(
          DUMMY_AUTH,
          "individual",
        );
        assertSuccessWithSchema(sdkResponse, "GetCustomersResponse");
      },
      getTimeout("api"),
    );

    it(
      "should filter customers by type: business",
      async () => {
        const sdkResponse = await client.api.getCustomers(
          DUMMY_AUTH,
          "business",
        );
        assertSuccessWithSchema(sdkResponse, "GetCustomersResponse");
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
