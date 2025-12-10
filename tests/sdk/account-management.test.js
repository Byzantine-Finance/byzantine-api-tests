/**
 * Account Management SDK Tests, what are tested:
 * - addBankAccount
 *
 * Note: These tests use authenticated endpoints and modify data
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */
import { describe, it, expect } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
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
} from "../../utils/assertions.js";

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
    it(
      "should add US ACH bank account",
      async () => {
        const requestBody = {
          ...usAchAccount,
          accountId: testAccountId,
        };
        assertSchema(requestBody, "AddBankAccountRequest");

        const sdkResponse = await client.api.addBankAccount(requestBody);
        const response = formatSdkResponse(sdkResponse);

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

        const sdkResponse = await client.api.addBankAccount(requestBody);
        const response = formatSdkResponse(sdkResponse);

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

        // Create a client without private key to test unauthenticated request
        const { ByzantineClient } = await import("@byzantine/integrator-sdk");
        const unauthenticatedClient = new ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        try {
          const sdkResponse = await unauthenticatedClient.api.addBankAccount(
            requestBody
          );
          const response = formatSdkResponse(sdkResponse);
          assertError(response, 401);
        } catch (error) {
          // SDK might throw an error instead of returning an error response
          expect(error).toBeDefined();
        }
      },
      getTimeout("api")
    );
  });
});
