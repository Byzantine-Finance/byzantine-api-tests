#!/usr/bin/env node

/**
 * CI/CD Test Orchestrator
 *
 * Runs the integration test suite with sequential passkey transaction cycles.
 * Each passkey transaction (activate, deposit, withdraw) runs as its own
 * init → sign → submit cycle, because each depends on the previous completing:
 *   - Deposit requires the account to be activated first
 *   - Withdraw requires a balance from a deposit
 *
 * Flow:
 *   Phase 1: Core tests (account creation, data queries, etc.)
 *   Phase 2: Passkey transaction cycles (sequential):
 *            activate → deposit → withdraw
 *            Each cycle: get payload → sign with PasskeySigner → submit
 *
 * OTP tests in Phase 3 can be automated via Mailslurp (disposable email inboxes)
 * or run manually with TEST_OTP_CODE. Set MAILSLURP_API_KEY for full automation.
 *
 * Usage:
 *   node scripts/ci-test.js
 *   npm run test:ci
 *
 * Required environment variables:
 *   DEV_INTEGRATOR_PRIVATE_KEY   - ECDSA P-256 private key for API auth
 *   ENABLE_PASSKEY_TESTS=true    - Enable passkey test flow
 *   CI_PASSKEY_CREDENTIAL_ID     - Passkey credential ID (from ci-one-time-setup.js)
 *   CI_PASSKEY_PRIVATE_KEY       - Passkey PKCS#8 private key (from ci-one-time-setup.js)
 *
 * Prerequisites:
 *   - npm install
 *   - Run ci-one-time-setup.js once and approve KYC for the created account
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const DIVIDER = "═".repeat(60);

// Which test suite to run: "api" (direct HTTP, default) or "sdk" (Integrator SDK).
// Orchestration is identical; only the test file paths differ.
const TEST_SUITE = (process.env.TEST_SUITE || "api").toLowerCase();
if (!["api", "sdk"].includes(TEST_SUITE)) {
  throw new Error(`Invalid TEST_SUITE="${TEST_SUITE}". Must be "api" or "sdk".`);
}
const testsDir = `tests/${TEST_SUITE}`;
const testFile = (name) => `${testsDir}/${name}.test.js`;

function log(phase, description) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${phase}: ${description}`);
  console.log(DIVIDER);
}

function run(command, extraEnv = {}) {
  console.log(`  $ ${command}\n`);
  execSync(command, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    cwd: rootDir,
  });
}

/**
 * Run a single passkey transaction cycle: init → sign → submit
 */
function runPasskeyCycle(name, { initFlag, initTest, txFlag, txTest, extraInitEnv = {} }) {
  const isEnabled = process.env[txFlag] === "true";
  if (!isEnabled) {
    console.log(`  ${name}: skipped (${txFlag} not enabled)`);
    return;
  }

  console.log(`\n  ── ${name} ──`);

  // When running via ci-test.js, all three passkey init cycles operate on the
  // single CI_PASSKEY_ACCOUNT_ID (the account registered by ci-one-time-setup.js).
  // These overrides take priority over any TEST_INIT_*_TARGET_ACCOUNT_ID values
  // in .env, so direct `npx vitest` runs keep using the per-cycle .env vars.
  const ciAccountId = process.env.CI_PASSKEY_ACCOUNT_ID;
  const ciAccountOverrides = ciAccountId
    ? {
        TEST_INIT_ACTIVATE_TARGET_ACCOUNT_ID: ciAccountId,
        TEST_INIT_DEPOSIT_TARGET_ACCOUNT_ID: ciAccountId,
        TEST_INIT_WITHDRAW_TARGET_ACCOUNT_ID: ciAccountId,
      }
    : {};

  // Step 1: Get payload
  console.log(`  [init] Getting bodyToSign payload...`);
  run(
    `npx vitest run ${testFile("init-passkey")} -t "${initTest}"`,
    {
      ENABLE_PASSKEY_TESTS: "true",
      [initFlag]: "true",
      // Disable other init tests
      ENABLE_PASSKEY_INIT_ACTIVATE_TESTS: "false",
      ENABLE_PASSKEY_INIT_DEPOSIT_TESTS: "false",
      ENABLE_PASSKEY_INIT_WITHDRAW_TESTS: "false",
      // Override the specific one we want
      [initFlag]: "true",
      CI: "true",
      ...ciAccountOverrides,
      ...extraInitEnv,
    }
  );

  // Step 2: Sign
  console.log(`  [sign] Signing payload with PasskeySigner...`);
  run("node scripts/generate-stamps-ci.js");

  // Step 3: Submit
  console.log(`  [submit] Submitting signed payload...`);
  run(
    `npx vitest run ${testFile("transaction-passkey")} -t "${txTest}"`,
    {
      ENABLE_PASSKEY_TESTS: "true",
      [txFlag]: "true",
      // Disable other TX tests
      ENABLE_PASSKEY_ACTIVATE_TX_TESTS: "false",
      ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS: "false",
      ENABLE_PASSKEY_DEPOSIT_TX_TESTS: "false",
      ENABLE_PASSKEY_WITHDRAW_TX_TESTS: "false",
      // Override the specific one we want
      [txFlag]: "true",
      CI: "true",
    }
  );

  console.log(`  ✅ ${name} complete`);
}

