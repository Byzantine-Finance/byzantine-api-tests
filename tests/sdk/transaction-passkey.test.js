/**
 * Passkey transactions SDK Tests, what are tested:
 * - sendTransactionPasskey
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, beforeAll } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import { assertSuccessWithSchema, assertSchema } from "../../utils/sdk-assertions.js";
import { txRequest } from "../../fixtures/test-data/__generated__/generated-tx-passkey.json";

// Skip if OTP and Passkey tests are disabled
const describeTransactionPasskey = FEATURE_FLAGS.enablePasskeyTests
  ? describe
  : describe.skip;

describeTransactionPasskey(
  "Send Passkey Transactions SDK - Using Integrator SDK",
  () => {
    const client = getSdkClient();
    const chainId = TEST_DATA.vaults.selected.chainId;

    // Organize test data by transaction type
    const allTransactionTests = [
      {
        type: "Approve",
        bodyToSign: txRequest.approve.bodyToSign,
        transactionId: txRequest.approve.transactionId,
        webAuthnStamp: txRequest.approve.webAuthnStamp,
        flag: "enablePasskeyApproveTxTests",
      },
      {
        type: "Deposit",
        bodyToSign: txRequest.deposit.bodyToSign,
        transactionId: txRequest.deposit.transactionId,
        webAuthnStamp: txRequest.deposit.webAuthnStamp,
        flag: "enablePasskeyDepositTxTests",
      },
      {
        type: "Withdrawal",
        bodyToSign: txRequest.withdraw.bodyToSign,
        transactionId: txRequest.withdraw.transactionId,
        webAuthnStamp: txRequest.withdraw.webAuthnStamp,
        flag: "enablePasskeyWithdrawTxTests",
      },
    ];

    // Filter tests based on feature flags in test.config.js
    const transactionTests = allTransactionTests.filter(
      (test) => FEATURE_FLAGS[test.flag]
    );

    // Validate schemas before all tests
    beforeAll(() => {
      transactionTests.forEach((test) => {
        const requestBody = {
          signedBody: test.bodyToSign,
          transactionId: test.transactionId,
          webAuthnStamp: test.webAuthnStamp,
        };
        assertSchema(requestBody, "SendPasskeyTransactionRequestBody");
      });
    });

    describe("sendTransactionPasskey()", () => {
      it.each(transactionTests)(
        "should submit $type transaction with Passkey",
        async ({ bodyToSign, transactionId, webAuthnStamp }) => {
          const requestBody = {
            signedBody: bodyToSign,
            transactionId: transactionId,
            webAuthnStamp: webAuthnStamp,
          };

          const sdkResponse = await client.api.sendTransactionPasskey(
            chainId,
            requestBody
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "SendTransactionResponseBody");
        },
        getTimeout("api")
      );
    });
  }
);
