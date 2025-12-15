/**
 * Account Data SDK Tests, what are tested:
 * - getUserDetails
 * - getEntityDetails
 * - getBankAccounts
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertError,
  assertDataUuid,
} from "../../utils/sdk-assertions.js";

// Skip if feature is disabled or no test data
const describeAccounts = FEATURE_FLAGS.enableAccountTests
  ? describe
  : describe.skip;

describeAccounts("Account Data SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityId = TEST_DATA.accounts.testEntityId;
  const fakeId = "00000000-0000-0000-0000-000000000000";

  describe("getUserDetails()", () => {
    it(
      "should return user details with expected structure",
      async () => {
        const sdkResponse = await client.api.getUserDetails(testUserId);

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "GetUserResponse");
        assertDataUuid(sdkResponse, "userId");
        assertDataUuid(sdkResponse, "accountId");
      },
      getTimeout("api")
    );

    it(
      "should return 404 error for non-existent user",
      async () => {
        const sdkResponse = await client.api.getUserDetails(fakeId);

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });

  describe("getEntityDetails()", () => {
    it(
      "should return entity details with expected structure",
      async () => {
        const sdkResponse = await client.api.getEntityDetails(testEntityId);

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "GetEntityResponse");
        assertDataUuid(sdkResponse, "entityId");
        assertDataUuid(sdkResponse, "accountId");
      },
      getTimeout("api")
    );

    it(
      "should return 404 error for non-existent entity",
      async () => {
        const sdkResponse = await client.api.getEntityDetails(fakeId);

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });

  describe("getBankAccounts()", () => {
    it(
      "should return array of bank accounts with expected structure",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(testAccountId);

        // Assert SDK behavior: array response with expected shape
        assertArrayWithSchema(sdkResponse, "OffRampAddress");
      },
      getTimeout("api")
    );

    it(
      "should filter bank accounts by currency",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(
          testAccountId,
          "usd"
        );

        // Assert SDK behavior: filtered array response
        assertArrayWithSchema(sdkResponse, "OffRampAddress");
      },
      getTimeout("api")
    );
  });
});
