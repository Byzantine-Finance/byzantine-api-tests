/**
 * Transaction Data API Tests, what are tested:
 * - query/get-transaction
 * - query/get-transactions
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertSchema,
  assertError,
} from "../../utils/api-assertions.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";

// Deposit/withdrawal variants of TransactionTypeView. An account may only ever
// have on/off-ramp flavours, so the by-ID tests match on the whole family.
const DEPOSIT_TYPES = new Set(["deposit", "onramp_deposit", "onramp"]);
const WITHDRAW_TYPES = new Set(["withdraw", "withdraw_offramp", "offramp"]);

/**
 * TransactionView gained `destinationAddress` and an embedded `account`
 * (AccountMinimalView). Both are optional/nullable, so only assert the shape
 * when the API actually populates them.
 */
function assertNewTransactionViewFields(transactions) {
  let withAccount = 0;
  let withDestination = 0;

  for (const tx of transactions) {
    if (tx.destinationAddress != null) {
      expect(typeof tx.destinationAddress).toBe("string");
      withDestination++;
    }
    if (tx.account != null) {
      assertSchema(tx.account, "AccountMinimalView");
      expect(typeof tx.account.accountName).toBe("string");
      withAccount++;
    }
  }

  console.log(
    `ℹ️  ${withAccount}/${transactions.length} transaction(s) carry an embedded account, ` +
      `${withDestination} carry a destinationAddress`,
  );
}

// Skip if transaction data tests are disabled
const describeTransactionData = FEATURE_FLAGS.enableTransactionDataTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data API", () => {
  const testAccountId = process.env.GET_TRANSACTIONS_ACCOUNT_ID || passkeyData.accountId;
  let depositTransaction;
  let withdrawTransaction;

  describe("GET /v1/query/get-transactions", () => {
    it(
      "should get all transactions for an account by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getByAccountId(testAccountId),
          { authenticated: true },
        );

        assertSuccessWithArraySchema(response, "TransactionView");
        assertNewTransactionViewFields(response.data);

        // `type` is a TransactionTypeView, which splits deposits/withdrawals into
        // several on/off-ramp variants — match any of them, not just the bare name.
        depositTransaction = response.data.find((tx) =>
          DEPOSIT_TYPES.has(tx.type),
        );

        withdrawTransaction = response.data.find((tx) =>
          WITHDRAW_TYPES.has(tx.type),
        );
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-transaction", () => {
    it(
      "should get deposit transaction by transaction ID",
      async () => {
        if (!depositTransaction) {
          console.log(
            "ℹ️  No deposit-type transaction on this account — skipping",
          );
          return;
        }

        const response = await apiClient.get(
          endpoints.transactions.getById(depositTransaction.transactionId),
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "TransactionView");
        assertSuccessWithSchema(response, "GetTransactionResponse");
      },
      getTimeout("api"),
    );

    describe("GET /v1/query/get-transaction", () => {
      it(
        "should get withdrawal transaction by transaction ID",
        async () => {
          if (!withdrawTransaction) {
            console.log(
              "ℹ️  No withdraw-type transaction on this account — skipping",
            );
            return;
          }

          const response = await apiClient.get(
            endpoints.transactions.getById(withdrawTransaction.transactionId),
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "TransactionView");
          assertSuccessWithSchema(response, "GetTransactionResponse");
        },
        getTimeout("api"),
      );
    });
  });
});
