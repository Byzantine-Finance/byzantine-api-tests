/**
 * Entity Update Flow SDK Tests -- end-to-end entity creation and document update flow
 *
 * Step 1: Create minimal entity account (CREATE_MINIMAL_ENTITY=true)
 * Step 2: Update entity with full info + 3 docs (incorrect incorporation_cert) (UPDATE_ENTITY_DOCS=true)
 * Step 3: Update entity with correct incorporation_cert only (UPDATE_ENTITY_CORRECT_DOC=true)
 *
 * Run each step independently:
 *   CREATE_MINIMAL_ENTITY=true npx vitest run tests/sdk/entity-update-flow.test.js
 *   UPDATE_ENTITY_DOCS=true npx vitest run tests/sdk/entity-update-flow.test.js
 *   UPDATE_ENTITY_CORRECT_DOC=true npx vitest run tests/sdk/entity-update-flow.test.js
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_WRITE_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
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
import { saveEntityIds } from "../../utils/test-data-persistence.js";

// Import test data from fixtures
import updateEntityFullData from "../../fixtures/test-data/entities/update-entity-full.json" assert { type: "json" };
import updateEntityCorrectDocData from "../../fixtures/test-data/entities/update-entity-correct-doc.json" assert { type: "json" };

// Skip if write tests are disabled
const describeFlow = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Step-level flags -- each step runs independently
const describeStep1 =
  process.env.CREATE_MINIMAL_ENTITY === "true" ? describe : describe.skip;
const describeStep2 =
  process.env.UPDATE_ENTITY_DOCS === "true" ? describe : describe.skip;
const describeStep3 =
  process.env.UPDATE_ENTITY_CORRECT_DOC === "true" ? describe : describe.skip;

describeFlow("Entity Update Flow SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  // ------------------------------------------
  // Step 1: Create minimal entity
  // ------------------------------------------
  describeStep1(
    "Step 1 -- createEntityAccount() (minimal)",
    () => {
      it(
        "should create a minimal entity account",
        async () => {
          const requestBody = {
            entityInfo: {
              businessLegalName: "Byz Finance Minimal",
              email: "lin+entity-minimal-4@byzantine.fi",
            },
            rootUsers: [
              {
                firstName: "Root",
                lastName: "User",
                email: "lin+entity-minimal-4@byzantine.fi",
              },
            ],
            byzantineTermsSignedAt: String(
              Math.floor(Date.now() / 1000)
            ),
          };

          assertSchema(requestBody, "CreateEntityAccountRequest");

          const sdkResponse = await client.api.createEntityAccount(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(
            sdkResponse,
            "CreateEntityAccountResponse",
          );
          assertDataUuid(sdkResponse, "entityId");
          assertDataUuid(sdkResponse, "accountId");
          assertDataHasFields(sdkResponse, ["verificationStatus"]);

          // Save IDs for subsequent steps
          const rootUser = sdkResponse.data.rootUsers?.[0];
          saveEntityIds(
            sdkResponse.data.entityId,
            sdkResponse.data.accountId,
            rootUser?.userId,
          );

          console.log(
            `Created minimal entity: entityId=${sdkResponse.data.entityId}, accountId=${sdkResponse.data.accountId}`,
          );
          console.log(
            `   verificationStatus=${sdkResponse.data.verificationStatus}`,
          );
          if (sdkResponse.data.missingCompanyData) {
            console.log(
              `   missingCompanyData: ${JSON.stringify(sdkResponse.data.missingCompanyData)}`,
            );
          }
          if (sdkResponse.data.missingDocuments) {
            console.log(
              `   missingDocuments: ${JSON.stringify(sdkResponse.data.missingDocuments)}`,
            );
          }
        },
        getTimeout("passkey"),
      );
    },
  );

  // ------------------------------------------
  // Step 2: Update entity with full info + 3 docs (incorrect incorporation_cert)
  // ------------------------------------------
  describeStep2(
    "Step 2 -- updateEntityAccount() (full info + 3 docs with incorrect incorporation_cert)",
    () => {
      it(
        "should update entity with full info and documents",
        async () => {
          const testEntityAccountId =
            TEST_DATA.accounts.testEntityAccountId;

          const requestBody = {
            ...updateEntityFullData,
            accountId: testEntityAccountId,
          };

          assertSchema(requestBody, "UpdateEntityAccountRequest");

          const sdkResponse = await client.api.updateEntityAccount(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(
            sdkResponse,
            "UpdateEntityAccountResponse",
          );
          assertDataUuid(sdkResponse, "entityId");
          assertDataUuid(sdkResponse, "accountId");
          assertDataHasFields(sdkResponse, ["verificationStatus"]);

          console.log(
            `Updated entity: entityId=${sdkResponse.data.entityId}, accountId=${sdkResponse.data.accountId}`,
          );
          console.log(
            `   verificationStatus=${sdkResponse.data.verificationStatus}`,
          );
          if (sdkResponse.data.entityDocuments) {
            console.log(
              `   entityDocuments: ${sdkResponse.data.entityDocuments.length} doc(s) submitted`,
            );
          }
          if (sdkResponse.data.missingDocuments) {
            console.log(
              `   missingDocuments: ${JSON.stringify(sdkResponse.data.missingDocuments)}`,
            );
          }
          if (sdkResponse.data.missingCompanyData) {
            console.log(
              `   missingCompanyData: ${JSON.stringify(sdkResponse.data.missingCompanyData)}`,
            );
          }
        },
        getTimeout("api"),
      );
    },
  );

  // ------------------------------------------
  // Step 3: Update entity with correct incorporation_cert only
  // ------------------------------------------
  describeStep3(
    "Step 3 -- updateEntityAccount() (correct incorporation_cert)",
    () => {
      it(
        "should update entity with correct incorporation_cert document",
        async () => {
          const testEntityAccountId =
            TEST_DATA.accounts.testEntityAccountId;

          const requestBody = {
            ...updateEntityCorrectDocData,
            accountId: testEntityAccountId,
          };

          assertSchema(requestBody, "UpdateEntityAccountRequest");

          const sdkResponse = await client.api.updateEntityAccount(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(
            sdkResponse,
            "UpdateEntityAccountResponse",
          );
          assertDataUuid(sdkResponse, "entityId");
          assertDataUuid(sdkResponse, "accountId");
          assertDataHasFields(sdkResponse, ["verificationStatus"]);

          console.log(
            `Updated entity with correct doc: entityId=${sdkResponse.data.entityId}, accountId=${sdkResponse.data.accountId}`,
          );
          console.log(
            `   verificationStatus=${sdkResponse.data.verificationStatus}`,
          );
          if (sdkResponse.data.entityDocuments) {
            console.log(
              `   entityDocuments: ${sdkResponse.data.entityDocuments.length} doc(s) submitted`,
            );
          }
          if (sdkResponse.data.missingDocuments) {
            console.log(
              `   missingDocuments: ${JSON.stringify(sdkResponse.data.missingDocuments)}`,
            );
          }
        },
        getTimeout("api"),
      );
    },
  );
});
