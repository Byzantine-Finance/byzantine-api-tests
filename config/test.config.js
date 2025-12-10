/**
 * Test Configuration
 * Test-specific settings, test data, and feature flags
 */

import dotenv from "dotenv";
import { getEnvironment, isProduction, isCI } from "./environments.js";
import { loadTestData } from "../utils/test-data-persistence.js";

dotenv.config();

/**
 * Test Timeouts (in milliseconds)
 * These are for Vitest test execution, not API request timeouts
 */
export const TEST_TIMEOUTS = {
  // How long a single test can run before timing out
  default: 10000, // 10 seconds
  api: 15000, // 15 seconds for API tests
  integration: 30000, // 30 seconds for integration tests
  e2e: 60000, // 60 seconds for E2E tests

  // CI typically needs longer timeouts
  ciMultiplier: isCI() ? 2 : 1,
};

/**
 * Get timeout for a specific test type
 * @param {string} type - Test type: 'default', 'api', 'integration', 'e2e'
 * @returns {number} Timeout in milliseconds
 */
export function getTimeout(type = "default") {
  const baseTimeout = TEST_TIMEOUTS[type] || TEST_TIMEOUTS.default;
  return baseTimeout * TEST_TIMEOUTS.ciMultiplier;
}

/**
 * Test Data - IDs and addresses for testing
 *
 * Priority order:
 * 1. Generated IDs from test runs (fixtures/test-data/generated/generated-ids.json)
 * 2. Environment variables
 * 3. Default values (for vaults)
 *
 * WARNING: Update these with valid test data from your environment
 */
const generatedTestData = loadTestData();
const useEthereum = process.env.CHAIN?.toUpperCase() === "ETH";

export const TEST_DATA = {
  vaults: {
    selected: useEthereum
      ? {
          address:
            process.env.TEST_VAULT_ETH ||
            "0xbd9be389743674cd1eba663067eb83d294321a33",
          chainId: 1,
        }
      : {
          // Default to BASE
          address:
            process.env.TEST_VAULT_BASE ||
            "0x0863cf361ea7f92fd53223a2fa1e58f799544e82",
          chainId: 8453,
        },
  },

  accounts: {
    // Test user/account IDs
    // dev mode: generated from test runs
    // production mode: environment variables only
    testUserId: isProduction()
      ? process.env.TEST_USER_ID
      : generatedTestData.accounts.testUserId,
    testAccountId: isProduction()
      ? process.env.TEST_ACCOUNT_ID
      : generatedTestData.accounts.testAccountId,
    testEntityId: isProduction()
      ? process.env.TEST_ENTITY_ID
      : generatedTestData.accounts.testEntityId,
    testEntityAccountId: isProduction()
      ? process.env.TEST_ENTITY_ACCOUNT_ID
      : generatedTestData.accounts.testEntityAccountId,
  },

  transactions: {
    // Test transaction IDs
    testTransactionId: process.env.TEST_TRANSACTION_ID || null,
  },
};

/**
 * Feature Flags - Enable/disable specific test suites
 */
export const FEATURE_FLAGS = {
  // Read-only tests (GET requests) - safe to run in any environment
  enableVaultTests: true,
  enableHealthTests: true,

  // Tests that modify data (POST/PUT/DELETE) - only in dev/staging
  enableWriteTests:
    !isProduction() && process.env.ENABLE_WRITE_TESTS === "true",

  // Tests that require specific test data to exist
  enableAccountTests: Boolean(TEST_DATA.accounts.testUserId),

  // WebAuthn/Passkey tests
  enablePasskeyTests: process.env.ENABLE_PASSKEY_TESTS === "true",
  enablePasskeyInitApproveTests: process.env.ENABLE_PASSKEY_INIT_APPROVE_TESTS === "true",
  enablePasskeyInitDepositTests: process.env.ENABLE_PASSKEY_INIT_DEPOSIT_TESTS === "true",
  enablePasskeyInitWithdrawTests: process.env.ENABLE_PASSKEY_INIT_WITHDRAW_TESTS === "true",
  enablePasskeyApproveTxTests: process.env.ENABLE_PASSKEY_APPROVE_TX_TESTS === "true",
  enablePasskeyDepositTxTests: process.env.ENABLE_PASSKEY_DEPOSIT_TX_TESTS === "true",
  enablePasskeyWithdrawTxTests: process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true",

  // OTP tests (require real OTP codes)
  enableOtpTests: process.env.ENABLE_OTP_TESTS === "true",
  enableOtpInitApproveTests: process.env.ENABLE_OTP_INIT_APPROVE_TESTS === "true",
  enableOtpInitDepositTests: process.env.ENABLE_OTP_INIT_DEPOSIT_TESTS === "true",
  enableOtpInitWithdrawTests: process.env.ENABLE_OTP_INIT_WITHDRAW_TESTS === "true",
  enableOtpApproveTxTests: process.env.ENABLE_OTP_APPROVE_TX_TESTS === "true",
  enableOtpDepositTxTests: process.env.ENABLE_OTP_DEPOSIT_TX_TESTS === "true",
  enableOtpWithdrawTxTests: process.env.ENABLE_OTP_WITHDRAW_TX_TESTS === "true",
};

