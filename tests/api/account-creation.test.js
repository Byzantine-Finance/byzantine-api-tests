/**
 * Account Creation API Tests, what are tested:
 * - submit/create-user
 * - submit/create-entity
 * - query/get-tos-acceptance-link
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 */

import { describe, it } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/assertions.js";
import {
  saveUserIds,
  saveEntityIds,
} from "../../utils/test-data-persistence.js";

// Import test data from fixtures
import validUser from "../../fixtures/test-data/users/valid-user.json" assert { type: "json" };
import validEntity from "../../fixtures/test-data/entities/valid-entity.json" assert { type: "json" };

// Skip if auth/write tests are disabled
const describeAccountCreation =
  FEATURE_FLAGS.enableAuthenticatedTests && FEATURE_FLAGS.enableWriteTests
    ? describe
    : describe.skip;

describeAccountCreation("Byzantine Account Creation API", () => {
  describe("POST /v1/submit/create-user", () => {
    it(
      "should create user with valid data",
      async () => {
        assertSchema(validUser, "createUserRequest");

        const response = await apiClient.post(
          endpoints.create.user,
          validUser,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "createUserResponse", 201);
        assertValidUuid(response.data.userId);
        assertValidUuid(response.data.accountId);

        // Save IDs for use in other tests
        saveUserIds(response.data.userId, response.data.accountId);
      },
      getTimeout("api")
    );

    it(
      "should reject request without integrator authentication",
      async () => {
        const response = await apiClient.post(
          endpoints.create.user,
          validUser
          // No authenticated: true
        );

        assertError(response, 400);
      },
      getTimeout("api")
    );
  });

  describe("POST /v1/submit/create-entity", () => {
    it(
      "should create entity with valid data",
      async () => {
        assertSchema(validEntity, "createEntityRequest");
        
        const response = await apiClient.post(
          endpoints.create.entity,
          validEntity,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "createEntityResponse", 201);
        assertValidUuid(response.data.entityId);
        assertValidUuid(response.data.accountId);

        // Save IDs for use in other tests
        saveEntityIds(response.data.entityId, response.data.accountId);
      },
      getTimeout("api")
    );

    it(
      "should reject request without integrator authentication",
      async () => {
        const response = await apiClient.post(
          endpoints.create.entity,
          validEntity
          // No authenticated: true
        );

        assertError(response, 400);
      },
      getTimeout("api")
    );
  });

  describe("POST /v1/query/get-tos-acceptance-link", () => {
    it(
      "should get ToS acceptance link",
      async () => {
        const response = await apiClient.post(endpoints.create.getTosLink, {
          redirectUri: "https://example.com/callback",
        });

        assertSuccessWithSchema(response, "tosLink");
      },
      getTimeout("api")
    );

    it(
      "should get ToS link without redirect URI",
      async () => {
        const response = await apiClient.post(endpoints.create.getTosLink, {});

        assertSuccessWithSchema(response, "tosLink");
      },
      getTimeout("api")
    );
  });
});
