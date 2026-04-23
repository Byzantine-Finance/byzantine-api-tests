/**
 * Transaction Data API Tests, what are tested:
 * - query/get-transaction
 * - query/get-transactions
 */

import { describe, it } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertError,
} from "../../utils/api-assertions.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";

// Skip if transaction data tests are disabled
const describeTransactionData = FEATURE_FLAGS.enableTransactionDataTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data API", () => {
  const testAccountId = passkeyData.accountId;
  let depositTransaction;
  let withdrawTransaction;

  describe("GET /v1/query/get-transactions", () => {
    it(
      "should get all transactions for an account by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getByAccountId(testAccountId),
          { authenticated: true }
        );

        assertSuccessWithArraySchema(response, "TurnkeyTransaction");

        // Find first deposit transaction
        depositTransaction = response.data.find((tx) => tx.type === "deposit");

        // Find first withdrawal transaction
        withdrawTransaction = response.data.find(
          (tx) => tx.type === "withdraw"
        );
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/query/get-transaction", () => {
    it(
      "should get deposit transaction by transaction ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getById(depositTransaction.transactionId),
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "TurnkeyTransaction");
        assertSuccessWithSchema(response, "GetTransactionResponse");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent transaction",
      async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const response = await apiClient.get(
          endpoints.transactions.getById(fakeId),
          { authenticated: true }
        );

        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/query/get-transaction", () => {
    it(
      "should get withdrawal transaction by transaction ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getById(withdrawTransaction.transactionId),
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "TurnkeyTransaction");
        assertSuccessWithSchema(response, "GetTransactionResponse");
      },
      getTimeout("api")
    );
  });
});