/**
 * Test configuration based on current environment
 */
export function getTestConfig() {
  const env = getEnvironment();

  return {
    environment: env,
    apiBaseURL: env.apiBaseURL,
    timeouts: TEST_TIMEOUTS,
    testData: TEST_DATA,
    featureFlags: FEATURE_FLAGS,
    chainId: TEST_DATA.vaults.selected.chainId,

    // Helper methods
    isProduction: env.isProduction,
    isCI: isCI(),
    shouldRunTest: (flagName) => FEATURE_FLAGS[flagName] !== false,
  };
}

/**
 * Check if a test should be skipped based on feature flags
 * @param {string} flagName - Feature flag name
 * @returns {boolean} True if test should be skipped
 */
export function shouldSkipTest(flagName) {
  return FEATURE_FLAGS[flagName] === false;
}

/**
 * Helper to conditionally run tests based on feature flags
 * Usage: conditionalDescribe('enableVaultTests', 'Vault Tests', () => { ... })
 *
 * @param {string} flagName - Feature flag name
 * @param {string} description - Test suite description
 * @param {Function} fn - Test suite function
 */
export function conditionalDescribe(flagName, description, fn) {
  if (FEATURE_FLAGS[flagName]) {
    return describe(description, fn);
  } else {
    return describe.skip(description, fn);
  }
}

/**
 * Helper to conditionally run individual tests
 * Usage: conditionalIt('enableWriteTests', 'should create user', async () => { ... })
 *
 * @param {string} flagName - Feature flag name
 * @param {string} description - Test description
 * @param {Function} fn - Test function
 */
export function conditionalIt(flagName, description, fn) {
  if (FEATURE_FLAGS[flagName]) {
    return it(description, fn);
  } else {
    return it.skip(description, fn);
  }
}

/**
 * Print test configuration
 */
export function printTestConfig() {
  const config = getTestConfig();

  console.log(`
╔════════════════════════════════════════╗
║   Test Environment & Configuration     ║
╠════════════════════════════════════════╣
║ Environment: ${config.environment.displayName.padEnd(25)} ║
║ API URL: ${config.apiBaseURL.padEnd(29)} ║
║ Is Production: ${String(config.isProduction).padEnd(23)} ║
║ Is CI: ${String(config.isCI).padEnd(31)} ║
║ Selected chain ID: ${String(config.chainId).padEnd(19)} ║
║                                        ║
║ Feature Flags:                         ║
║ - Health Tests: ${String(FEATURE_FLAGS.enableHealthTests).padEnd(22)} ║
║ - Vault Tests: ${String(FEATURE_FLAGS.enableVaultTests).padEnd(23)} ║
║ - Write Tests: ${String(FEATURE_FLAGS.enableWriteTests).padEnd(23)} ║
║ - Passkey Tests: ${String(FEATURE_FLAGS.enablePasskeyTests).padEnd(21)} ║
║ - OTP Tests: ${String(FEATURE_FLAGS.enableOtpTests).padEnd(25)} ║
╚════════════════════════════════════════╝
  `);
}
