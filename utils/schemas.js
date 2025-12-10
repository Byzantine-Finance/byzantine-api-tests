/**
 * API Schema Validation Utilities
 *
 * This module provides runtime validation functions using JSON Schema definitions generated-schemas.json.
 *
 * Unlike scripts/validate-schemas.js which validates the schemas themselves at build time,
 * this module is used at runtime to validate actual API request/response data against
 * the generated schemas using Ajv.
 *
 * Should use PascalCase for schema names same as the OpenAPI component names.
 */

import { ajv, prepareSchema } from "./ajv.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load generated schemas from OpenAPI
let generatedSchemas = {};

try {
  const schemasPath = path.join(
    __dirname,
    "..",
    "fixtures",
    "__generated__",
    "generated-schemas.json"
  );

  if (fs.existsSync(schemasPath)) {
    generatedSchemas = JSON.parse(fs.readFileSync(schemasPath, "utf8"));

    // Add all schemas to Ajv's schema registry so $ref can be resolved
    // Ajv needs schemas registered with their $ref paths
    for (const [schemaName, schema] of Object.entries(generatedSchemas)) {
      if (schema && typeof schema === "object") {
        // Register schema with the path that $ref uses
        ajv.addSchema(
          prepareSchema(schema),
          `#/components/schemas/${schemaName}`
        );
      }
    }
  } else {
    console.warn(
      '⚠️  Generated schemas file not found. Run "npm run generate-schemas" to generate schemas from OpenAPI'
    );
  }
} catch (error) {
  console.warn("⚠️  Could not load generated schemas:", error.message);
  console.warn(
    '   Run "npm run generate-schemas" to generate schemas from OpenAPI'
  );
}

/**
 * Get JSON Schema for a given schema name
 * Schema names should match OpenAPI component names (PascalCase)
 * @param {string} schemaName - OpenAPI schema name (PascalCase)
 * @returns {object|null} JSON Schema or null if not found
 */
function getJsonSchema(schemaName) {
  if (generatedSchemas[schemaName]) {
    return generatedSchemas[schemaName];
  }

  return null;
}

/**
 * Validate that an object matches a schema using JSON Schema + Ajv
 * @param {object} obj - The object to validate
 * @param {string} schemaName - Name of the schema to validate against
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validateSchema(obj, schemaName) {
  const jsonSchema = getJsonSchema(schemaName);

  if (!jsonSchema) {
    return {
      valid: false,
      errors: [
        `Schema not found: ${schemaName}. Run "npm run generate-schemas" to generate schemas from OpenAPI.`,
      ],
    };
  }

  // Compile and validate
  let validate;
  try {
    validate = ajv.compile(prepareSchema(jsonSchema));
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to compile schema "${schemaName}": ${error.message}`],
    };
  }

  const valid = validate(obj);

  if (!valid) {
    // Format Ajv errors into readable messages
    const errors = validate.errors?.map((err) => {
      const path = err.instancePath || "root";
      const message = err.message;
      const params = err.params ? ` (${JSON.stringify(err.params)})` : "";
      return `${path} ${message}${params}`;
    }) || ["Unknown validation error"];

    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: [],
  };
}

/**
 * Validate an array of objects against a schema
 * @param {array} arr - Array of objects to validate
 * @param {string} schemaName - Name of the schema
 * @returns {object} - { valid: boolean, errors: object[] }
 */
export function validateArraySchema(arr, schemaName) {
  if (!Array.isArray(arr)) {
    return {
      valid: false,
      errors: [{ index: -1, message: "Expected an array" }],
    };
  }

  const allErrors = [];

  arr.forEach((item, index) => {
    const result = validateSchema(item, schemaName);
    if (!result.valid) {
      allErrors.push({
        index,
        errors: result.errors,
      });
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Get a list of all available schema names
 */
export function listSchemas() {
  return Object.keys(generatedSchemas);
}

/**
 * Get schema definition for a given schema name (PascalCase)
 * Returns the JSON Schema object
 */
export function getSchema(schemaName) {
  return getJsonSchema(schemaName);
}

/**
 * Check if a schema exists (PascalCase)
 */
export function hasSchema(schemaName) {
  return getJsonSchema(schemaName) !== null;
}