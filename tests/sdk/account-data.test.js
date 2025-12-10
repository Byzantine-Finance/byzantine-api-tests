/**
 * Account Data SDK Tests, what are tested:
 * - getUserDetails
 * - getEntityDetails
 * - getBankAccounts
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertError,
} from "../../utils/assertions.js";

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
      "should get user details by user ID",
      async () => {
        const sdkResponse = await client.api.getUserDetails(testUserId);
        const response = formatSdkResponse(sdkResponse);
        assertSuccessWithSchema(response, "GetUserResponse");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent user",
      async () => {
        const sdkResponse = await client.api.getUserDetails(fakeId);
        const response = formatSdkResponse(sdkResponse);
        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("getEntityDetails()", () => {
    it(
      "should get entity details by entity ID",
      async () => {
        const sdkResponse = await client.api.getEntityDetails(testEntityId);
        const response = formatSdkResponse(sdkResponse);
        assertSuccessWithSchema(response, "GetEntityResponse");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent entity",
      async () => {
        const sdkResponse = await client.api.getEntityDetails(fakeId);
        const response = formatSdkResponse(sdkResponse);
        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("getBankAccounts()", () => {
    it(
      "should get bank accounts for an account",
      async () => {
        const sdkResponse = await client.api.getBankAccounts(testAccountId);
        const response = formatSdkResponse(sdkResponse);
        assertSuccessWithArraySchema(response, "OffRampAddress");
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
        const response = formatSdkResponse(sdkResponse);
        assertSuccessWithArraySchema(response, "OffRampAddress");
      },
      getTimeout("api")
    );
  });
});
