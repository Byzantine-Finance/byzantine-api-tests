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
const describeTransactionPasskey =
  FEATURE_FLAGS.enablePasskeyTests && FEATURE_FLAGS.enableAuthenticatedTests
    ? describe
    : describe.skip;

describeTransactionPasskey("Send Passkey Transactions API", () => {
  const testApproveBody = txRequest.approve.bodyToSign;
  const testDepositBody = txRequest.deposit.bodyToSign;
  const testWithdrawBody = txRequest.withdraw.bodyToSign;
  const testApproveTransactionId = txRequest.approve.transactionId;
  const testDepositTransactionId = txRequest.deposit.transactionId;
  const testWithdrawTransactionId = txRequest.withdraw.transactionId;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const approveStamp = txRequest.approve.webAuthnStamp;
  const depositStamp = txRequest.deposit.webAuthnStamp;
  const withdrawStamp = txRequest.withdraw.webAuthnStamp;

  describe("POST /v1/submit/send-transaction-passkey", () => {
    it(
      "should submit Approve transaction with Patsskey",
      async () => {
        const requestBody = {
          signedBody: testApproveBody,
          transactionId: testApproveTransactionId,
          webAuthnStamp: approveStamp,
        };

        const response = await apiClient.post(
          endpoints.passkey.sendTransaction(chainId),
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "sendTransactionResponse");
      },
      getTimeout("api")
    );
  });

  describe("POST /v1/submit/send-transaction-passkey", () => {
    it(
      "should submit Deposit transaction with Passkey",
      async () => {
        const requestBody = {
          signedBody: testDepositBody,
          transactionId: testDepositTransactionId,
          webAuthnStamp: depositStamp,
        };

        const response = await apiClient.post(
          endpoints.passkey.sendTransaction(chainId),
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "sendTransactionResponse");
      },
      getTimeout("api")
    );
  });

  describe("POST /v1/submit/send-transaction-passkey", () => {
    it(
      "should submit Withdrawal transaction with Passkey",
      async () => {
        const requestBody = {
          signedBody: testWithdrawBody,
          transactionId: testWithdrawTransactionId,
          webAuthnStamp: withdrawStamp,
        };

        const response = await apiClient.post(
          endpoints.passkey.sendTransaction(chainId),
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "sendTransactionResponse");
      },
      getTimeout("api")
    );
  });
});
