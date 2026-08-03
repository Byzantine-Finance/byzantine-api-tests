/**
 * Transaction Data SDK Tests, what are tested:
 * - getTransaction
 * - getTransactions
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";
import { getSchema } from "../../utils/schemas.js";

// Sourced from the generated enums so they stay in lockstep with the spec.
const TRANSACTION_STATUSES = new Set(getSchema("TransactionStatus")?.enum ?? []);
const WITHDRAWAL_REQUEST_STATUSES = new Set(
  getSchema("FxhWithdrawalStatus")?.enum ?? [],
);

/**
 * `status` must always be a known TransactionStatus (the enum gained
 * `withdrawal_initiated` and `cancelled`), and queued FXH withdrawals carry an
 * optional `withdrawalRequest` (WithdrawalRequestView) — assert its shape only
 * when the API populates it.
 */
function assertTransactionStatusFields(transactions) {
  let withWithdrawalRequest = 0;

  for (const tx of transactions) {
    expect(TRANSACTION_STATUSES.has(tx.status)).toBe(true);

    if (tx.withdrawalRequest != null) {
      assertSchema(tx.withdrawalRequest, "WithdrawalRequestView");
      expect(WITHDRAWAL_REQUEST_STATUSES.has(tx.withdrawalRequest.status)).toBe(
        true,
      );
      withWithdrawalRequest++;
    }
  }

  console.log(
    `ℹ️  ${withWithdrawalRequest}/${transactions.length} transaction(s) carry a withdrawalRequest`,
  );
}

// Skip if transaction data tests are disabled
const describeTransactionData = FEATURE_FLAGS.enableTransactionDataTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testAccountId = process.env.GET_TRANSACTIONS_ACCOUNT_ID || passkeyData.accountId;
  let depositTransaction;
  let withdrawTransaction;

  describe("getTransactions()", () => {
    it(
      "should return array of transactions with expected structure",
      async () => {
        const sdkResponse = await client.api.getTransactions(testAccountId, DUMMY_AUTH);

        // Assert SDK behavior: array with expected data shape
        assertArrayWithSchema(sdkResponse, "TransactionView");
        assertTransactionStatusFields(sdkResponse.data);

        // Find first deposit transaction
        depositTransaction = sdkResponse.data.find((tx) => tx.type === "deposit");

        // Find first withdrawal transaction
        withdrawTransaction = sdkResponse.data.find(
          (tx) => tx.type === "withdraw"
        );
      },
      getTimeout("api")
    );
  });

  describe("getTransaction()", () => {
    it(
      "should get deposit transaction by transaction ID",
      async () => {
        const sdkResponse = await client.api.getTransaction(
          depositTransaction.transactionId,
          DUMMY_AUTH,
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "TransactionView");
        assertSuccessWithSchema(sdkResponse, "GetTransactionResponse");
        assertTransactionStatusFields([sdkResponse.data]);
      },
      getTimeout("api")
    );

    describe("getTransaction()", () => {
      it(
        "should get withdrawal transaction by transaction ID",
        async () => {
          const sdkResponse = await client.api.getTransaction(
            withdrawTransaction.transactionId,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "TransactionView");
          assertSuccessWithSchema(sdkResponse, "GetTransactionResponse");
          assertTransactionStatusFields([sdkResponse.data]);
        },
        getTimeout("api")
      );
    });
  });
});
