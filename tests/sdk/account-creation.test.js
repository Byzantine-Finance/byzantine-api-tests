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
import { getSdkClient } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  generateUniqueEmail,
} from "../../utils/test-helpers.js";
import {
  assertSuccessWithSchema,
  assertError,
  assertDataUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";
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
      "should create user with valid data and return typed response",
      async () => {
        const uniqueEmail = generateUniqueEmail(validUser.userInfo.email);
        const userWithUniqueEmail = {
          ...validUser,
          userInfo: {
            ...validUser.userInfo,
            email: uniqueEmail,
          },
        };

        const sdkResponse = await client.api.createUser(userWithUniqueEmail);

        // Assert SDK behavior: success response with expected data shape
        assertSuccessWithSchema(sdkResponse, "CreateUserResponse");
        assertDataUuid(sdkResponse, "userId");
        assertDataUuid(sdkResponse, "accountId");

        // Save IDs for use in other tests
        saveUserIds(sdkResponse.data.userId, sdkResponse.data.accountId);
      },
      getTimeout("api")
    );

    it(
      "should handle authentication errors correctly",
      async () => {
        const unauthenticatedClient = new (
          await import("@byzantine/integrator-sdk")
        ).ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        const sdkResponse = await unauthenticatedClient.api.createUser(
          validUser
        );

        // Assert SDK error handling behavior
        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });

  describe("createEntity()", () => {
    it(
      "should create entity with valid data and return typed response",
      async () => {
        const uniqueEmail = generateUniqueEmail(validEntity.entityInfo.email);
        const entityWithUniqueEmail = {
          ...validEntity,
          entityInfo: {
            ...validEntity.entityInfo,
            email: uniqueEmail,
          },
        };

        const sdkResponse = await client.api.createEntity(
          entityWithUniqueEmail
        );

        // Assert SDK behavior: success response with expected data shape
        assertSuccessWithSchema(sdkResponse, "CreateEntityResponse");
        assertDataUuid(sdkResponse, "entityId");
        assertDataUuid(sdkResponse, "accountId");

        // Save IDs for use in other tests
        saveEntityIds(sdkResponse.data.entityId, sdkResponse.data.accountId);
      },
      getTimeout("api")
    );

    it(
      "should handle authentication errors correctly",
      async () => {
        // Create a client without private key to test unauthenticated request
        const unauthenticatedClient = new (
          await import("@byzantine/integrator-sdk")
        ).ByzantineClient({
          api: {
            baseUrl: client.api.config.baseUrl,
          },
        });

        const sdkResponse = await unauthenticatedClient.api.createEntity(
          validEntity
        );

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api")
    );
  });

  describe("requestTosAcceptanceLink()", () => {
    it(
      "should return ToS acceptance link with expected structure",
      async () => {
        const sdkResponse = await client.api.requestTosAcceptanceLink({
          redirectUri: "https://example.com/callback",
        });

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "GetTosAcceptanceLinkResponse");
        expect(typeof sdkResponse.data.hostedUrl).toBe("string");
        expect(sdkResponse.data.hostedUrl).toMatch(/^https?:\/\//);
      },
      getTimeout("api")
    );

    it(
      "should return ToS link without redirect URI",
      async () => {
        const sdkResponse = await client.api.requestTosAcceptanceLink({});

        // Assert SDK behavior
        assertSuccessWithSchema(sdkResponse, "GetTosAcceptanceLinkResponse");
        expect(typeof sdkResponse.data.hostedUrl).toBe("string");
      },
      getTimeout("api")
    );
  });
});
