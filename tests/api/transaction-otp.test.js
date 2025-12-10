/**
 * Transactions API Tests, what are tested:
 * - submit/send-transaction-otp
 * - submit/send-transaction-passkey
 * - query/get-transaction
 * - query/get-transactions
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
  assertSuccessWithArraySchema,
  assertError,
  assertSchema,
} from "../../utils/assertions.js";
import { txRequest } from "../../fixtures/test-data/transactions/tx-passkey.json";

// Skip if OTP and Passkey tests are disabled
const describeTransactionOtp =
  FEATURE_FLAGS.enableOtpTests &&
  FEATURE_FLAGS.enableAuthenticatedTests
    ? describe
    : describe.skip;

describeTransactionOtp("Send OTP Transactions API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testApproveTransactionId = txRequest.approve.transactionId;
  const testDepositTransactionId = txRequest.deposit.transactionId;
  const chainId = TEST_DATA.vaults.selected.chainId;

  describe("POST /v1/submit/send-transaction-otp", () => {
    it(
      "should submit Approve transaction with OTP code",
      async () => {
        // Get OTP code from environment variable
        const otpCode = process.env.OTP_APPROVE;

        if (!otpCode || !otpCode.trim()) {
          throw new Error("\n❌ OTP code required!\n");
        }

        const requestBody = {
          transactionId: testApproveTransactionId,
          otpCode: otpCode.trim(),
        };

        assertSchema(requestBody, "SendOtpTransactionRequestBody");

        const response = await apiClient.post(
          endpoints.otp.sendTransaction(chainId),
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "SendTransactionResponseBody");
      },
      getTimeout("api")
    );

    it(
      "should submit Deposit transaction with OTP code",
      async () => {
        // Get OTP code from environment variable
        const otpCode = process.env.OTP_DEPOSIT;

        if (!otpCode || !otpCode.trim()) {
          throw new Error("\n❌ OTP code required!\n");
        }

        const requestBody = {
          transactionId: testDepositTransactionId,
          otpCode: otpCode.trim(),
        };

        assertSchema(requestBody, "SendOtpTransactionRequestBody");

        const response = await apiClient.post(
          endpoints.otp.sendTransaction(chainId),
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "SendTransactionResponseBody");
      },
      getTimeout("api")
    );

    it(
      "should reject invalid OTP code",
      async () => {
        const requestBody = {
          transactionId: testApproveTransactionId,
          otpCode: "000000", // Invalid OTP
        };

        const response = await apiClient.post(
          endpoints.otp.sendTransaction(chainId),
          requestBody,
          { authenticated: true }
        );

        assertError(response, 400);
      },
      getTimeout("api")
    );
  });
});
