/**
 * Account Data API Tests, what are tested:
 * - query/get-user-details
 * - query/get-entity-details
 * - query/get-bank-accounts
 */

import { describe, it, beforeAll } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
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

describeAccounts("Account Data API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testUserId = TEST_DATA.accounts.testUserId;
  const testEntityId = TEST_DATA.accounts.testEntityId;

  describe("GET /v1/query/get-user-details", () => {
    it(
      "should get user details by user ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getUserDetails(testUserId)
        );
        assertSuccessWithSchema(response, "GetUserResponse");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent user",
      async () => {
        const fakeUserId = "00000000-0000-0000-0000-000000000000";
        const response = await apiClient.get(
          endpoints.accounts.getUserDetails(fakeUserId)
        );
        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/query/get-entity-details", () => {
    it(
      "should get entity details by entity ID",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getEntityDetails(testEntityId)
        );
        assertSuccessWithSchema(response, "GetEntityResponse");
      },
      getTimeout("api")
    );

    it(
      "should return 404 for non-existent entity",
      async () => {
        const fakeEntityId = "00000000-0000-0000-0000-000000000000";
        const response = await apiClient.get(
          endpoints.accounts.getEntityDetails(fakeEntityId)
        );
        assertError(response, 404);
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/query/get-bank-accounts", () => {
    it(
      "should get bank accounts for an account",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getBankAccounts(testAccountId)
        );
        assertSuccessWithArraySchema(response, "OffRampAddress");
      },
      getTimeout("api")
    );

    it(
      "should filter bank accounts by currency",
      async () => {
        const response = await apiClient.get(
          endpoints.accounts.getBankAccounts(testAccountId, "usd")
        );
        assertSuccessWithArraySchema(response, "OffRampAddress");
      },
      getTimeout("api")
    );
  });
});
