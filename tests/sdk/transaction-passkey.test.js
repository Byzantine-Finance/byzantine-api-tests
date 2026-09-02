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
        flag: "enablePasskeyActivateTxTests",
        chainId: 8453,
      },
      {
        type: "ActivateAccountETH",
        bodyToSign: txRequest.activateAccountEth.bodyToSign,
        transactionId: txRequest.activateAccountEth.transactionId,
        webAuthnStamp: txRequest.activateAccountEth.webAuthnStamp,
        flag: "enablePasskeyActivateETHTxTests",
        chainId: 1,
      },
      {
        type: "Deposit",
        bodyToSign: txRequest.deposit.bodyToSign,
        transactionId: txRequest.deposit.transactionId,
        webAuthnStamp: txRequest.deposit.webAuthnStamp,
        flag: "enablePasskeyDepositTxTests",
        chainId,
      },
      {
        type: "Withdrawal",
        bodyToSign: txRequest.withdraw.bodyToSign,
        transactionId: txRequest.withdraw.transactionId,
        webAuthnStamp: txRequest.withdraw.webAuthnStamp,
        flag: "enablePasskeyWithdrawTxTests",
        chainId,
      },
      {
        type: "VaultUpgrade",
        bodyToSign: txRequest.vaultUpgrade?.bodyToSign,
        transactionId: txRequest.vaultUpgrade?.transactionId,
        webAuthnStamp: txRequest.vaultUpgrade?.webAuthnStamp,
        flag: "enablePasskeyVaultUpgradeTxTests",
        chainId: 8453,
      },
      {
        // Cancellation of a queued withdrawal — the payload comes from
        // get-cancel-withdrawal-payload-passkey, signed like any other raw payload
        type: "CancelWithdrawal",
        bodyToSign: txRequest.cancelWithdrawal?.bodyToSign,
        transactionId: txRequest.cancelWithdrawal?.transactionId,
        webAuthnStamp: txRequest.cancelWithdrawal?.webAuthnStamp,
        flag: "enablePasskeyCancelWithdrawTxTests",
        chainId,
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
      // Ensure vitest doesn't error on "no tests found" when all TX flags are disabled
      if (transactionTests.length === 0) {
        it("should have passkey TX tests enabled to run", () => {
          console.log(
            "No passkey TX tests enabled. Enable ENABLE_PASSKEY_*_TX_TESTS flags to run.",
          );
        });
      }

      it.each(transactionTests)(
        "should sign $type payload with Passkey",
        async ({ bodyToSign, transactionId, webAuthnStamp, chainId: txChainId }) => {
          const requestBody = {
            signedBody: bodyToSign,
            transactionId: transactionId,
            webAuthnStamp: webAuthnStamp,
          };

          assertSchema(requestBody, "SignPayloadRequestBodyPasskey");

          const sdkResponse = await client.api.signPayloadPasskey(
            txChainId,
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
