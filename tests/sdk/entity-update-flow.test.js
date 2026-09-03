/**
 * Entity Update Flow SDK Tests -- updateEntityAccount()
 *
 * Updates the test entity account with the body in
 * fixtures/test-data/entities/update-entity.json.
 *
 * Run with:
 *   UPDATE_ENTITY=true npx vitest run tests/sdk/entity-update-flow.test.js
 *
 * Note: This test uses an authenticated endpoint and modifies data. Write tests
 * are on by default outside production; disable with ENABLE_WRITE_TESTS=false.
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { readFileSync } from "fs";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSchema,
  assertDataUuid,
  assertDataHasFields,
} from "../../utils/sdk-assertions.js";

const UPDATE_ENTITY_FIXTURE = new URL(
  "../../fixtures/test-data/entities/update-entity.json",
  import.meta.url,
);

// Skipped unless write tests are enabled and UPDATE_ENTITY is set
const describeUpdate =
  FEATURE_FLAGS.enableWriteTests && process.env.UPDATE_ENTITY === "true"
    ? describe
    : describe.skip;

describeUpdate("Entity Update SDK - updateEntityAccount()", () => {
  const client = getSdkClient();

  it(
    "should update the entity account from the update-entity.json fixture",
    async () => {
      const requestBody = {
        ...JSON.parse(readFileSync(UPDATE_ENTITY_FIXTURE, "utf-8")),
        accountId: TEST_DATA.accounts.testEntityAccountId,
      };

      assertSchema(requestBody, "UpdateEntityAccountRequest");

      const sdkResponse = await client.api.updateEntityAccount(
        requestBody,
        DUMMY_AUTH,
      );

      assertSuccessWithSchema(sdkResponse, "UpdateEntityAccountResponse");
      assertDataUuid(sdkResponse, "entityId");
      assertDataUuid(sdkResponse, "accountId");
      assertDataHasFields(sdkResponse, ["verificationStatus"]);

      console.log(
        `Updated entity: entityId=${sdkResponse.data.entityId}, accountId=${sdkResponse.data.accountId}`,
      );
      console.log(
        `   verificationStatus=${sdkResponse.data.verificationStatus}`,
      );
    },
    getTimeout("api"),
  );
});
