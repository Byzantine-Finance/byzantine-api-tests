/**
 * OTP transactions SDK Tests, what are tested:
 * - sendTransactionOtp
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, beforeAll } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

// Skip if OTP tests are disabled
const describeTransactionOtp = FEATURE_FLAGS.enableOtpTests
  ? describe
  : describe.skip;

describeTransactionOtp(
  "Send OTP Transactions SDK - Using Integrator SDK",
  () => {
    const client = getSdkClient();
    const chainId = TEST_DATA.vaults.selected.chainId;

    // Define all possible tests with their feature flags
    const allTransactionTests = [
      {
        type: "Approve",
        transactionId: txRequest.approve.transactionId,
        otpEnvVar: "OTP_APPROVE",
        flag: "enableOtpApproveTxTests",
      },
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
      (test) => FEATURE_FLAGS[test.flag],
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

    describe("sendTransactionOtp()", () => {
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

          const sdkResponse = await client.api.sendTransactionOtp(
            chainId,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "SendTransactionResponseBody");
        },
        getTimeout("api"),
      );

      it(
        "should reject invalid OTP code",
        async () => {
          const requestBody = {
            transactionId: txRequest.approve.transactionId,
            otpCode: "000000", // Invalid OTP
          };

          const sdkResponse = await client.api.sendTransactionOtp(
            chainId,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK error handling
          assertError(sdkResponse);
        },
        getTimeout("api"),
      );
    });
  },
);
