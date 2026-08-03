/**
 * Owner-activation flow validation (flow H) — individual accounts
 *
 * Verifies the observable role transition when a root user (a CGP / wealth
 * manager, or the owner acting as signer) of an INDIVIDUAL account invites its
 * beneficiary and promotes them to root:
 *
 *     beneficiary  →  view  →  root
 *
 * Full flow (driven by the existing invite / OTP / role tests + ci-test.js
 * Phase 3, re-pointed at an individual account):
 *   1. CGP invites the beneficiary            (get-invite-users-payload + invite-users)
 *   2. Beneficiary sets their passkey via OTP  (init-otp → otp-auth → create-authenticators-otp)
 *   3. CGP promotes the beneficiary to root    (get-update-users-role-payload + update-users-role)
 *
 * This file does NOT perform the mutations — it asserts the observable state
 * that results from them, so it can be run as a checkpoint after each step.
 *
 * Observability mapping (DB column → API surface):
 *   users.account_users.role  →  get-user-details → accounts[].userRole (AccountUserRole)
 *   credential_ids (filled at  →  create-authenticators-otp → authenticatorIds
 *     the OTP step)                 (persisted to generated-invited-user.json)
 *
 * There is no team-member listing for individual accounts (that only exists for
 * entities via get-entity-details → teamMembers[]), so the beneficiary's role is
 * read from their own get-user-details response.
 *
 * Enable with:
 *   ENABLE_OWNER_ACTIVATION_VALIDATION_TESTS=true \
 *   ENABLE_AUTH_TESTS=true \
 *   TEST_OWNER_ACTIVATION_ACCOUNT_ID="<individual-account-uuid>" \
 *   TEST_OWNER_ACTIVATION_BENEFICIARY_USER_ID="<beneficiary-user-uuid>" \
 *   [EXPECT_ROLE=beneficiary|view|root] \
 *     npx vitest run tests/api/validation/owner-activation-flow-validation.test.js
 *
 * The orchestrator asserts each stage by re-running this file with EXPECT_ROLE:
 *   before invite → EXPECT_ROLE=beneficiary
 *   after  OTP    → EXPECT_ROLE=view
 *   after  promote→ EXPECT_ROLE=root
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { getTimeout, TEST_DATA } from "../../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertValidUuid,
} from "../../../utils/api-assertions.js";

// AccountUserRole enum (see fixtures/__generated__/generated-schemas.json)
const ACCOUNT_USER_ROLES = ["root", "admin", "view", "self_custodial", "beneficiary"];
// Roles that imply the beneficiary has completed passkey setup (credential_ids filled)
const POST_CREDENTIAL_ROLES = ["view", "root"];

const __dir = dirname(fileURLToPath(import.meta.url));
const INVITED_USER_FILE = join(
  __dir,
  "../../../fixtures/test-data/__generated__/generated-invited-user.json",
);

// The invited beneficiary and their created credentials are persisted here by
// otp-authentication.test.js (create-authenticators-otp step).
function loadInvitedUserArtifact() {
  try {
    return JSON.parse(readFileSync(INVITED_USER_FILE, "utf-8"));
  } catch {
    return {};
  }
}

const invitedUser = loadInvitedUserArtifact();

// Account being activated (individual). Falls back to the generated individual account.
const accountId =
  process.env.TEST_OWNER_ACTIVATION_ACCOUNT_ID ||
  invitedUser.accountId ||
  TEST_DATA.accounts.testAccountId;

// Beneficiary user being invited/promoted. Falls back to the invited user
// artifact, then the generated individual user.
const beneficiaryUserId =
  process.env.TEST_OWNER_ACTIVATION_BENEFICIARY_USER_ID ||
  invitedUser.userId ||
  TEST_DATA.users.testUserId;

// Optional: the role we expect at the current stage of the flow.
const expectRole = process.env.EXPECT_ROLE || null;

const enabled =
  process.env.ENABLE_OWNER_ACTIVATION_VALIDATION_TESTS === "true" &&
  !!accountId &&
  !!beneficiaryUserId;

const describeValidation = enabled ? describe : describe.skip;

/**
 * Fetch the beneficiary's role within the target individual account.
 * @returns {Promise<{ data: object, account: object, role: string }>}
 */
