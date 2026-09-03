/**
 * Associated Persons SDK Tests -- step-by-step flow
 *
 * Step 1: Add all associated persons from add-associated-persons.json (ADD_ASSOCIATED_PERSONS=true)
 * Step 2: Update the UBO associated person (UPDATE_BENEFICIARY=true)
 *
 * Run each step independently:
 *   ADD_ASSOCIATED_PERSONS=true npx vitest run tests/sdk/associated-persons.test.js
 *   UPDATE_BENEFICIARY=true npx vitest run tests/sdk/associated-persons.test.js
 *
 * Note: These tests use authenticated endpoints and modify data. Write tests
 * are on by default outside production; disable with ENABLE_WRITE_TESTS=false.
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSchema,
  assertDataHasFields,
  assertValidUuid,
} from "../../utils/sdk-assertions.js";

// Import test data from fixtures
import addUboData from "../../fixtures/test-data/associated-persons/add-associated-persons.json" assert { type: "json" };
import updateAssociatedPersonData from "../../fixtures/test-data/associated-persons/update-associated-person.json" assert { type: "json" };

// Persistence for beneficiaryId across steps
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENEFICIARY_FILE = join(
  __dirname,
  "../../fixtures/test-data/__generated__/generated-beneficiary.json",
);

function saveBeneficiaryId(beneficiaryId, label) {
  const currentData = existsSync(BENEFICIARY_FILE)
    ? JSON.parse(readFileSync(BENEFICIARY_FILE, "utf-8"))
    : {};
  const updatedData = {
    ...currentData,
    [label]: beneficiaryId,
    lastUpdated: new Date().toISOString(),
  };
  writeFileSync(BENEFICIARY_FILE, JSON.stringify(updatedData, null, 2), "utf-8");
}

function loadBeneficiaryId(label) {
  if (!existsSync(BENEFICIARY_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(BENEFICIARY_FILE, "utf-8"));
    return data[label] || null;
  } catch {
    return null;
  }
}

// Skip if write tests are disabled
const describeFlow = FEATURE_FLAGS.enableWriteTests
  ? describe
  : describe.skip;

const useFixtureEmail = process.env.USE_FIXTURE_EMAIL === "true";

// Step-level flags
const describeStep1 =
  process.env.ADD_ASSOCIATED_PERSONS === "true" ? describe : describe.skip;
const describeStep2 =
  process.env.UPDATE_BENEFICIARY === "true" ? describe : describe.skip;

describeFlow("Associated Persons SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testEntityAccountId = TEST_DATA.accounts.testEntityAccountId;

  // ------------------------------------------
  // Step 1: Add all associated persons
  // ------------------------------------------
  describeStep1(
    "Step 1 -- addAssociatedPerson()",
    () => {
      it(
        "should add all associated persons to entity account",
        async () => {
          const uniqueSuffix = Date.now();

          for (const [index, person] of addUboData.associatedPersons.entries()) {
            const email = useFixtureEmail
              ? person.userInfo.email
              : `lin+person-${index}-${uniqueSuffix}@example.com`;
            const requestBody = {
              accountId: testEntityAccountId,
              associatedPerson: {
                ...person,
                userInfo: {
                  ...person.userInfo,
                  email,
                },
              },
            };

            assertSchema(requestBody, "AddAssociatedPersonRequest");

            const sdkResponse = await client.api.addAssociatedPerson(
              requestBody,
              DUMMY_AUTH,
            );

            assertSuccessWithSchema(sdkResponse, "AssociatedPersonResponse");
            assertValidUuid(sdkResponse.data.beneficiaryId);
            assertDataHasFields(sdkResponse, [
              "verificationStatus",
              "userInfo",
              "beneficiaryDetails",
            ]);

            const label = sdkResponse.data.beneficiaryDetails?.beneficiaryType?.includes("ubo")
              ? "ubo"
              : sdkResponse.data.beneficiaryDetails?.beneficiaryType?.includes("representative")
              ? "representative"
              : `person_${index}`;
            saveBeneficiaryId(sdkResponse.data.beneficiaryId, label);

            console.log(
              `Added associated person [${index}]: beneficiaryId=${sdkResponse.data.beneficiaryId}`,
            );
            console.log(
              `   verificationStatus=${sdkResponse.data.verificationStatus}`,
            );
            if (sdkResponse.data.verificationDocuments) {
              console.log(
                `   verificationDocuments: ${sdkResponse.data.verificationDocuments.length} doc(s)`,
              );
            }
            if (sdkResponse.data.missingDocuments) {
              console.log(
                `   missingDocuments: ${JSON.stringify(sdkResponse.data.missingDocuments)}`,
              );
            }
          }
        },
        getTimeout("api"),
      );
    },
  );

  // ------------------------------------------
  // Step 2: Update the UBO associated person
  // ------------------------------------------
  describeStep2(
    "Step 2 -- updateAssociatedPerson()",
    () => {
      it(
        "should update the UBO associated person's details",
        async () => {
          const beneficiaryId =
            process.env.TEST_BENEFICIARY_ID || loadBeneficiaryId("ubo");

          if (!beneficiaryId) {
            throw new Error(
              "No beneficiaryId available -- run Step 1 (ADD_ASSOCIATED_PERSONS=true) first or set TEST_BENEFICIARY_ID",
            );
          }

          const requestBody = {
            beneficiaryId,
            ...updateAssociatedPersonData,
          };

          assertSchema(requestBody, "UpdateAssociatedPersonRequest");

          const sdkResponse = await client.api.updateAssociatedPerson(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(
            sdkResponse,
            "UpdateAssociatedPersonResponse",
          );
          assertValidUuid(sdkResponse.data.beneficiaryId);
          assertDataHasFields(sdkResponse, ["verificationStatus"]);

          // The update is a partial PATCH: only the fields the fixture sends are
          // changed, and the response echoes back only those. So the expected
          // values come from the fixture rather than being hardcoded here —
          // editing update-associated-person.json no longer breaks this test.
          const sentDetails =
            updateAssociatedPersonData.associatedPerson?.beneficiaryDetails;
          if (sdkResponse.data.beneficiaryDetails && sentDetails) {
            const got = sdkResponse.data.beneficiaryDetails;
            if (sentDetails.ownershipPercentage != null) {
              expect(got.ownershipPercentage).toBe(
                sentDetails.ownershipPercentage,
              );
            }
            if (sentDetails.title != null) {
              expect(got.title).toBe(sentDetails.title);
            }
            if (sentDetails.beneficiaryType != null) {
              expect([...got.beneficiaryType].sort()).toEqual(
                [...sentDetails.beneficiaryType].sort(),
              );
            }
          }

          console.log(
            `Updated associated person: beneficiaryId=${sdkResponse.data.beneficiaryId}`,
          );
          console.log(
            `   verificationStatus=${sdkResponse.data.verificationStatus}`,
          );
          if (sdkResponse.data.userInfo) {
            console.log(
              `   userInfo: firstName=${sdkResponse.data.userInfo.firstName}, lastName=${sdkResponse.data.userInfo.lastName}, birthDate=${sdkResponse.data.userInfo.birthDate}`,
            );
          }
          if (sdkResponse.data.beneficiaryDetails) {
            console.log(
              `   beneficiaryDetails: ownershipPercentage=${sdkResponse.data.beneficiaryDetails.ownershipPercentage}`,
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
