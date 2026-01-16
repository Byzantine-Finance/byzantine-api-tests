/**
 * Passkey transactions API Tests, what are tested:
 * - submit/sign-payload-passkey
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
  assertSchema,
} from "../../utils/api-assertions.js";
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

// Skip if OTP and Passkey tests are disabled
const describeTransactionPasskey = FEATURE_FLAGS.enablePasskeyTests
  ? describe
  : describe.skip;

describeTransactionPasskey("Send Passkey Transactions API", () => {
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
      assertSchema(requestBody, "SignPayloadRequestBodyPasskey");
    });
  });

  describe("POST /v1/submit/sign-payload-passkey", () => {
    it.each(transactionTests)(
      "should sign $type payload with Passkey",
      async ({ bodyToSign, transactionId, webAuthnStamp }) => {
        const requestBody = {
          signedBody: bodyToSign,
          transactionId: transactionId,
          webAuthnStamp: webAuthnStamp,
        };

        assertSchema(requestBody, "SignPayloadRequestBodyPasskey");

        const response = await apiClient.post(
          endpoints.passkey.signPayloadPasskey(chainId),
          requestBody,
          { 
            authenticated: true,
            timeout: getTimeout("integration")
          }
        );

        assertSuccessWithSchema(response, "SendTransactionResponseBody");
      },
      getTimeout("integration")
    );
  });
});
