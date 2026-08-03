/**
 * Account Creation API Tests, what are tested:
 * - submit/create-individual-account (CreateIndividualAccountRequest/Response)
 * - submit/create-entity-account (CreateEntityAccountRequest/Response)
 * - Optional fields in CreateEntityAccountRequest (email, website, etc.)
 * - Optional fields in UserInfo (nationality, residentialAddress, birthDate - now optional)
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 */

import { describe, it, beforeAll } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import { maybeUniqueEmail } from "../../utils/test-helpers.js";
import {
  assertSuccessWithSchema,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";
import {
  saveUserIds,
  saveEntityIds,
} from "../../utils/test-data-persistence.js";

// Import test data from fixtures
import validUser from "../../fixtures/test-data/users/valid-user.json" assert { type: "json" };
import validEntity from "../../fixtures/test-data/entities/valid-entity.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeAccountCreation = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

const describeCreateUser = FEATURE_FLAGS.createUser ? describe : describe.skip;
const describeCreateEntity = FEATURE_FLAGS.createEntity
  ? describe
  : describe.skip;

describeAccountCreation("Byzantine Account Creation API", () => {
  beforeAll(async () => {
    assertSchema(validUser, "CreateIndividualAccountRequest");
    assertSchema(validEntity, "CreateEntityAccountRequest");
  });

  describeCreateUser("POST /v1/submit/create-individual-account", () => {
    it(
      "should create user with valid data",
      async () => {
        // Uniquify the owner + root user emails when UNIQUE_EMAILS=true.
        // Preserve the owner==root relationship (same email -> same value) so
        // owner anchoring still resolves to the intended user.
        const ownerEmail = maybeUniqueEmail(validUser.userInfo.email);
        const userWithUniqueEmails = {
          ...validUser,
          userInfo: { ...validUser.userInfo, email: ownerEmail },
          rootUsers: (validUser.rootUsers || []).map((r) => ({
            ...r,
            email:
              r.email === validUser.userInfo.email
                ? ownerEmail
                : maybeUniqueEmail(r.email),
          })),
        };

        const response = await apiClient.post(
          endpoints.create.user,
          userWithUniqueEmails,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "CreateIndividualAccountResponse", 201);
        assertValidUuid(response.data.userId);
        assertValidUuid(response.data.accountId);

        // Save IDs and email for use in other tests (email reused in entity B)
        saveUserIds(
          response.data.userId,
          response.data.accountId,
          ownerEmail,
        );
      },
      getTimeout("integration"),
    );
  });

  describeCreateEntity("POST /v1/submit/create-entity-account", () => {
    it(
      "should create entity account with valid data",
      async () => {
        // Use emails directly from the fixture
        const uniqueEmail = maybeUniqueEmail(validEntity.entityInfo.email);
        const entityWithUniqueEmails = {
          ...validEntity,
          entityInfo: {
            ...validEntity.entityInfo,
            email: uniqueEmail,
          },
          rootUsers: (validEntity.rootUsers || []).map((r) => ({
            ...r,
            email: maybeUniqueEmail(r.email),
          })),
          associatedPersons: validEntity.associatedPersons,
        };

        const response = await apiClient.post(
          endpoints.create.entity,
          entityWithUniqueEmails,
          { authenticated: true, timeout: getTimeout("passkey") },
        );

        assertSuccessWithSchema(response, "CreateEntityAccountResponse", 201);
        assertValidUuid(response.data.entityId);
        assertValidUuid(response.data.accountId);

        // Get the first root user from the response
        const rootUser = response.data.rootUsers?.[0];

        // Save IDs and person C's email for reuse in entity B
        saveEntityIds(
          response.data.entityId,
          response.data.accountId,
          rootUser?.userId,
          uniqueEmail
        );
      },
      getTimeout("passkey"),
    );
  });

});
