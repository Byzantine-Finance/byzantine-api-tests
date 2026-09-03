/**
 * Account Management SDK Tests, what are tested:
 * - addBankAccount
 *
 * Note: These tests use authenticated endpoints and modify data
 * Enable with: ENABLE_AUTH_TESTS=true (write tests are on by default;
 * disable with ENABLE_WRITE_TESTS=false)
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */
import { describe, it } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
  conditionalIt,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertDataUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";
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

describeManagement("Account Management SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  // Use a KYC/KYB-approved account for bank account operations
  // Set TEST_BANK_ACCOUNT_TARGET_ID in .env to a verified account
  const testAccountId = TEST_DATA.accounts.bankAccountTargetId;

  describe("addBankAccount()", () => {
    // conditionalIt(
    //   it,
    //   "addUsBankAccount",
    //   "should add US ACH bank account and return typed response",
    //   async () => {
    //     const requestBody = {
    //       ...usAchAccount,
    //       accountId: testAccountId,
    //     };
    //     assertSchema(requestBody, "AddBankAccountRequest");

    //     const sdkResponse = await client.api.addBankAccount(requestBody, DUMMY_AUTH);

    //     assertSuccessWithSchema(sdkResponse, "LiquidationAddress");
    //     assertDataUuid(sdkResponse, "bankAccountId");

    //     saveUsBankAccountId(sdkResponse.data.bankAccountId);
    //   },
    //   getTimeout("api")
    // );

    conditionalIt(
      it,
      "addEurBankAccount",
      "should add EUR IBAN bank account and return typed response",
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

        const sdkResponse = await client.api.addBankAccount(
          requestBody,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "LiquidationAddress");
        assertDataUuid(sdkResponse, "bankAccountId");

        // Save bank account ID for use in other tests
        saveEurBankAccountId(sdkResponse.data.bankAccountId);
      },
      getTimeout("api"),
    );
  });
});
