/**
 * Withdrawal Transactions API Tests, what are tested:
 * - query/init-withdraw-otp
 * - query/get-withdraw-transaction-passkey
 *
 * Note: Passkey tests require WebAuthn signing capability
 * Enable with: ENABLE_PASSKEY_TESTS=true ENABLE_AUTH_TESTS=true
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
  assertHasFields,
  assertSchema,
} from "../../utils/assertions.js";
import { saveOtpTransactionId } from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/transactions/tx-otp.json" assert { type: "json" };

// Skip if OTP  tests are disabled
const describeWithdrawalOtp =
  FEATURE_FLAGS.enableOtpTests && FEATURE_FLAGS.enableAuthenticatedTests
    ? describe
    : describe.skip;

describeWithdrawalOtp("Initiate OTP withdrawal Transactions API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;

  // Withdrawal using OTP
  describe("POST /v1/query/init-withdraw-otp", () => {
    it(
      "should initiate withdraw and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: txRequest.withdrawAmount,
          destinationCurrency: txRequest.destinationCurrency,
        };

        assertSchema(requestBody, "withdrawRequest");

        const response = await apiClient.post(
          endpoints.otp.initWithdraw(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "otpRequestResponse");
        assertHasFields(response.data, ["transaction_id"]);

        // Save withdraw OTP transactionId to tx-otp.json
        saveOtpTransactionId("withdraw", response.data.transaction_id);
      },
      getTimeout("api")
    );
  });
});
