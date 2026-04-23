/**
 * Account Management API Tests, what are tested:
 * - submit/add-bank-account
 *
 * Note: These tests use authenticated endpoints and modify data
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 */
import { describe, it } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
  conditionalIt,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";
import {
  saveUsBankAccountId,
  saveEurBankAccountId,
} from "../../utils/test-data-persistence.js";

// Import test data from fixtures
import usAchAccount from "../../fixtures/test-data/bank-accounts/us-ach-account.json" assert { type: "json" };
import eurIbanAccount from "../../fixtures/test-data/bank-accounts/eur-iban-account.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeManagement = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeManagement("Account Management API", () => {
  // Use a KYC/KYB-approved account for bank account operations
  // Set TEST_BANK_ACCOUNT_TARGET_ID in .env to a verified account
  const testAccountId = TEST_DATA.accounts.bankAccountTargetId;

  describe("POST /v1/submit/add-bank-account", () => {
    // conditionalIt(
    //   it,
    //   "addUsBankAccount",
    //   "should add US ACH bank account",
    //   async () => {
    //     const requestBody = {
    //       ...usAchAccount,
    //       accountId: testAccountId,
    //     };
    //     assertSchema(requestBody, "AddBankAccountRequest");

    //     const response = await apiClient.post(
    //       endpoints.management.addBankAccount,
    //       requestBody,
    //       { authenticated: true }
    //     );

    //     assertSuccessWithSchema(response, "LiquidationAddress");
    //     assertValidUuid(response.data.bankAccountId);

    //     // Save bank account ID for use in other tests
    //     saveUsBankAccountId(response.data.bankAccountId);
    //   },
    //   getTimeout("api")
    // );

    conditionalIt(
      it,
      "addEurBankAccount",
      "should add EUR IBAN bank account",
      async () => {
        // Generate unique valid IBAN to avoid duplicate_external_account error
        // DE IBAN = DE + 2 check digits + 8 bank code + 10 account number (22 chars total)
        const bankCode = "37040044";
        const uniqueAccount = String(Date.now()).slice(-10);
        // Calculate IBAN check digits: move "DE00" to end, convert letters to numbers (D=13,E=14), mod 97
        const numericStr = bankCode + uniqueAccount + "131400";
        const remainder = BigInt(numericStr) % 97n;
        const checkDigits = String(98n - remainder).padStart(2, "0");
        const uniqueIban = `DE${checkDigits}${bankCode}${uniqueAccount}`;

        const requestBody = {
          ...eurIbanAccount,
          accountId: testAccountId,
          ibanBankAccountDetails: {
            ...eurIbanAccount.ibanBankAccountDetails,
            accountNumber: uniqueIban,
          },
        };

        assertSchema(requestBody, "AddBankAccountRequest");

        const response = await apiClient.post(
          endpoints.management.addBankAccount,
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "LiquidationAddress");
        assertValidUuid(response.data.bankAccountId);

        // Save bank account ID for use in other tests
        saveEurBankAccountId(response.data.bankAccountId);
      },
      getTimeout("api")
    );
  });
});
