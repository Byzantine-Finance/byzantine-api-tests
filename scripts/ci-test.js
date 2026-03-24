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
 * OTP tests are always disabled in CI (require email-based human intervention).
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
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const DIVIDER = "═".repeat(60);

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

  // Step 1: Get payload
  console.log(`  [init] Getting bodyToSign payload...`);
  run(
    `npx vitest run tests/api/init-passkey.test.js -t "${initTest}"`,
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
      ...extraInitEnv,
    }
  );

  // Step 2: Sign
  console.log(`  [sign] Signing payload with PasskeySigner...`);
  run("node scripts/generate-stamps-ci.js");

  // Step 3: Submit
  console.log(`  [submit] Submitting signed payload...`);
  run(
    `npx vitest run tests/api/transaction-passkey.test.js -t "${txTest}"`,
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
  console.log(`  Passkey tests:      ${isPasskeyEnabled}`);
  console.log(`  Signer mode:        ${signerMode}`);
  console.log(`  Activate TX:        ${process.env.ENABLE_PASSKEY_ACTIVATE_TX_TESTS === "true"}`);
  console.log(`  Activate ETH TX:    ${process.env.ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS === "true"}`);
  console.log(`  Deposit TX:         ${process.env.ENABLE_PASSKEY_DEPOSIT_TX_TESTS === "true"}`);
  console.log(`  Withdraw TX:        ${process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true"}`);
  console.log(`  OTP tests:          disabled (requires email)`);

  // ──────────────────────────────────────────────────────────
  // Phase 1: Core tests (no passkey TX submission)
  // ──────────────────────────────────────────────────────────
  log("Phase 1", "Core API Tests");
  run("npx vitest run tests/api/ --fileParallelism=false --exclude tests/api/init-passkey.test.js --exclude tests/api/transaction-passkey.test.js --exclude tests/api/user-invitation.test.js", {
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

  console.log(`\n${DIVIDER}`);
  console.log("  ✅ All CI tests completed successfully");
  console.log(`${DIVIDER}\n`);
} catch (err) {
  console.error(`\n${DIVIDER}`);
  console.error("  ❌ CI tests failed");
  console.error(`${DIVIDER}\n`);
  process.exit(err.status || 1);
}
