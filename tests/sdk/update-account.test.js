/**
 * Update Individual Account SDK Tests, what are tested:
 * - updateIndividualAccount
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, beforeAll } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertSchema,
  assertDataUuid,
  assertDataHasFields,
} from "../../utils/sdk-assertions.js";

// Import test data from fixtures
import updateUserData from "../../fixtures/test-data/users/update-user.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeUpdateAccount = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeUpdateAccount(
  "Update Individual Account SDK - Using Integrator SDK",
  () => {
    const client = getSdkClient();
    const testAccountId = TEST_DATA.accounts.testAccountId;

    describe("updateIndividualAccount()", () => {
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
            accountId: testAccountId,
            ...updateUserData,
          };

          const sdkResponse = await client.api.updateIndividualAccount(
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(
            sdkResponse,
            "UpdateIndividualAccountResponse",
          );
          assertDataUuid(sdkResponse, "userId");
          assertDataUuid(sdkResponse, "accountId");
          assertDataHasFields(sdkResponse, ["verificationStatus"]);
        },
        getTimeout("api"),
      );
    });
  },
);
