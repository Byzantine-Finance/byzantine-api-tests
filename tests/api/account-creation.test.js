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
  assertError,
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
const describeCreateUserMinimal = FEATURE_FLAGS.createUserMinimal
  ? describe
  : describe.skip;

const describeCreateEntity = FEATURE_FLAGS.createEntity
  ? describe
  : describe.skip;
const describeCreateEntityMinimal = FEATURE_FLAGS.createEntityMinimal
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

        // Save IDs for use in other tests
        saveUserIds(response.data.userId, response.data.accountId);
      },
      getTimeout("integration"),
    );
  });

  // describeCreateUserMinimal(
  //   "POST /v1/submit/create-user - Minimal Fields",
  //   () => {
  //     it(
  //       "should create user with minimal required fields",
  //       async () => {
  //         const minimalUser = {
  //           userInfo: {
  //             ...validUser.userInfo,
  //             email: generateUniqueEmail(validUser.userInfo.email),
  //           },
  //           bridgeSignedAgreementId: validUser.bridgeSignedAgreementId,
  //           byzantineTermsSignedAt: validUser.byzantineTermsSignedAt,
  //           authenticators: validUser.authenticators,
  //         };

  //         const response = await apiClient.post(
  //           endpoints.create.user,
  //           minimalUser,
  //           { authenticated: true },
  //         );

  //         // Should succeed with minimal data
  //         assertSuccessWithSchema(response, "CreateUserResponse", 201);
  //         assertValidUuid(response.data.userId);
  //         assertValidUuid(response.data.accountId);

  //         console.log(
  //           `✅ Created user with minimal fields: ${response.data.userId}`,
  //         );
  //       },
  //       getTimeout("integration"),
  //     );
  //   },
  // );

  describeCreateEntity("POST /v1/submit/create-entity", () => {
    it(
      "should create entity with valid data",
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

        // Save IDs for use in other tests
        saveEntityIds(
          response.data.entityId,
          response.data.accountId,
          rootUser?.userId,
        );
      },
      getTimeout("passkey"),
    );
  });

  // describeCreateEntityMinimal(
  //   "POST /v1/submit/create-entity - Minimal Fields",
  //   () => {
  //     it(
  //       "should create entity with minimal required fields only",
  //       async () => {
  //         const associatedPersonsWithUniqueEmails =
  //           validEntity.associatedPersons.map((person) => ({
  //             ...person,
  //             userInfo: {
  //               ...person.userInfo,
  //               email: generateUniqueEmail(person.userInfo.email),
  //             },
  //           }));

  //         const minimalEntity = {
  //           bridgeSignedAgreementId: validEntity.bridgeSignedAgreementId,
  //           byzantineTermsSignedAt: validEntity.byzantineTermsSignedAt,
  //           entityInfo: {
  //             ...validEntity.entityInfo,
  //             email: generateUniqueEmail(validEntity.entityInfo.email),
  //           },
  //           associatedPersons: associatedPersonsWithUniqueEmails,
  //         };

  //         const response = await apiClient.post(
  //           endpoints.create.entity,
  //           minimalEntity,
  //           { authenticated: true, timeout: getTimeout("passkey") },
  //         );

  //         // Should succeed with all required fields
  //         assertSuccessWithSchema(response, "CreateEntityResponse", 201);
  //         assertValidUuid(response.data.entityId);
  //         assertValidUuid(response.data.accountId);

  //         // Find the root user from associated persons
  //         const rootUser = response.data.associatedPersons.find(
  //           (person) => person.isRootUser === true,
  //         );

  //         // Save IDs for use in other tests
  //         saveEntityIds(
  //           response.data.entityId,
  //           response.data.accountId,
  //           rootUser?.userId,
  //         );

  //         console.log(
  //           `✅ Created entity with required fields: ${response.data.entityId}`,
  //         );
  //       },
  //       getTimeout("passkey"),
  //     );
  //   },
  // );

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
