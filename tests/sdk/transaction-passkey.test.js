/**
 * Passkey transactions SDK Tests, what are tested:
 * - signPayloadPasskey
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
import { assertSuccessWithSchema, assertSchema } from "../../utils/sdk-assertions.js";
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

// Skip if Passkey tests are disabled
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
        type: "ActivateAccount",
        bodyToSign: txRequest.activateAccount.bodyToSign,
        transactionId: txRequest.activateAccount.transactionId,
        webAuthnStamp: txRequest.activateAccount.webAuthnStamp,
        flag: "enableSignActivateAccount",
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
      (test) => FEATURE_FLAGS[test.flag],
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

    describe("signPayloadPasskey()", () => {
      it.each(transactionTests)(
        "should sign $type payload with Passkey",
        async ({ bodyToSign, transactionId, webAuthnStamp }) => {
          const requestBody = {
            signedBody: bodyToSign,
            transactionId: transactionId,
            webAuthnStamp: webAuthnStamp,
          };

          assertSchema(requestBody, "SignPayloadRequestBodyPasskey");

          const sdkResponse = await client.api.signPayloadPasskey(
            chainId,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "SendTransactionResponseBody");
        },
        getTimeout("integration"),
      );
    });
  },
);
