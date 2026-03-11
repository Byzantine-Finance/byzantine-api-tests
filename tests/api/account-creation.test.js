/**
 * Account Creation API Tests, what are tested:
 * - submit/create-user
 * - submit/create-entity
 * - query/get-tos-acceptance-link
 * - Optional fields in CreateEntityRequest (email, website, etc.)
 * - Optional fields in GetIndividualUserRequest (nationality, residentialAddress)
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 */

import { describe, it, beforeAll } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import { generateUniqueEmail } from "../../utils/test-helpers.js";
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
    assertSchema(validUser, "CreateUserRequest");
    assertSchema(validEntity, "CreateEntityRequest");
  });

  describeCreateUser("POST /v1/submit/create-user", () => {
    it(
      "should create user with valid data",
      async () => {
        // Create a unique email and bridgeSignedAgreementId for this test
        const uniqueEmail = generateUniqueEmail(validUser.userInfo.email);
        const userWithUniqueEmail = {
          ...validUser,
          userInfo: {
            ...validUser.userInfo,
            email: uniqueEmail,
          },
        };

        const response = await apiClient.post(
          endpoints.create.user,
          userWithUniqueEmail,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "CreateUserResponse", 201);
        assertValidUuid(response.data.userId);
        assertValidUuid(response.data.accountId);

        // Save IDs and email for use in other tests (email reused in entity B)
        saveUserIds(response.data.userId, response.data.accountId, uniqueEmail);
      },
      getTimeout("integration"),
    );
  });

  describeCreateEntity("POST /v1/submit/create-entity", () => {
    it(
      "should create entity with valid data",
      async () => {
        // Use emails directly from the fixture (both persons share the same email)
        const entityWithUniqueEmails = {
          ...validEntity,
        };

        const response = await apiClient.post(
          endpoints.create.entity,
          entityWithUniqueEmails,
          { authenticated: true, timeout: getTimeout("passkey") },
        );

        assertSuccessWithSchema(response, "CreateEntityResponse", 201);
        assertValidUuid(response.data.entityId);
        assertValidUuid(response.data.accountId);

        // Find the root user from associated persons
        const rootUser = response.data.associatedPersons.find(
          (person) => person.isRootUser === true,
        );

        // Find person C's email (non-root user) from the request data
        const personC = entityWithUniqueEmails.associatedPersons.find(
          (person) => person.isRootUser === false,
        );

        // Save IDs and person C's email for reuse in entity B
        saveEntityIds(
          response.data.entityId,
          response.data.accountId,
          rootUser?.userId,
          personC?.userInfo?.email,
        );
      },
      getTimeout("passkey"),
    );
  });

  describe("POST /v1/query/get-tos-acceptance-link", () => {
    it(
      "should get ToS acceptance link",
      async () => {
        const response = await apiClient.post(endpoints.create.getTosLink, {
          redirectUri: "https://example.com/callback",
        });

        assertSuccessWithSchema(response, "GetTosAcceptanceLinkResponse");
      },
      getTimeout("api"),
    );

    it(
      "should get ToS link without redirect URI",
      async () => {
        const response = await apiClient.post(endpoints.create.getTosLink, {});

        assertSuccessWithSchema(response, "GetTosAcceptanceLinkResponse");
      },
      getTimeout("api"),
    );
  });
});
