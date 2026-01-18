/**
 * Test Configuration
 * Test-specific settings, test data, and feature flags
 */

import dotenv from "dotenv";
import { getEnvironment, isProduction, isCI } from "./environments.js";
import { loadTestData } from "../utils/test-data-persistence.js";
import vaultData from "../fixtures/test-data/__generated__/generated-vaults.json";

dotenv.config();

/**
 * Test Timeouts (in milliseconds)
 * These are for Vitest test execution, not API request timeouts
 */
export const TEST_TIMEOUTS = {
  default: 10000, // 10 seconds
  api: 15000, // 15 seconds for API tests
  integration: 30000, // 30 seconds for integration tests
  e2e: 60000, // 60 seconds for E2E tests
  passkey: 90000, // 90 seconds for Passkey tests

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
 * 1. Generated IDs from test runs (fixtures/test-data/__generated__/generated-accounts.json)
 * 2. Environment variables
 * 3. Default values (for vaults)
 *
 */
const generatedTestData = loadTestData();
const useEthereum = process.env.CHAIN?.toUpperCase() === "ETH";

/**
 * Select vault based on currency type and chain ID
 * Uses is_asynchronous field to identify EUR (true) vs USD (false) vaults
 * @param {boolean} useEurVault - Whether to use EUR vault (default: false for USD)
 * @param {number} chainId - Chain ID (1 for ETH, 8453 for BASE)
 * Notes:
 * - Vaults are identified by is_asynchronous field:
 *   - is_asynchronous: true = EUR vault
 *   - is_asynchronous: false (or undefined) = USD vault
 * - Vaults are filtered by chain_id and is_active status
 */
function selectVault(useEurVault, chainId) {
  const vault = vaultData.find(
    (v) =>
      v.is_active === true &&
      v.chain_id === chainId &&
      (useEurVault
        ? v.is_asynchronous === true // EUR vault
        : !v.is_asynchronous) // USD vault (is_asynchronous is false or undefined)
  );

  if (!vault) {
    return null;
  }

  return {
    address: vault.vault_address,
    chainId: vault.chain_id,
  };
}

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

  // Vault currency selection
  useEurVault: process.env.EUR_VAULT === "true",

  // WebAuthn/Passkey tests
  enablePasskeyTests: process.env.ENABLE_PASSKEY_TESTS === "true",
  enablePasskeyInitApproveTests:
    process.env.ENABLE_PASSKEY_INIT_APPROVE_TESTS === "true",
  enablePasskeyInitDepositTests:
    process.env.ENABLE_PASSKEY_INIT_DEPOSIT_TESTS === "true",
  enablePasskeyInitWithdrawTests:
    process.env.ENABLE_PASSKEY_INIT_WITHDRAW_TESTS === "true",
  enablePasskeyApproveTxTests:
    process.env.ENABLE_PASSKEY_APPROVE_TX_TESTS === "true",
  enablePasskeyDepositTxTests:
    process.env.ENABLE_PASSKEY_DEPOSIT_TX_TESTS === "true",
  enablePasskeyWithdrawTxTests:
    process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true",

  enableSignActivateAccount:
    process.env.ENABLE_SIGN_ACTIVATE_ACCOUNT === "true",

  // Account creation tests
  createUser: process.env.CREATE_USER !== "false", // Enabled by default
  createEntity: process.env.CREATE_ENTITY !== "false", // Enabled by default

  // Transaction data tests
  enableTransactionDataTests: process.env.ENABLE_TRANSACTION_DATA_TESTS !== "false", // Enabled by default

  // Bank account tests
  addUsBankAccount: process.env.ADD_US_BANK_ACCOUNT !== "false", // Enabled by default
  addEurBankAccount: process.env.ADD_EUR_BANK_ACCOUNT !== "false", // Enabled by default

  // OTP tests (require real OTP codes)
  enableOtpTests: process.env.ENABLE_OTP_TESTS === "true",
  enableOtpInitApproveTests:
    process.env.ENABLE_OTP_INIT_APPROVE_TESTS === "true",
  enableOtpInitDepositTests:
    process.env.ENABLE_OTP_INIT_DEPOSIT_TESTS === "true",
  enableOtpInitWithdrawTests:
    process.env.ENABLE_OTP_INIT_WITHDRAW_TESTS === "true",
  enableOtpApproveTxTests: process.env.ENABLE_OTP_APPROVE_TX_TESTS === "true",
  enableOtpDepositTxTests: process.env.ENABLE_OTP_DEPOSIT_TX_TESTS === "true",
  enableOtpWithdrawTxTests: process.env.ENABLE_OTP_WITHDRAW_TX_TESTS === "true",
};

// Determine chain ID and currency preference
const targetChainId = useEthereum ? 1 : 8453;
const useEurVault = FEATURE_FLAGS.useEurVault;

// Select vault with priority: env vars > currency-based selection > fallback
const selectedVault =
  (useEthereum && process.env.TEST_VAULT_ETH) ||
  (!useEthereum && process.env.TEST_VAULT_BASE)
    ? {
        address:
          process.env[useEthereum ? "TEST_VAULT_ETH" : "TEST_VAULT_BASE"],
        chainId: targetChainId,
      }
    : selectVault(useEurVault, targetChainId) || { // Fallback: find any active vault for the chain
        address: vaultData.find(
          (v) => v.chain_id === targetChainId && v.is_active
        )?.vault_address,
        chainId: targetChainId,
      };

export const TEST_DATA = {
  vaults: {
    selected: selectedVault,
    // Expose helper for tests that need to know currency type
    currency: useEurVault ? "EUR" : "USD",
  },

  accounts: {
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
 * Usage: conditionalIt('enableWriteTests', 'should create user', async () => { ... }, 15000)
 * Note: Pass 'it' from vitest in test files
 *
 * @param {Function} it - The 'it' function from vitest
 * @param {string} flagName - Feature flag name
 * @param {string} description - Test description
 * @param {Function} fn - Test function
 * @param {number} timeout - Optional timeout
 */
export function conditionalIt(it, flagName, description, fn, timeout) {
  if (FEATURE_FLAGS[flagName]) {
    return it(description, fn, timeout);
  } else {
    return it.skip(description, fn, timeout);
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
