/**
 * Entity Update Flow Tests — PATCH /v1/submit/update-entity-account
 *
 * Updates the test entity account with the body in
 * fixtures/test-data/entities/update-entity.json.
 *
 * Run with:
 *   UPDATE_ENTITY=true npx vitest run tests/api/entity-update-flow.test.js
 *
 * Note: This test uses an authenticated endpoint and modifies data. Write tests
 * are on by default outside production; disable with ENABLE_WRITE_TESTS=false.
 */

import { describe, it } from "vitest";
import { readFileSync } from "fs";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSchema,
  assertValidUuid,
  assertHasFields,
} from "../../utils/api-assertions.js";

const UPDATE_ENTITY_FIXTURE = new URL(
  "../../fixtures/test-data/entities/update-entity.json",
  import.meta.url
);

// Skipped unless write tests are enabled and UPDATE_ENTITY is set
const describeUpdate =
  FEATURE_FLAGS.enableWriteTests && process.env.UPDATE_ENTITY === "true"
    ? describe
    : describe.skip;

describeUpdate("Entity Update — PATCH /v1/submit/update-entity-account", () => {
  it(
    "should update the entity account from the update-entity.json fixture",
    async () => {
      const requestBody = {
        ...JSON.parse(readFileSync(UPDATE_ENTITY_FIXTURE, "utf-8")),
        accountId: TEST_DATA.accounts.testEntityAccountId,
      };

      assertSchema(requestBody, "UpdateEntityAccountRequest");

      const response = await apiClient.patch(
        endpoints.management.updateEntityAccount,
        requestBody,
        { authenticated: true }
      );

      assertSuccessWithSchema(response, "UpdateEntityAccountResponse");
      assertValidUuid(response.data.entityId);
      assertValidUuid(response.data.accountId);
      assertHasFields(response.data, ["verificationStatus"]);

      console.log(
        `✅ Updated entity: entityId=${response.data.entityId}, accountId=${response.data.accountId}`
      );
      console.log(`   verificationStatus=${response.data.verificationStatus}`);
    },
    getTimeout("api")
  );
});
