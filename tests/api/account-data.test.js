/**
 * Account Data API Tests, what are tested:
 * - query/get-user-details
 * - query/get-entity-details
 * - query/get-associated-person-details
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
  assertSchema,
  assertValidUuid,
} from "../../utils/api-assertions.js";
import { getSchema } from "../../utils/schemas.js";

// Roles a user can hold in an account, sourced from the generated enum so this
// stays in lockstep with the OpenAPI spec.
const ACCOUNT_USER_ROLES = new Set(getSchema("AccountUserRole")?.enum ?? []);

/**
 * `userInfo` on get-user-details is a `GetUserInfo`, which now echoes back three
 * fields the API already accepted at account creation but used to drop from the
 * read path: `middleName`, `phone` and `birthDate`. All three are optional and
 * are **omitted entirely** when unset rather than returned as `null`, so assert
 * the type only when the key is present.
 */
function assertGetUserInfo(userInfo) {
  expect(typeof userInfo.firstName).toBe("string");
  expect(typeof userInfo.lastName).toBe("string");
  expect(typeof userInfo.email).toBe("string");

  const echoed = [];
  for (const field of ["middleName", "phone", "birthDate"]) {
    if (userInfo[field] == null) continue;
    expect(typeof userInfo[field]).toBe("string");
    echoed.push(field);
  }
  // Date-only, as in the spec's `1990-01-01` example — not a full timestamp
  if (userInfo.birthDate != null) {
    expect(userInfo.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  return echoed;
}

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

/**
 * Every vault position across an account's sub-accounts, with the shape of the
 * nullable `pending_withdrawals` field checked on each.
 *
 * A position reports `pending_withdrawals` (balance + shares awaiting redemption)
 * while a withdrawal is in flight, and null the rest of the time. `is_async_vault`
 * does NOT predict it: observed on dev, a vault reported as `is_async_vault: false`
 * carried pending withdrawals for a `withdrawal_initiated` transaction, so this
 * asserts the field's shape only and leaves the queueing semantics to the API.
 */
function assertVaultPositions(data) {
  const positions = (data.sub_accounts || []).flatMap((s) => s.positions || []);

  for (const position of positions) {
    const pending = position.pending_withdrawals;
    if (pending === null || pending === undefined) continue;

    assertSchema(pending, "PendingWithdrawals");
    // Decimals travel as strings — money is never a float here
    expect(typeof pending.balance).toBe("string");
    expect(typeof pending.shares).toBe("string");
  }

  return positions;
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

        const echoed = assertGetUserInfo(response.data.userInfo);
        console.log(
          `✅ userInfo echoed back: ${echoed.join(", ") || "none of middleName/phone/birthDate"}`,
        );

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

        // GetAssociatedPersonResponse gained `beneficiaryId` and `userId`, so an
        // entity's associated persons can now be looked up individually via
        // get-associated-person-details. Both are nullable in the spec.
        const { associatedPersons } = response.data;
        if (associatedPersons?.length > 0) {
          for (const person of associatedPersons) {
            if (person.beneficiaryId != null) {
              assertValidUuid(person.beneficiaryId);
            }
            if (person.userId != null) {
              assertValidUuid(person.userId);
            }
            expect(person.beneficiaryType).toBeInstanceOf(Array);
          }
          console.log(
            `✅ ${associatedPersons.length} associated person(s), ` +
              `${associatedPersons.filter((p) => p.beneficiaryId != null).length} with a beneficiaryId`,
          );
        } else {
          console.log("ℹ️  No associated persons on entity");
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

  describe("GET /v1/query/get-associated-person-details", () => {
    /**
     * The beneficiary to look up: `TEST_BENEFICIARY_ID` when set (same override
     * the associated-persons suite uses), otherwise the test entity's first
     * associated person that carries a beneficiaryId. Discovering it from
     * get-entity-details keeps this working when saved fixture ids go stale.
     */
    async function findBeneficiaryId() {
      if (process.env.TEST_BENEFICIARY_ID) return process.env.TEST_BENEFICIARY_ID;

      const entity = await apiClient.get(
        endpoints.accounts.getEntityDetails(testEntityId),
        { authenticated: true },
      );
      assertSuccess(entity);
      return (entity.data.associatedPersons ?? []).find(
        (p) => p.beneficiaryId != null,
      )?.beneficiaryId;
    }

    it(
      "should get an associated person by beneficiary ID",
      async () => {
        const beneficiaryId = await findBeneficiaryId();
        if (!beneficiaryId) {
          console.log(
            "ℹ️  Test entity has no associated person with a beneficiaryId — skipping",
          );
          return;
        }

        const response = await apiClient.get(
          endpoints.accounts.getAssociatedPersonDetails(beneficiaryId),
          { authenticated: true },
        );
        assertSuccessWithSchema(response, "AssociatedPersonResponse");

        const person = response.data;
        expect(person.beneficiaryId).toBe(beneficiaryId);
        expect(typeof person.verificationStatus).toBe("string");
        expect(typeof person.userInfo.firstName).toBe("string");
        expect(typeof person.userInfo.lastName).toBe("string");
        expect(person.beneficiaryDetails.beneficiaryType).toBeInstanceOf(Array);
        // Only present while required documents are still outstanding
        if (person.missingDocuments != null) {
          expect(person.missingDocuments).toBeInstanceOf(Array);
        }
        console.log(
          `✅ ${person.userInfo.firstName} ${person.userInfo.lastName} ` +
            `(${person.verificationStatus}, ${person.beneficiaryDetails.beneficiaryType.join("/")})`,
        );
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
        assertVaultPositions(response.data);
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
        assertVaultPositions(response.data);
      },
      getTimeout("api"),
    );

    // `pending_withdrawals` can only be checked against positions that exist, and
    // the default test account usually holds none. This runs against the funded
    // account the withdraw tests point at, when one is configured.
    const fundedAccountId = TEST_DATA.accounts.initWithdrawTargetAccountId;
    const itFunded = fundedAccountId ? it : it.skip;

    itFunded(
      "should report pending_withdrawals per position on a funded account",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getAccountBalances(fundedAccountId, {
            includeTestVaults: true,
          }),
          { authenticated: true },
        );
        assertSuccess(response);
        assertSuccessWithSchema(response, "GetAccountBalancesResponse");

        const positions = assertVaultPositions(response.data);
        expect(
          positions.length,
          `account ${fundedAccountId} should hold at least one vault position`,
        ).toBeGreaterThan(0);

        const pending = positions.filter((p) => p.pending_withdrawals);
        console.log(
          `✅ ${positions.length} position(s), ${pending.length} with pending withdrawals${
            pending.length
              ? `: ${pending
                  .map(
                    (p) =>
                      `${p.vault_address} ${p.pending_withdrawals.balance} (${p.pending_withdrawals.shares} shares)`,
                  )
                  .join(", ")}`
              : ""
          }`,
        );
      },
      getTimeout("api"),
    );
  });
});
