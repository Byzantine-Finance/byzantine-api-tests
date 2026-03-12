/**
 * OTP transactions API Tests, what are tested:
 * - submit/send-transaction-otp
 */

import { describe, it, beforeAll } from "vitest";
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
  assertSchema,
} from "../../utils/api-assertions.js";
import { txRequest } from "../../fixtures/test-data/__generated__/generated-tx-passkey.json";

// Skip if OTP and Passkey tests are disabled
const describeTransactionOtp = FEATURE_FLAGS.enableOtpTests
  ? describe
  : describe.skip;

describeTransactionOtp("Send OTP Transactions API", () => {
  const chainId = TEST_DATA.vaults.selected.chainId;

  // Define all possible tests with their feature flags
  const allTransactionTests = [
    {
      type: "Deposit",
      transactionId: txRequest.deposit.transactionId,
      otpEnvVar: "OTP_DEPOSIT",
      flag: "enableOtpDepositTxTests",
    },
    {
      type: "Withdraw",
      transactionId: txRequest.withdraw.transactionId,
      otpEnvVar: "OTP_WITHDRAW",
      flag: "enableOtpWithdrawTxTests",
    },
  ];

  // Filter tests based on feature flags in test.config.js
  const transactionTests = allTransactionTests.filter(
    (test) => FEATURE_FLAGS[test.flag]
  );

  // Validate schemas before all tests (only for enabled tests)
  beforeAll(() => {
    transactionTests.forEach((test) => {
      const requestBody = {
        transactionId: test.transactionId,
        otpCode: "000000",
      };
      assertSchema(requestBody, "SendOtpTransactionRequestBody");
    });
  });

  describe("POST /v1/submit/send-transaction-otp", () => {
    it.each(transactionTests)(
      "should submit $type transaction with OTP code",
      async ({ transactionId, otpEnvVar }) => {
        // Get OTP code from environment variable
        const otpCode = process.env[otpEnvVar];

        if (!otpCode || !otpCode.trim()) {
          throw new Error(`\n❌ OTP code required for ${otpEnvVar}!\n`);
        }

        const requestBody = {
          transactionId: transactionId,
          otpCode: otpCode.trim(),
        };

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
          transactionId: txRequest.deposit.transactionId,
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
