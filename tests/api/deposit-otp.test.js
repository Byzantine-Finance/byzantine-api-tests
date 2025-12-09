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
} from "../../utils/assertions.js";
import { saveOtpTransactionId } from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/transactions/tx-otp.json";

// Skip if OTP and Passkey tests are disabled
const describeDepositOtp =
  FEATURE_FLAGS.enableOtpTests && FEATURE_FLAGS.enableAuthenticatedTests
    ? describe
    : describe.skip;

describeDepositOtp("Initiate OTP Approve and Deposit transactions API", () => {
  // const testAccountId = TEST_DATA.accounts.testAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const depositAmount = txRequest.depositAmount;
  const sourceCurrency = txRequest.sourceCurrency;
  const testAccountId = "262195be-2da2-4745-adf8-b30f88053d9d";

  describe("POST /v1/query/init-approve-otp", () => {
    it(
      "should initiate approve and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
        };

        const response = await apiClient.post(
          endpoints.otp.initApprove(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "otpRequestResponse");
        assertHasFields(response.data, [
          "transaction_id",
          "accountId",
          "vaultAddr",
        ]);

        // Save approve OTP transactionId to tx-otp.json
        saveOtpTransactionId("approve", response.data.transaction_id);
      },
      getTimeout("api")
    );
  });

  describe("POST /v1/query/init-deposit-otp", () => {
    it(
      "should initiate deposit and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: depositAmount,
          sourceCurrency: sourceCurrency,
        };

        const response = await apiClient.post(
          endpoints.otp.initDeposit(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "otpRequestResponse");
        assertHasFields(response.data, ["transaction_id", "amount"]);

        // Save deposit OTP transactionId to tx-otp.json
        saveOtpTransactionId("deposit", response.data.transaction_id);
      },
      getTimeout("api")
    );

    it(
      "should reject deposit with invalid amount",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: "-100.00", // Invalid negative amount
          sourceCurrency: sourceCurrency,
        };

        const response = await apiClient.post(
          endpoints.otp.initDeposit(chainId),
          requestBody
        );

        assertError(response, 400);
      },
      getTimeout("api")
    );
  });
});