async function fetchRoleInAccount() {
  const response = await apiClient.get(
    endpoints.accounts.getUserDetails(beneficiaryUserId),
    { authenticated: true },
  );

  assertSuccessWithSchema(response, "GetUserResponse");
  assertSuccess(response);

  const { data } = response;
  expect(data.accounts).toBeInstanceOf(Array);

  const account = data.accounts.find((a) => a.accountId === accountId);
  return { data, account, role: account?.userRole };
}

describeValidation("owner-activation flow validation (individual)", () => {
  console.log(
    `\n━━━ owner-activation flow (account=${accountId}, beneficiary=${beneficiaryUserId}` +
      `${expectRole ? `, expect=${expectRole}` : ""}) ━━━`,
  );

  it(
    "beneficiary is a member of the individual account with a resolvable role",
    async () => {
      const { account, role } = await fetchRoleInAccount();

      expect(
        account,
        `beneficiary ${beneficiaryUserId} is not linked to account ${accountId}`,
      ).toBeDefined();

      assertValidUuid(account.accountId);
      expect(account.accountType).toBe("individual");
      expect(ACCOUNT_USER_ROLES).toContain(role);

      console.log(`  ✅ beneficiary role in account: ${role}`);
    },
    getTimeout("api"),
  );

  it(
    "role matches the expected activation stage (EXPECT_ROLE)",
    async (ctx) => {
      if (!expectRole) {
        console.log(
          "  ℹ️  EXPECT_ROLE not set — skipping stage assertion. " +
            "Set EXPECT_ROLE=beneficiary|view|root to assert a specific stage.",
        );
        ctx.skip();
        return;
      }

      expect(
        ACCOUNT_USER_ROLES,
        `EXPECT_ROLE="${expectRole}" is not a valid AccountUserRole`,
      ).toContain(expectRole);

      const { role } = await fetchRoleInAccount();
      expect(role).toBe(expectRole);

      console.log(`  ✅ role is "${role}" as expected for this stage`);
    },
    getTimeout("api"),
  );

  it(
    "credential_ids are filled once the beneficiary has passed the OTP step",
    async (ctx) => {
      const { role } = await fetchRoleInAccount();

      // Credentials are only expected after the OTP passkey setup, i.e. once the
      // beneficiary has moved past `beneficiary` into `view`/`root`.
      if (!POST_CREDENTIAL_ROLES.includes(role)) {
        console.log(
          `  ℹ️  role is "${role}" (pre-OTP) — no credential expected yet. Skipping.`,
        );
        ctx.skip();
        return;
      }

      // Evidence of credential_ids being written at the create-authenticators-otp
      // step is the persisted artifact for this same beneficiary.
      if (invitedUser.userId !== beneficiaryUserId) {
        console.log(
          "  ℹ️  no matching generated-invited-user.json artifact for this " +
            "beneficiary — cannot cross-check authenticatorIds. Skipping.",
        );
        ctx.skip();
        return;
      }

      expect(Array.isArray(invitedUser.authenticatorIds)).toBe(true);
      expect(invitedUser.authenticatorIds.length).toBeGreaterThan(0);

      console.log(
        `  ✅ credential filled: ${invitedUser.authenticatorIds.length} authenticator(s)`,
      );
    },
    getTimeout("api"),
  );
});

if (!enabled) {
  console.log(
    "ℹ️  owner-activation flow validation skipped. " +
      "Set ENABLE_OWNER_ACTIVATION_VALIDATION_TESTS=true, ENABLE_AUTH_TESTS=true, " +
      "TEST_OWNER_ACTIVATION_ACCOUNT_ID and TEST_OWNER_ACTIVATION_BENEFICIARY_USER_ID to run.",
  );
}
