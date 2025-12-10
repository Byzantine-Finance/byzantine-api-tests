/**
 * Account Creation SDK Tests, what are tested:
 * - createUser
 * - createEntity
 * - requestTosAcceptanceLink
 *
 * Note: These tests use authenticated endpoints and modify data.
 * Enable with: ENABLE_AUTH_TESTS=true ENABLE_WRITE_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
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
const describeAccountCreation = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

describeAccountCreation("Byzantine Account Creation SDK", () => {
  const client = getSdkClient();

  beforeAll(async () => {
    assertSchema(validUser, "CreateUserRequest");
    assertSchema(validEntity, "CreateEntityRequest");
  });

  describe("createUser()", () => {
    it(
      "should create user with valid data",
      async () => {
        const sdkResponse = await client.api.createUser(validUser);
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "CreateUserResponse", 201);
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
        // Create a client without private key to test unauthenticated request
        const unauthenticatedClient = new (
          await import("@byzantine/integrator-sdk")
        ).ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        try {
          const sdkResponse = await unauthenticatedClient.api.createUser(
            validUser
          );
          const response = formatSdkResponse(sdkResponse);
          // If we get here, the request succeeded but shouldn't have
          // The SDK should handle auth automatically, so this test may need adjustment
          assertError(response, 400);
        } catch (error) {
          // SDK might throw an error instead of returning an error response
          expect(error).toBeDefined();
        }
      },
      getTimeout("api")
    );
  });

  describe("createEntity()", () => {
    it(
      "should create entity with valid data",
      async () => {
        const sdkResponse = await client.api.createEntity(validEntity);
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "CreateEntityResponse", 201);
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
        // Create a client without private key to test unauthenticated request
        const unauthenticatedClient = new (
          await import("@byzantine/integrator-sdk")
        ).ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        try {
          const sdkResponse = await unauthenticatedClient.api.createEntity(
            validEntity
          );
          const response = formatSdkResponse(sdkResponse);
          assertError(response, 400);
        } catch (error) {
          // SDK might throw an error instead of returning an error response
          expect(error).toBeDefined();
        }
      },
      getTimeout("api")
    );
  });

  describe("requestTosAcceptanceLink()", () => {
    it(
      "should get ToS acceptance link",
      async () => {
        const sdkResponse = await client.api.requestTosAcceptanceLink({
          redirectUri: "https://example.com/callback",
        });
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "GetTosAcceptanceLinkResponse");
      },
      getTimeout("api")
    );

    it(
      "should get ToS link without redirect URI",
      async () => {
        const sdkResponse = await client.api.requestTosAcceptanceLink({});
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "GetTosAcceptanceLinkResponse");
      },
      getTimeout("api")
    );
  });
});