// Common env overrides to disable OTP and other non-relevant tests
const DISABLED_OTP_ENV = {
  ENABLE_OTP_TESTS: "false",
  ENABLE_OTP_INIT_DEPOSIT_TESTS: "false",
  ENABLE_OTP_INIT_WITHDRAW_TESTS: "false",
  ENABLE_OTP_DEPOSIT_TX_TESTS: "false",
  ENABLE_OTP_WITHDRAW_TX_TESTS: "false",
  ENABLE_OTP_INIT_AUTH_TESTS: "false",
  ENABLE_OTP_AUTHENTICATE_TESTS: "false",
  ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "false",
};

try {
  const isPasskeyEnabled = process.env.ENABLE_PASSKEY_TESTS === "true";
  const hasCiPasskeySecrets =
    process.env.CI_PASSKEY_CREDENTIAL_ID && process.env.CI_PASSKEY_PRIVATE_KEY;
  const useVirtualAuth = process.env.USE_VIRTUAL_AUTH === "true";
  const canSign = hasCiPasskeySecrets || useVirtualAuth;

  const signerMode = hasCiPasskeySecrets
    ? "pure (PasskeySigner)"
    : useVirtualAuth
      ? "virtual-auth (Playwright)"
      : "none";

  console.log(`\n${DIVIDER}`);
  console.log("  Byzantine Integrator SDK - CI Test Runner");
  console.log(DIVIDER);
  console.log(`  Test suite:         ${TEST_SUITE} (${testsDir}/)`);
  console.log(`  Passkey tests:      ${isPasskeyEnabled}`);
  console.log(`  Signer mode:        ${signerMode}`);
  console.log(`  Activate TX:        ${process.env.ENABLE_PASSKEY_ACTIVATE_TX_TESTS === "true"}`);
  console.log(`  Activate ETH TX:    ${process.env.ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS === "true"}`);
  console.log(`  Deposit TX:         ${process.env.ENABLE_PASSKEY_DEPOSIT_TX_TESTS === "true"}`);
  console.log(`  Withdraw TX:        ${process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true"}`);
  console.log(`  Invite+OTP flow:    ${process.env.ENABLE_INVITE_OTP_FLOW === "true"}`);
  console.log(`  OTP retrieval:      ${process.env.MAILSLURP_API_KEY ? "Mailslurp (auto)" : process.env.TEST_OTP_CODE ? "manual" : "disabled"}`);

  // ──────────────────────────────────────────────────────────
  // Phase 1: Core tests (no passkey TX submission)
  // ──────────────────────────────────────────────────────────
  log("Phase 1", `Core ${TEST_SUITE.toUpperCase()} Tests`);
  const phase1Excludes = [
    "init-passkey",
    "transaction-passkey",
    "user-invitation",
    "init-otp",
    "entity-update-flow",
  ].map((name) => `--exclude ${testFile(name)}`);
  // validation/ subfolder only exists under tests/api/
  if (TEST_SUITE === "api") {
    phase1Excludes.push("--exclude tests/api/validation/entity-account-validation.test.js");
  }
  run(`npx vitest run ${testsDir}/ --fileParallelism=false ${phase1Excludes.join(" ")}`, {
    // Disable all passkey TX tests (handled in Phase 2)
    ENABLE_PASSKEY_ACTIVATE_TX_TESTS: "false",
    ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS: "false",
    ENABLE_PASSKEY_DEPOSIT_TX_TESTS: "false",
    ENABLE_PASSKEY_WITHDRAW_TX_TESTS: "false",
    ENABLE_PASSKEY_INIT_ACTIVATE_TESTS: "false",
    ENABLE_PASSKEY_INIT_DEPOSIT_TESTS: "false",
    ENABLE_PASSKEY_INIT_WITHDRAW_TESTS: "false",
    UPDATE_ROLE: "false",
    ADD_US_BANK_ACCOUNT: "false",
    ...DISABLED_OTP_ENV,
    CI: "true",
  });

  // ──────────────────────────────────────────────────────────
  // Phase 2: Passkey transaction cycles (sequential)
  //   Each cycle: init → sign → submit
  //   Order matters: activate → deposit → withdraw
  // ──────────────────────────────────────────────────────────
  if (isPasskeyEnabled && canSign) {
    log("Phase 2", "Passkey Transaction Cycles (activate → deposit → withdraw)");

    if (!process.env.CI_PASSKEY_ACCOUNT_ID) {
      throw new Error(
        "CI_PASSKEY_ACCOUNT_ID is not set. Phase 2 requires it — this is the single account ID used for activate/deposit/withdraw cycles (populated by ci-one-time-setup.js)."
      );
    }

    // Activate on Base
    runPasskeyCycle("Activate (Base, chain 8453)", {
      initFlag: "ENABLE_PASSKEY_INIT_ACTIVATE_TESTS",
      initTest: "Base, chain 8453",
      txFlag: "ENABLE_PASSKEY_ACTIVATE_TX_TESTS",
      txTest: "ActivateAccount",
    });

    // Activate on Ethereum
    runPasskeyCycle("Activate (Ethereum, chain 1)", {
      initFlag: "ENABLE_PASSKEY_INIT_ACTIVATE_TESTS",
      initTest: "Ethereum, chain 1",
      txFlag: "ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS",
      txTest: "ActivateAccountETH",
    });

    // Deposit
    runPasskeyCycle("Deposit", {
      initFlag: "ENABLE_PASSKEY_INIT_DEPOSIT_TESTS",
      initTest: "should get deposit payload",
      txFlag: "ENABLE_PASSKEY_DEPOSIT_TX_TESTS",
      txTest: "Deposit",
    });

    // Let the deposit settle before initializing the withdraw payload
    if (process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true") {
      console.log("\n  ⏳ Waiting 10s for deposit to settle before withdraw...");
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }

    // Withdraw
    runPasskeyCycle("Withdraw", {
      initFlag: "ENABLE_PASSKEY_INIT_WITHDRAW_TESTS",
      initTest: "should get withdraw payload",
      txFlag: "ENABLE_PASSKEY_WITHDRAW_TX_TESTS",
      txTest: "Withdrawal",
    });
  } else if (isPasskeyEnabled) {
    log("Phase 2", "Skipped (no signer available)");
    console.log(
      "  Set CI_PASSKEY_CREDENTIAL_ID + CI_PASSKEY_PRIVATE_KEY for pure signing,\n" +
      "  or USE_VIRTUAL_AUTH=true for Playwright fallback.\n"
    );
  } else {
    log("Phase 2", "Skipped (passkey tests not enabled)");
  }

  // ── Phase 3: Invitation + OTP flow ───────────────────────
  const inviteEnabled = process.env.ENABLE_INVITE_OTP_FLOW === "true";
  if (inviteEnabled && isPasskeyEnabled && canSign) {
    log("Phase 3", "User Invitation + OTP Authentication Flow");

    // Determine OTP retrieval method
    const hasMailslurp = !!process.env.MAILSLURP_API_KEY;
    const hasManualOtp = !!process.env.TEST_OTP_CODE;
    const otpMode = hasMailslurp ? "mailslurp" : hasManualOtp ? "manual" : "none";
    console.log(`  OTP mode: ${otpMode}`);

    // Step 0: Create Mailslurp inbox (if available)
    let mailslurpInbox = null;
    let inviteEmailEnv = {};
    if (hasMailslurp) {
      console.log("\n  ── Step 0: Create disposable email inbox ──");
      const { MailslurpClient } = await import("../utils/mailslurp.js");
      const mailslurp = new MailslurpClient();
      mailslurpInbox = { client: mailslurp, ...(await mailslurp.createInbox()) };
      inviteEmailEnv = { CI_INVITE_EMAIL: mailslurpInbox.emailAddress };
      console.log(`  📬 Inbox ready: ${mailslurpInbox.emailAddress}\n`);
    }

    try {
      // Step 1: Get invite payload
      console.log("\n  ── Step 1: Get invite payload ──");
      run(`npx vitest run ${testFile("user-invitation")} -t "should generate payload"`, {
        ENABLE_WRITE_TESTS: "true", INVITE_PAYLOAD: "true", INVITE_USERS: "false", CI: "true",
        ...inviteEmailEnv,
      });

      // Step 2: Sign invite payload with entity credential
      console.log("  ── Step 2: Sign invite payload ──");
      run("node scripts/generate-stamps-ci.js");

      // Step 3: Submit invitation
      console.log("  ── Step 3: Submit invitation ──");
      run(`npx vitest run ${testFile("user-invitation")} -t "should invite"`, {
        ENABLE_WRITE_TESTS: "true", INVITE_PAYLOAD: "false", INVITE_USERS: "true", CI: "true",
        ...inviteEmailEnv,
      });
      console.log("  ✅ User invited\n");

      // Wait for the invitation email to arrive, then snapshot the count.
      // This ensures we don't accidentally read the invitation email as the OTP.
      let emailCountBeforeOtp = 0;
      if (hasMailslurp) {
        emailCountBeforeOtp = await mailslurpInbox.client.waitForEmailCount(mailslurpInbox.inboxId, 1);
        console.log(`  📬 Emails in inbox before OTP: ${emailCountBeforeOtp}`);
      }

      // Step 4: Init OTP for invited user
      console.log("  ── Step 4: Initialize OTP ──");
      run(`npx vitest run ${testFile("otp-authentication")} -t "should initialize OTP"`, {
        ENABLE_OTP_INIT_AUTH_TESTS: "true",
        ENABLE_OTP_AUTHENTICATE_TESTS: "false",
        ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "false",
        CI: "true",
      });
      console.log("  ✅ OTP sent to invited user's email\n");

      // Step 5: Get OTP code (Mailslurp auto-retrieval or manual)
      let otpCode = process.env.TEST_OTP_CODE;

      if (hasMailslurp) {
        console.log("  ── Step 5a: Retrieve OTP code from Mailslurp ──");
        otpCode = await mailslurpInbox.client.waitForOtpCode(
          mailslurpInbox.inboxId,
          60_000,
          emailCountBeforeOtp,
        );
        console.log(`  🔑 OTP code retrieved: ${otpCode}\n`);
      }

      if (otpCode) {
        // Step 5b: Authenticate with OTP
        console.log("  ── Step 5b: Authenticate with OTP ──");
        run(`npx vitest run ${testFile("otp-authentication")} -t "should authenticate"`, {
          ENABLE_OTP_INIT_AUTH_TESTS: "false",
          ENABLE_OTP_AUTHENTICATE_TESTS: "true",
          ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "false",
          TEST_OTP_CODE: otpCode,
          CI: "true",
        });
        console.log("  ✅ OTP authenticated\n");

        // Step 6: Create authenticator for invited user
        console.log("  ── Step 6: Create authenticator for invited user ──");
        run(`npx vitest run ${testFile("otp-authentication")} -t "should create authenticators"`, {
          ENABLE_OTP_INIT_AUTH_TESTS: "false",
          ENABLE_OTP_AUTHENTICATE_TESTS: "false",
          ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "true",
          CI: "true",
        });
        console.log("  ✅ Authenticator created for invited user\n");

        // Step 7: Promote invited user to root (role management)
        const invitedUserFile = join(rootDir, "fixtures/test-data/__generated__/generated-invited-user.json");
        if (existsSync(invitedUserFile)) {
          const invitedUser = JSON.parse(readFileSync(invitedUserFile, "utf-8"));
          if (invitedUser.userId) {
            console.log("  ── Step 7: Promote invited user to root ──");
            console.log(`  Target user: ${invitedUser.userId}`);

            // Get role update payload
            console.log("  [payload] Getting role update payload...");
            run(`npx vitest run ${testFile("role-management")} -t "should generate payload"`, {
              ENABLE_WRITE_TESTS: "true",
              UPDATE_ROLE_PAYLOAD: "true",
              UPDATE_ROLE: "false",
              TEST_ROLE_TARGET_USER_ID: invitedUser.userId,
              CI: "true",
            });

            // Sign with entity credential
            console.log("  [sign] Signing role update payload...");
            run("node scripts/generate-stamps-ci.js");

            // Submit
            console.log("  [submit] Submitting role update...");
            run(`npx vitest run ${testFile("role-management")} -t "should update user role"`, {
              ENABLE_WRITE_TESTS: "true",
              UPDATE_ROLE_PAYLOAD: "false",
              UPDATE_ROLE: "true",
              TEST_ROLE_TARGET_USER_ID: invitedUser.userId,
              CI: "true",
            });
            console.log("  ✅ Invited user promoted to root");
          }
        }
      } else {
        console.log("  ⚠️  No OTP code available. Steps 5b-7 skipped.");
        console.log("  📧 Check the invited user's email for the OTP code.");
        console.log("  💡 Options to automate:");
        console.log("     - Set MAILSLURP_API_KEY for automatic OTP retrieval");
        console.log("     - Set TEST_OTP_CODE=<code> for manual OTP entry");
      }
    } finally {
      // Clean up Mailslurp inbox
      if (mailslurpInbox) {
        await mailslurpInbox.client.deleteInbox(mailslurpInbox.inboxId);
      }
    }
  } else if (inviteEnabled) {
    log("Phase 3", "Skipped (passkey signer or tests not enabled)");
  }

  console.log(`\n${DIVIDER}`);
  console.log("  ✅ All CI tests completed successfully");
  console.log(`${DIVIDER}\n`);
} catch (err) {
  console.error(`\n${DIVIDER}`);
  console.error("  ❌ CI tests failed");
  console.error(`${DIVIDER}\n`);
  process.exit(err.status || 1);
}
