/**
 * Deposit Transactions API Tests, what are tested:
 * - query/init-approve-otp
 * - query/init-deposit-otp
 * - query/get-approve-transaction-passkey
 * - query/get-deposit-transaction-passkey
 *
 * Note: OTP tests require receiving real OTP codes via email
 * Enable with: ENABLE_OTP_TESTS=true ENABLE_AUTH_TESTS=true
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
  assertHasFields,
  assertError,
  assertSchema,
} from "../../utils/assertions.js";
import {
  saveBodyToSign,
} from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/transactions/tx-passkey.json";

// Skip if  Passkey tests are disabled
const describeDepositPasskey =
  FEATURE_FLAGS.enablePasskeyTests &&
  FEATURE_FLAGS.enableAuthenticatedTests
    ? describe
    : describe.skip;

describeDepositPasskey("Initiate Passkey Approve and Deposit transactions API", () => {
  // const testAccountId = TEST_DATA.accounts.testAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const depositAmount = txRequest.depositAmount;
  const sourceCurrency = txRequest.sourceCurrency;
  const testAccountId = "262195be-2da2-4745-adf8-b30f88053d9d";

  // Deposit using Passkey
  describe("POST /v1/query/get-approve-transaction-passkey", () => {
    it(
      "should get approve transaction body to sign",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
        }

        assertSchema(requestBody, "ApproveRequestBody");

        const response = await apiClient.post(
          endpoints.passkey.getApproveTransaction(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "PasskeyTxRequestResponse");
        assertHasFields(response.data, ["bodyToSign", "transactionId"]);

        // Save approve bodyToSign and transactionId to tx-passkey.json
        saveBodyToSign("approve", response.data.bodyToSign, response.data.transactionId);
      },
      getTimeout("api")
    );

    it(
      "should reject invalid chain ID",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
        }

        assertSchema(requestBody, "ApproveRequestBody");

        const response = await apiClient.post(
          endpoints.passkey.getApproveTransaction(99999), // Invalid chain ID
          requestBody
        );

        assertError(response, 400);
      },
      getTimeout("api")
    );
  });

  describe("POST /v1/query/get-deposit-transaction-passkey", () => {
    it(
      "should get deposit transaction body to sign",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: depositAmount,
          sourceCurrency: sourceCurrency,
        }

        assertSchema(requestBody, "DepositRequestBody");

        const response = await apiClient.post(
          endpoints.passkey.getDepositTransaction(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "PasskeyTxRequestResponse");
        assertHasFields(response.data, ["bodyToSign", "transactionId"]);

        // Save deposit bodyToSign and transactionId to tx-passkey.json
        saveBodyToSign("deposit", response.data.bodyToSign, response.data.transactionId);
      },
      getTimeout("api")
    );
  });
});
