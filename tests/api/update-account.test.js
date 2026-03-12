/**
 * Update Individual Account API Tests, what are tested:
 * - submit/update-individual-account (PATCH)
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
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
  assertError,
  assertSchema,
  assertValidUuid,
  assertHasFields,
} from "../../utils/api-assertions.js";

// Import test data from fixtures
import updateUserData from "../../fixtures/test-data/users/update-user.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeUpdateAccount = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeUpdateAccount("Update Individual Account API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;

  describe("PATCH /v1/submit/update-individual-account", () => {
    beforeAll(() => {
      const requestBody = {
        ...updateUserData,
        accountId: testAccountId,
      };
      assertSchema(requestBody, "UpdateIndividualAccountRequest");
    });

    it(
      "should update individual account with valid data",
      async () => {
        const requestBody = {
          ...updateUserData,
          accountId: testAccountId,
        };

        const response = await apiClient.patch(
          endpoints.management.updateIndividualAccount,
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "UpdateIndividualAccountResponse");
        assertValidUuid(response.data.userId);
        assertValidUuid(response.data.accountId);
        assertHasFields(response.data, ["verificationStatus"]);
      },
      getTimeout("api")
    );
  });
});
