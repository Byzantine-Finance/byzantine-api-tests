/**
 * Test Data Persistence Utility
 * Saves test data (user IDs, account IDs, etc.) generated during test runs
 * so they can be reused by other tests
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the test data file
const TEST_DATA_FILE = join(
  __dirname,
  "../fixtures/test-data/__generated__/generated-accounts.json"
);

/**
 * Default test data structure
 */
const DEFAULT_TEST_DATA = {
  accounts: {
    testUserId: null,
    testAccountId: null,
    testEntityId: null,
    testEntityAccountId: null,
  },
  // Metadata
  lastUpdated: null,
  lastUpdatedBy: "account-creation.test.js",
};

/**
 * Save test data to file
 * @param {object} data - Test data to save
 */
function saveTestData(data) {
  try {
    const dataToSave = {
      ...data,
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(TEST_DATA_FILE, JSON.stringify(dataToSave, null, 2), "utf-8");
  } catch (error) {
    console.error(
      `Failed to save test data to ${TEST_DATA_FILE}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Update specific test data fields
 * @param {object} updates - Partial test data object with fields to update
 * @param {string} source - Source of the update (e.g., test file name)
 */
function updateTestData(updates, source = "unknown") {
  const currentData = loadTestData();
  const updatedData = {
    ...currentData,
    accounts: {
      ...currentData.accounts,
      ...(updates.accounts || {}),
    },
    lastUpdatedBy: source,
  };

  saveTestData(updatedData);
  return updatedData;
}

/**
 * Load test data from file
 * @returns {object} Test data object
 */
export function loadTestData() {
  if (!existsSync(TEST_DATA_FILE)) {
    // Create file with default structure
    saveTestData(DEFAULT_TEST_DATA);
    return DEFAULT_TEST_DATA;
  }

  try {
    const content = readFileSync(TEST_DATA_FILE, "utf-8");
    const data = JSON.parse(content);
    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_TEST_DATA,
      ...data,
      accounts: {
        ...DEFAULT_TEST_DATA.accounts,
        ...(data.accounts || {}),
      },
    };
  } catch (error) {
    console.warn(
      `Failed to load test data from ${TEST_DATA_FILE}:`,
      error.message
    );
    return DEFAULT_TEST_DATA;
  }
}

/**
 * Save user IDs after successful user creation
 * @param {string} userId - User ID
 * @param {string} accountId - Account ID
 */
export function saveUserIds(userId, accountId) {
  updateTestData(
    {
      accounts: {
        testUserId: userId,
        testAccountId: accountId,
      },
    },
    "account-creation.test.js"
  );
  console.log(`✅ Saved user IDs: userId=${userId}, accountId=${accountId}`);
}

/**
 * Save entity IDs after successful entity creation
 * @param {string} entityId - Entity ID
 * @param {string} accountId - Account ID
 */
export function saveEntityIds(entityId, accountId) {
  updateTestData(
    {
      accounts: {
        testEntityId: entityId,
        testEntityAccountId: accountId,
      },
    },
    "account-creation.test.js"
  );
  console.log(
    `✅ Saved entity IDs: entityId=${entityId}, accountId=${accountId}`
  );
}

/**
 * Save bodyToSign and transactionId to generated-tx-passkey.json
 * @param {string} transactionType - Type of transaction: "approve", "deposit", "withdraw", or "activateAccount"
 * @param {object} bodyToSign - The bodyToSign object from the API response
 * @param {string} transactionId - The transaction ID from the API response
 */
export function saveBodyToSign(transactionType, bodyToSign, transactionId) {
  const TX_REQUEST_FILE = join(
    __dirname,
    "../fixtures/test-data/__generated__/generated-tx-passkey.json"
  );

  // Validate transaction type
  const validTypes = ["approve", "deposit", "withdraw", "activateAccount"];
  if (!validTypes.includes(transactionType)) {
    throw new Error(
      `Invalid transaction type: ${transactionType}. Must be one of: ${validTypes.join(
        ", "
      )}`
    );
  }

  try {
    // Read current file
    const currentData = existsSync(TX_REQUEST_FILE)
      ? JSON.parse(readFileSync(TX_REQUEST_FILE, "utf-8"))
      : {};

    // Extract data - all transaction types now use SignRawPayloadParams structure
    const bodyToSignData = {
      type: bodyToSign.type,
      timestampMs: bodyToSign.timestampMs,
      organizationId: bodyToSign.organizationId,
      parameters: {
        signWith: bodyToSign.parameters.signWith,
        payload: bodyToSign.parameters.payload,
        encoding: bodyToSign.parameters.encoding,
        hashFunction: bodyToSign.parameters.hashFunction,
      },
    };

    // Update the appropriate section based on transaction type
    const updatedData = {
      ...currentData,
      [transactionType]: {
        bodyToSign: bodyToSignData,
        transactionId: transactionId,
      },
    };

    // Write back to file
    writeFileSync(
      TX_REQUEST_FILE,
      JSON.stringify(updatedData, null, 2),
      "utf-8"
    );
    console.log(
      `✅ Saved ${transactionType} bodyToSign and transactionId to generated-tx-passkey.json`
    );
  } catch (error) {
    console.error(
      `Failed to save ${transactionType} bodyToSign to ${TX_REQUEST_FILE}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Save OTP transaction ID to generated-tx-otp.json
 * @param {string} transactionType - Type of transaction: "approve", "deposit", or "withdraw"
 * @param {string} transactionId - The transaction ID from the API response
 */
export function saveOtpTransactionId(transactionType, transactionId) {
  const TX_OTP_FILE = join(
    __dirname,
    "../fixtures/test-data/__generated__/generated-tx-otp.json"
  );

  // Validate transaction type
  const validTypes = ["approve", "deposit", "withdraw"];
  if (!validTypes.includes(transactionType)) {
    throw new Error(
      `Invalid transaction type: ${transactionType}. Must be one of: ${validTypes.join(
        ", "
      )}`
    );
  }

  try {
    // Read current file
    const currentData = existsSync(TX_OTP_FILE)
      ? JSON.parse(readFileSync(TX_OTP_FILE, "utf-8"))
      : {};

    // Update the appropriate section based on transaction type
    const updatedData = {
      ...currentData,
      [transactionType]: {
        transactionId: transactionId,
      },
    };

    // Preserve other fields like depositAmount, sourceCurrency, etc.
    if (currentData.depositAmount) {
      updatedData.depositAmount = currentData.depositAmount;
    }
    if (currentData.sourceCurrency) {
      updatedData.sourceCurrency = currentData.sourceCurrency;
    }
    if (currentData.withdrawAmount) {
      updatedData.withdrawAmount = currentData.withdrawAmount;
    }
    if (currentData.destinationCurrency) {
      updatedData.destinationCurrency = currentData.destinationCurrency;
    }

    // Write back to file
    writeFileSync(TX_OTP_FILE, JSON.stringify(updatedData, null, 4), "utf-8");
    console.log(`✅ Saved ${transactionType} OTP transactionId to generated-tx-otp.json`);
  } catch (error) {
    console.error(
      `Failed to save ${transactionType} OTP transactionId to ${TX_OTP_FILE}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Save active vaults to generated-vaults.json
 * Filters vaults with is_active: true and saves them with vault_address, chain_id, and is_active
 * @param {Array} vaults - Array of vault objects from the API response
 */
export function saveActiveVaults(vaults) {
  const VAULTS_FILE = join(
    __dirname,
    "../fixtures/test-data/__generated__/generated-vaults.json"
  );

  try {
    // Filter vaults with is_active: true
    const activeVaults = vaults
      .filter((vault) => vault.is_active === true)
      .map((vault) => ({
        vault_address: vault.vault_address,
        chain_id: vault.chain_id,
        is_active: vault.is_active,
      }));

    // Write to file
    writeFileSync(
      VAULTS_FILE,
      JSON.stringify(activeVaults, null, 2),
      "utf-8"
    );
    console.log(
      `✅ Saved ${activeVaults.length} active vault(s) to generated-vaults.json`
    );
  } catch (error) {
    console.error(
      `Failed to save active vaults to ${VAULTS_FILE}:`,
      error.message
    );
    throw error;
  }
}
