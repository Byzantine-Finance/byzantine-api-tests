/**
 * Transaction Data SDK Tests, what are tested:
 * - getTransaction
 * - getTransactions
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
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
import { txRequest } from "../../fixtures/test-data/__generated__/tx-otp.json";

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
      "should get transaction by transaction ID",
      async () => {
        const sdkResponse = await client.api.getTransaction(
          testApproveTransactionId
        );
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "TurnkeyTransaction");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent transaction",
      async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const sdkResponse = await client.api.getTransaction(fakeId);
        const response = formatSdkResponse(sdkResponse);

        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("getTransactions()", () => {
    it(
      "should get all transactions for an account by account ID",
      async () => {
        const sdkResponse = await client.api.getTransactions(testAccountId);
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithArraySchema(response, "TurnkeyTransaction");
      },
      getTimeout("api")
    );
  });
});
