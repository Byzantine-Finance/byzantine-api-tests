/**
 * Transaction Data API Tests, what are tested:
 * - query/get-transaction
 * - query/get-transactions
 */

import { describe, it } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  TEST_DATA,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertError,
} from "../../utils/assertions.js";
import { txRequest } from "../../fixtures/test-data/__generated__/tx-top.json";

// Skip if account tests are disabled (these tests need test data)
const describeTransactionData = FEATURE_FLAGS.enableAccountTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testApproveTransactionId = txRequest.approve.transactionId;

  describe("GET /v1/query/get-transaction", () => {
    it(
      "should get transaction by transaction ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getById(testApproveTransactionId)
        );

        assertSuccessWithSchema(response, "TurnkeyTransaction");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent transaction",
      async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const response = await apiClient.get(
          endpoints.transactions.getById(fakeId)
        );

        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/query/get-transactions", () => {
    it(
      "should get all transactions for an account by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getByAccountId(testAccountId)
        );

        assertSuccessWithArraySchema(response, "TurnkeyTransaction");
      },
      getTimeout("api")
    );
  });
});
