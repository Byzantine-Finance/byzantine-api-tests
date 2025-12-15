/**
 * SDK-Specific Test Assertions
 *
 * These assertions work directly with openapi-fetch response format:
 * { data, error, response }
 *
 */

import { expect } from "vitest";
import { validateSchema, validateArraySchema } from "./schemas.js";
import { UUID_REGEX, ETH_ADDRESS_REGEX } from "./constants.js";

/**
 * Format validation errors into readable message
 * @private
 */
function formatValidationErrors(errors, prefix = "") {
  return errors.map((e) => `${prefix}${e}`).join("\n");
}

/**
 * Assert that an SDK response is successful
 * Checks SDK response structure: { data, error, response }
 *
 * @param {object} sdkResponse - SDK response from openapi-fetch { data, error, response }
 */
export function assertSuccess(sdkResponse) {
  expect(sdkResponse.error).toBeUndefined();
  expect(sdkResponse.data).toBeDefined();
  expect(sdkResponse.data).not.toBeNull();
}

/**
 * Assert that an SDK response is an error
 * Checks SDK error handling behavior
 *
 * @param {object} sdkResponse - SDK response from openapi-fetch { data, error, response }
 */
export function assertError(sdkResponse) {
  expect(sdkResponse.error).toBeDefined();
  expect(sdkResponse.data).toBeUndefined();
}

/**
 * Assert SDK response is successful AND data matches expected schema
 * Uses Ajv to validate data shape - ensures SDK returns correctly typed data
 *
 * @param {object} sdkResponse - SDK response { data, error, response }
 * @param {string} schemaName - Schema name from generated schemas (e.g., "CreateUserResponse")
 */
export function assertSuccessWithSchema(sdkResponse, schemaName) {
  // Check SDK response structure (SDK behavior)
  expect(sdkResponse.error).toBeUndefined();
  expect(sdkResponse.data).toBeDefined();

  // Use Ajv to validate data shape (ensures SDK returns typed data matching expected shape)
  const validation = validateSchema(sdkResponse.data, schemaName);

  if (!validation.valid) {
    throw new Error(
      `SDK response data does not match expected shape "${schemaName}":\n` +
        formatValidationErrors(validation.errors, "  - ")
    );
  }
}

/**
 * Assert SDK response is successful AND data is array matching schema
 * Validates that SDK correctly transforms array responses
 *
 * @param {object} sdkResponse - SDK response { data, error, response }
 * @param {string} schemaName - Schema name to validate each array item against
 */
export function assertArrayWithSchema(sdkResponse, schemaName) {
  // Check SDK response structure
  assertSuccess(sdkResponse);
  expect(Array.isArray(sdkResponse.data)).toBe(true);

  // Validate each item in array
  const validation = validateArraySchema(sdkResponse.data, schemaName);

  if (!validation.valid) {
    const errorMessage =
      `SDK response array items do not match expected shape "${schemaName}":\n` +
      validation.errors
        .map(
          (e) =>
            `  - Item ${e.index}:\n${formatValidationErrors(
              e.errors,
              "     - "
            )}`
        )
        .join("\n");
    throw new Error(errorMessage);
  }
}

/**
 * Assert that SDK response data has specific fields
 * Useful for quick checks on SDK response structure
 *
 * @param {object} sdkResponse - SDK response
 * @param {string[]} requiredFields - Array of required field names
 */
export function assertDataHasFields(sdkResponse, requiredFields) {
  assertSuccess(sdkResponse);
  expect(sdkResponse.data).toBeDefined();

  requiredFields.forEach((field) => {
    expect(sdkResponse.data[field]).toBeDefined();
  });
}

/**
 * Assert that a value in SDK response data is a valid UUID
 *
 * @param {object} sdkResponse - SDK response
 * @param {string} fieldPath - Field path (e.g., "userId" or "account.id")
 */
export function assertDataUuid(sdkResponse, fieldPath) {
  assertSuccess(sdkResponse);

  const value = fieldPath
    .split(".")
    .reduce((obj, key) => obj?.[key], sdkResponse.data);
  expect(typeof value).toBe("string");
  expect(value).toMatch(UUID_REGEX);
}

/**
 * Assert that SDK response data is an array
 *
 * @param {object} sdkResponse - SDK response
 * @param {number} minLength - Minimum array length (default: 0)
 */
export function assertDataArray(sdkResponse, minLength = 0) {
  assertSuccess(sdkResponse);
  expect(Array.isArray(sdkResponse.data)).toBe(true);
  expect(sdkResponse.data.length).toBeGreaterThanOrEqual(minLength);
}

/**
 * Assert that SDK response data array items have specific fields
 *
 * @param {object} sdkResponse - SDK response
 * @param {string[]} requiredFields - Required fields in each array item
 */
export function assertDataArrayItemsHaveFields(sdkResponse, requiredFields) {
  assertDataArray(sdkResponse, 1);

  sdkResponse.data.forEach((item, index) => {
    requiredFields.forEach((field) => {
      expect(item[field]).toBeDefined();
    });
  });
}

/**
 * Assert that data matches a schema
 * Uses schema validation from fixtures/schemas.js
 *
 * @param {object} data - Data to validate
 * @param {string} schemaName - Name of schema to validate against
 */
export function assertSchema(data, schemaName) {
  const validation = validateSchema(data, schemaName);

  if (!validation.valid) {
    throw new Error(
      `Schema validation failed for "${schemaName}":\n` +
        formatValidationErrors(validation.errors, "  - ")
    );
  }
}

/**
 * Assert that a value is a valid UUID
 * (Re-exported from assertions.js for convenience)
 *
 * @param {string} value - Value to check
 */
export function assertValidUuid(value) {
  expect(typeof value).toBe("string");
  expect(value).toMatch(UUID_REGEX);
}

/**
 * Assert that a value is a valid Ethereum address
 * (Re-exported from assertions.js for convenience)
 *
 * @param {string} value - Value to check
 */
export function assertValidEthAddress(value) {
  expect(typeof value).toBe("string");
  expect(value).toMatch(ETH_ADDRESS_REGEX);
}
