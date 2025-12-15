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
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";

// Import test data from fixtures
import usAchAccount from "../../fixtures/test-data/bank-accounts/us-ach-account.json" assert { type: "json" };
import eurIbanAccount from "../../fixtures/test-data/bank-accounts/eur-iban-account.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeManagement = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeManagement("Account Management API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;

  describe("POST /v1/submit/add-bank-account", () => {
    it(
      "should add US ACH bank account",
      async () => {
        const requestBody = {
          ...usAchAccount,
          accountId: testAccountId,
        };
        assertSchema(requestBody, "AddBankAccountRequest");

        const response = await apiClient.post(
          endpoints.management.addBankAccount,
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "OffRampAddress");
        assertValidUuid(response.data.bank_account_id);
      },
      getTimeout("api")
    );

    it(
      "should add EUR IBAN bank account",
      async () => {
        const requestBody = {
          ...eurIbanAccount,
          accountId: testAccountId,
        };

        assertSchema(requestBody, "AddBankAccountRequest");

        const response = await apiClient.post(
          endpoints.management.addBankAccount,
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "OffRampAddress");
      },
      getTimeout("api")
    );

    it(
      "should reject request without authentication",
      async () => {
        const requestBody = {
          ...usAchAccount,
          accountId: testAccountId,
        };

        const response = await apiClient.post(
          endpoints.management.addBankAccount,
          requestBody
          // No authenticated: true
        );

        assertError(response, 401);
      },
      getTimeout("api")
    );
  });
});
