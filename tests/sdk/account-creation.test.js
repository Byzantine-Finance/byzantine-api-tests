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

import { describe, it, beforeAll } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import { generateUniqueEmail } from "../../utils/test-helpers.js";
import {
  assertSuccessWithSchema,
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

const describeCreateUser = FEATURE_FLAGS.createUser ? describe : describe.skip;
const describeCreateEntity = FEATURE_FLAGS.createEntity
  ? describe
  : describe.skip;

describeAccountCreation("Byzantine Account Creation SDK", () => {
  const client = getSdkClient();

  beforeAll(async () => {
    assertSchema(validUser, "CreateUserRequest");
    assertSchema(validEntity, "CreateEntityRequest");
  });

  describeCreateUser("createUser()", () => {
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

        const sdkResponse = await client.api.createUser(
          userWithUniqueEmail,
          DUMMY_AUTH,
        );

        // Assert SDK behavior: success response with expected data shape
        assertSuccessWithSchema(sdkResponse, "CreateUserResponse");
        assertDataUuid(sdkResponse, "userId");
        assertDataUuid(sdkResponse, "accountId");

        // Save IDs for use in other tests
        saveUserIds(sdkResponse.data.userId, sdkResponse.data.accountId);
      },
      getTimeout("integration"),
    );
  });

  describeCreateEntity("createEntity()", () => {
    it(
      "should create entity with valid data and return typed response",
      async () => {
        // Generate unique emails for all email addresses in the entity
        // This includes: entityInfo.email and all associatedPersons[].userInfo.email
        const entityWithUniqueEmails = {
          ...validEntity,
          entityInfo: {
            ...validEntity.entityInfo,
            email: generateUniqueEmail(validEntity.entityInfo.email),
          },
          associatedPersons: validEntity.associatedPersons.map((person) => ({
            ...person,
            userInfo: {
              ...person.userInfo,
              email: generateUniqueEmail(person.userInfo.email),
            },
          })),
        };

        const sdkResponse = await client.api.createEntity(
          entityWithUniqueEmails,
          DUMMY_AUTH,
        );

        // Assert SDK behavior: success response with expected data shape
        assertSuccessWithSchema(sdkResponse, "CreateEntityResponse");
        assertDataUuid(sdkResponse, "entityId");
        assertDataUuid(sdkResponse, "accountId");

        // Find the root user from associated persons
        const rootUser = sdkResponse.data.associatedPersons.find(
          (person) => person.isRootUser === true,
        );

        // Save IDs for use in other tests
        saveEntityIds(
          sdkResponse.data.entityId,
          sdkResponse.data.accountId,
          rootUser?.userId,
        );
      },
      getTimeout("passkey"),
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
      },
      getTimeout("api"),
    );

    it(
      "should return ToS link without redirect URI",
      async () => {
        const sdkResponse = await client.api.requestTosAcceptanceLink({});

        // Assert SDK behavior
        assertSuccessWithSchema(sdkResponse, "GetTosAcceptanceLinkResponse");
      },
      getTimeout("api"),
    );
  });
});
