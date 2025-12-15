/**
 * Transaction Data SDK Tests, what are tested:
 * - getTransaction
 * - getTransactions
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
import {
  getTimeout,
  TEST_DATA,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertError,
} from "../../utils/sdk-assertions.js";
import { txRequest } from "../../fixtures/test-data/__generated__/generated-tx-otp.json";

// Skip if account tests are disabled (these tests need test data)
const describeTransactionData = FEATURE_FLAGS.enableAccountTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testApproveTransactionId = txRequest.approve.transactionId;

  describe("getTransaction()", () => {
    it(
      "should return transaction with expected structure",
      async () => {
        const sdkResponse = await client.api.getTransaction(
          testApproveTransactionId
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "TurnkeyTransaction");
      },
      getTimeout("api")
    );

    it(
      "should return 404 error for non-existent transaction",
      async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const sdkResponse = await client.api.getTransaction(fakeId);

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });

  describe("getTransactions()", () => {
    it(
      "should return array of transactions with expected structure",
      async () => {
        const sdkResponse = await client.api.getTransactions(testAccountId);

        // Assert SDK behavior: array with expected data shape
        assertArrayWithSchema(sdkResponse, "TurnkeyTransaction");
      },
      getTimeout("api")
    );
  });
});
