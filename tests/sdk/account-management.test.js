/**
 * Account Management SDK Tests, what are tested:
 * - addBankAccount
 *
 * Note: These tests use authenticated endpoints and modify data
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
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
  assertError,
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
  const testAccountId = TEST_DATA.accounts.testAccountId;

  describe("addBankAccount()", () => {
    conditionalIt(
      it,
      "addUsBankAccount",
      "should add US ACH bank account and return typed response",
      async () => {
        const requestBody = {
          ...usAchAccount,
          accountId: testAccountId,
        };
        assertSchema(requestBody, "AddBankAccountRequest");

        const sdkResponse = await client.api.addBankAccount(requestBody, DUMMY_AUTH);

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "LiquidationAddress");
        assertDataUuid(sdkResponse, "bankAccountId");

        // Save bank account ID for use in other tests
        saveUsBankAccountId(sdkResponse.data.bankAccountId);
      },
      getTimeout("api")
    );

    conditionalIt(
      it,
      "addEurBankAccount",
      "should add EUR IBAN bank account and return typed response",
      async () => {
        const requestBody = {
          ...eurIbanAccount,
          accountId: testAccountId,
        };

        assertSchema(requestBody, "AddBankAccountRequest");

        const sdkResponse = await client.api.addBankAccount(requestBody, DUMMY_AUTH);

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "LiquidationAddress");
        assertDataUuid(sdkResponse, "bankAccountId");

        // Save bank account ID for use in other tests
        saveEurBankAccountId(sdkResponse.data.bankAccountId);
      },
      getTimeout("api")
    );

    it(
      "should handle authentication errors correctly",
      async () => {
        const requestBody = {
          ...usAchAccount,
          accountId: testAccountId,
        };

        // Create a client without private key to test unauthenticated request
        const { ByzantineClient } = await import("@byzantine/integrator-sdk");
        const unauthenticatedClient = new ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        const sdkResponse = await unauthenticatedClient.api.addBankAccount(
          requestBody,
          DUMMY_AUTH,
        );

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });
});
