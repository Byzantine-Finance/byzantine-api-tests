/**
 * Account Data SDK Tests, what are tested:
 * - getUserDetails
 * - getEntityDetails
 * - getAssociatedPersonDetails()
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
  assertError,
  assertSchema,
  assertValidUuid,
} from "../../utils/sdk-assertions.js";
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

        const echoed = assertGetUserInfo(sdkResponse.data.userInfo);
        console.log(
          `✅ userInfo echoed back: ${echoed.join(", ") || "none of middleName/phone/birthDate"}`,
        );

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

        // GetAssociatedPersonResponse gained `beneficiaryId` and `userId`, so an
        // entity's associated persons can now be looked up individually via
        // get-associated-person-details. Both are nullable in the spec.
        const { associatedPersons } = sdkResponse.data;
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

  // Read-only lookup of a single beneficiary/representative of an entity, via the
  // named SDK method (added in 1.14.0). Note the argument order: beneficiaryId
  // first, auth second — unlike listEvents/getAllInvitations.
  describe("getAssociatedPersonDetails()", () => {
    const getAssociatedPerson = (beneficiaryId) =>
      client.api.getAssociatedPersonDetails(beneficiaryId, DUMMY_AUTH);

    /**
     * The beneficiary to look up: `TEST_BENEFICIARY_ID` when set (same override
     * the associated-persons suite uses), otherwise the test entity's first
     * associated person that carries a beneficiaryId.
     */
    async function findBeneficiaryId() {
      if (process.env.TEST_BENEFICIARY_ID) return process.env.TEST_BENEFICIARY_ID;

      const entity = await client.api.getEntityDetails(testEntityId, DUMMY_AUTH);
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

        const sdkResponse = await getAssociatedPerson(beneficiaryId);
        assertSuccessWithSchema(sdkResponse, "AssociatedPersonResponse");

        const person = sdkResponse.data;
        expect(person.beneficiaryId).toBe(beneficiaryId);
        expect(typeof person.verificationStatus).toBe("string");
        expect(typeof person.userInfo.firstName).toBe("string");
        expect(person.beneficiaryDetails.beneficiaryType).toBeInstanceOf(Array);
        console.log(
          `✅ ${person.userInfo.firstName} ${person.userInfo.lastName} ` +
            `(${person.verificationStatus})`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should surface an unknown beneficiary ID as an SDK error",
      async () => {
        const sdkResponse = await getAssociatedPerson(
          "00000000-0000-4000-8000-000000000000",
        );
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(404);
      },
      getTimeout("api"),
    );

    it(
      "should surface a malformed beneficiary ID as an SDK error",
      async () => {
        const sdkResponse = await getAssociatedPerson("not-a-uuid");
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
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
        assertVaultPositions(sdkResponse.data);
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
        assertVaultPositions(sdkResponse.data);
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
        const sdkResponse = await client.api.getAccountBalances(
          fundedAccountId,
          DUMMY_AUTH,
          { includeTestVaults: true },
        );
        assertSuccess(sdkResponse);
        assertSuccessWithSchema(sdkResponse, "GetAccountBalancesResponse");

        const positions = assertVaultPositions(sdkResponse.data);
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
