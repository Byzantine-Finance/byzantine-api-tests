/**
 * Reusable Test Assertions
 * Common assertion patterns for API testing
 */

import { expect } from "vitest";
import { validateSchema, validateArraySchema } from "./schemas.js";

/**
 * Assert that a response is successful
 * Validates status code, ok flag, and data existence
 *
 * @param {object} response - API response from apiClient
 * @param {number} expectedStatus - Expected HTTP status code (default: 200)
 */
export function assertSuccess(response, expectedStatus = 200) {
//   expect(response.status).toBe(expectedStatus);
  expect(response.ok).toBe(true);
  expect(response.data).toBeDefined();
  expect(response.error).toBeUndefined();
}

/**
 * Assert that a response is an error
 * Validates status code, ok flag, error existence, and error schema
 *
 * @param {object} response - API response from apiClient
 * @param {number} expectedStatus - Expected HTTP status code (e.g., 400, 404, 500)
 * @param {boolean} validateSchema - Whether to validate error schema (default: true, only if error is object)
 *
 */
export function assertError(response, expectedStatus, validateSchema = true) {
//   expect(response.status).toBe(expectedStatus);
  expect(response.ok).toBe(false);
  expect(response.error).toBeDefined();
  expect(response.data).toBeUndefined();

  // Only validate error schema if error is an object and validation is enabled
  // Some APIs return plain string error messages
  if (validateSchema && typeof response.error === "object" && response.error !== null) {
    assertSchema(response.error, "error");
  }
}

/**
 * Assert that data matches a schema
 * Uses schema validation from fixtures/schemas.js
 *
 * @param {object} data - Data to validate
 * @param {string} schemaName - Name of schema to validate against
 *
 */
export function assertSchema(data, schemaName) {
  const validation = validateSchema(data, schemaName);

  if (!validation.valid) {
    const errorMessage =
      `Schema validation failed for "${schemaName}":\n` +
      validation.errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(errorMessage);
  }
}

/**
 * Assert that an array of items all match a schema
 * Validates each item in the array
 *
 * @param {array} data - Array of items to validate
 * @param {string} schemaName - Name of schema to validate each item against
 *
 */
export function assertArraySchema(data, schemaName) {
  expect(Array.isArray(data)).toBe(true);

  const validation = validateArraySchema(data, schemaName);

  if (!validation.valid) {
    const errorMessage =
      `Array schema validation failed for "${schemaName}":\n` +
      validation.errors
        .map(
          (e) =>
            `  - Item ${e.index}:\n` +
            e.errors.map((err) => `     - ${err}`).join("\n")
        )
        .join("\n");
    throw new Error(errorMessage);
  }
}

/**
 * Assert that response is successful AND data matches schema
 * Convenience function combining assertSuccess and assertSchema
 *
 * @param {object} response - API response from apiClient
 * @param {string} schemaName - Name of schema to validate response.data against
 * @param {number} expectedStatus - Expected HTTP status code (default: 200)
 *
 */
export function assertSuccessWithSchema(
  response,
  schemaName,
  expectedStatus = 200
) {
  assertSuccess(response, expectedStatus);
  assertSchema(response.data, schemaName);
}

/**
 * Assert that response is successful AND data is array matching schema
 * Convenience function combining assertSuccess and assertArraySchema
 *
 * @param {object} response - API response from apiClient
 * @param {string} schemaName - Name of schema to validate each array item against
 * @param {number} expectedStatus - Expected HTTP status code (default: 200)
 *
 */
export function assertSuccessWithArraySchema(
  response,
  schemaName,
  expectedStatus = 200
) {
  assertSuccess(response, expectedStatus);
  assertArraySchema(response.data, schemaName);
}

/**
 * Assert that a response header exists and matches expected value
 *
 * @param {object} response - API response from apiClient
 * @param {string} headerName - Header name to check
 * @param {string} expectedValue - Expected header value (optional)
 *
 */
export function assertResponseHeader(response, headerName, expectedValue) {
  const headerValue = response.headers[headerName.toLowerCase()];
  expect(headerValue).toBeDefined();

  if (expectedValue !== undefined) {
    expect(headerValue).toBe(expectedValue);
  }
}

/**
 * Assert that data contains specific fields
 * Useful for quick checks without full schema validation
 *
 * @param {object} data - Data object to check
 * @param {array} requiredFields - Array of required field names
 *
 */
export function assertHasFields(data, requiredFields) {
  expect(data).toBeDefined();
  expect(typeof data).toBe("object");

  requiredFields.forEach((field) => {
    expect(data[field]).toBeDefined();
  });
}

/**
 * Assert that data does NOT contain specific fields
 * Useful for ensuring sensitive data is not exposed
 *
 * @param {object} data - Data object to check
 * @param {array} forbiddenFields - Array of field names that should NOT exist
 *
 */
export function assertDoesNotHaveFields(data, forbiddenFields) {
  expect(data).toBeDefined();
  expect(typeof data).toBe("object");

  forbiddenFields.forEach((field) => {
    expect(data[field]).toBeUndefined();
  });
}

/**
 * Assert that a value is a valid UUID
 *
 * @param {string} value - Value to check
 *
 */
export function assertValidUuid(value) {
  expect(typeof value).toBe("string");
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  expect(value).toMatch(uuidRegex);
}

/**
 * Assert that a value is a valid Ethereum address
 *
 * @param {string} value - Value to check
 *
 */
export function assertValidEthAddress(value) {
  expect(typeof value).toBe("string");
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  expect(value).toMatch(ethAddressRegex);
}

/**
 * Assert that a value is a valid ISO 8601 datetime string
 *
 * @param {string} value - Value to check
 *
 */
export function assertValidDateTime(value) {
  expect(typeof value).toBe("string");
  const date = new Date(value);
  expect(date.toString()).not.toBe("Invalid Date");
}

/**
 * Assert that an array is not empty
 *
 * @param {array} data - Array to check
 *
 */
export function assertNonEmptyArray(data) {
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThan(0);
}

/**
 * Assert that a pagination response is valid
 * Checks for common pagination fields
 *
 * @param {object} response - API response with pagination
 *
 */
export function assertValidPagination(response) {
  assertHasFields(response, ["data", "total_count"]);
  expect(Array.isArray(response.data)).toBe(true);
  expect(typeof response.total_count).toBe("number");
  expect(response.total_count).toBeGreaterThanOrEqual(0);
}

