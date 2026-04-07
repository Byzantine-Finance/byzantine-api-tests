/**
 * Entity Update Flow Tests — end-to-end entity creation and document update flow
 *
 * Step 1: Create minimal entity account (CREATE_MINIMAL_ENTITY=true)
 * Step 2: Update entity with full info + 3 docs (incorrect incorporation_cert) (UPDATE_ENTITY_DOCS=true)
 * Step 3: Update entity with correct incorporation_cert only (UPDATE_ENTITY_CORRECT_DOC=true)
 *
 * Run each step independently:
 *   CREATE_MINIMAL_ENTITY=true npx vitest run tests/api/entity-update-flow.test.js
 *   UPDATE_ENTITY_DOCS=true npx vitest run tests/api/entity-update-flow.test.js
 *   UPDATE_ENTITY_CORRECT_DOC=true npx vitest run tests/api/entity-update-flow.test.js
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_WRITE_TESTS=true
 */

import { describe, it, expect } from "vitest";
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
import { saveEntityIds } from "../../utils/test-data-persistence.js";

// Import test data from fixtures
import updateEntityFullData from "../../fixtures/test-data/entities/update-entity-full.json" assert { type: "json" };
import updateEntityCorrectDocData from "../../fixtures/test-data/entities/update-entity-correct-doc.json" assert { type: "json" };

// Skip if write tests are disabled
const describeFlow = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

// Step-level flags — each step runs independently
const describeStep1 =
  process.env.CREATE_MINIMAL_ENTITY === "true" ? describe : describe.skip;
const describeStep2 =
  process.env.UPDATE_ENTITY_DOCS === "true" ? describe : describe.skip;
const describeStep3 =
  process.env.UPDATE_ENTITY_CORRECT_DOC === "true" ? describe : describe.skip;

describeFlow("Entity Update Flow", () => {
  // ──────────────────────────────────────────────
  // Step 1: Create minimal entity
  // ──────────────────────────────────────────────
  describeStep1(
    "Step 1 — POST /v1/submit/create-entity-account (minimal)",
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

          const response = await apiClient.post(
            endpoints.create.entity,
            requestBody,
            { authenticated: true, timeout: getTimeout("passkey") }
          );

          assertSuccessWithSchema(
            response,
            "CreateEntityAccountResponse",
            201
          );
          assertValidUuid(response.data.entityId);
          assertValidUuid(response.data.accountId);
          assertHasFields(response.data, ["verificationStatus"]);

          // Save IDs for subsequent steps
          const rootUser = response.data.rootUsers?.[0];
          saveEntityIds(
            response.data.entityId,
            response.data.accountId,
            rootUser?.userId
          );

          console.log(
            `✅ Created minimal entity: entityId=${response.data.entityId}, accountId=${response.data.accountId}`
          );
          console.log(
            `   verificationStatus=${response.data.verificationStatus}`
          );
          if (response.data.missingCompanyData) {
            console.log(
              `   missingCompanyData: ${JSON.stringify(response.data.missingCompanyData)}`
            );
          }
          if (response.data.missingDocuments) {
            console.log(
              `   missingDocuments: ${JSON.stringify(response.data.missingDocuments)}`
            );
          }
        },
        getTimeout("passkey")
      );
    }
  );

  // ──────────────────────────────────────────────
  // Step 2: Update entity with full info + 3 docs (incorrect incorporation_cert)
  // ──────────────────────────────────────────────
  describeStep2(
    "Step 2 — PATCH /v1/submit/update-entity-account (full info + 3 docs with incorrect incorporation_cert)",
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

          const response = await apiClient.patch(
            endpoints.management.updateEntityAccount,
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(
            response,
            "UpdateEntityAccountResponse"
          );
          assertValidUuid(response.data.entityId);
          assertValidUuid(response.data.accountId);
          assertHasFields(response.data, ["verificationStatus"]);

          console.log(
            `✅ Updated entity: entityId=${response.data.entityId}, accountId=${response.data.accountId}`
          );
          console.log(
            `   verificationStatus=${response.data.verificationStatus}`
          );
          if (response.data.entityDocuments) {
            console.log(
              `   entityDocuments: ${response.data.entityDocuments.length} doc(s) submitted`
            );
          }
          if (response.data.missingDocuments) {
            console.log(
              `   missingDocuments: ${JSON.stringify(response.data.missingDocuments)}`
            );
          }
          if (response.data.missingCompanyData) {
            console.log(
              `   missingCompanyData: ${JSON.stringify(response.data.missingCompanyData)}`
            );
          }
        },
        getTimeout("api")
      );
    }
  );

  // ──────────────────────────────────────────────
  // Step 3: Update entity with correct incorporation_cert only
  // ──────────────────────────────────────────────
  describeStep3(
    "Step 3 — PATCH /v1/submit/update-entity-account (correct incorporation_cert)",
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

          const response = await apiClient.patch(
            endpoints.management.updateEntityAccount,
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(
            response,
            "UpdateEntityAccountResponse"
          );
          assertValidUuid(response.data.entityId);
          assertValidUuid(response.data.accountId);
          assertHasFields(response.data, ["verificationStatus"]);

          console.log(
            `✅ Updated entity with correct doc: entityId=${response.data.entityId}, accountId=${response.data.accountId}`
          );
          console.log(
            `   verificationStatus=${response.data.verificationStatus}`
          );
          if (response.data.entityDocuments) {
            console.log(
              `   entityDocuments: ${response.data.entityDocuments.length} doc(s) submitted`
            );
          }
          if (response.data.missingDocuments) {
            console.log(
              `   missingDocuments: ${JSON.stringify(response.data.missingDocuments)}`
            );
          }
        },
        getTimeout("api")
      );
    }
  );
});
