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
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertError,
} from "../../utils/sdk-assertions.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";

// Skip if account tests are disabled (these tests need test data)
const describeTransactionData = FEATURE_FLAGS.enableAccountTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testAccountId = passkeyData.accountId;
  let depositTransaction;
  let withdrawTransaction;

  describe("getTransactions()", () => {
    it(
      "should return array of transactions with expected structure",
      async () => {
        const sdkResponse = await client.api.getTransactions(testAccountId);

        // Assert SDK behavior: array with expected data shape
        assertArrayWithSchema(sdkResponse, "TurnkeyTransaction");

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
          depositTransaction.transactionId
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "TurnkeyTransaction");
        assertSuccessWithSchema(sdkResponse, "GetTransactionResponse");
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

  describe("getTransaction()", () => {
    it(
      "should get withdrawal transaction by transaction ID",
      async () => {
        const sdkResponse = await client.api.getTransaction(
          withdrawTransaction.transactionId
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "TurnkeyTransaction");
        assertSuccessWithSchema(sdkResponse, "GetTransactionResponse");
      },
      getTimeout("api")
    );
  });
});
