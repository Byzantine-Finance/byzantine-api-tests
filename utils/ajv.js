/**
 * Shared Ajv Validator Instance and Helper Functions
 * Ajv is a JSON Schema validator for JavaScript, used to validate data against JSON Schemas.
 *
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

// Initialize Ajv validator with shared configuration
const ajv = new Ajv({
  allErrors: true, // Collect all errors, not just first
  strict: false, // Don't fail on unknown formats
  validateFormats: true, // Validate format constraints (email, date-time, uuid, etc.)
  verbose: true, // Include schema and data in errors
  allowUnionTypes: true, // Allow union types (e.g., ["string", "null"])
});

// Add format validators (email, date-time, uri, uuid, etc.)
addFormats(ajv);

// Add custom format for document upload (to suppress the "unknown format" warning)
ajv.addFormat("data:[MIME];base64,[base64-encoded-data]", true);

/**
 * Prepare schema for Ajv by removing $schema field
 * @param {object} schema - Schema object
 * @returns {object} Schema without $schema field
 */
function prepareSchema(schema) {
  const schemaCopy = { ...schema };
  delete schemaCopy.$schema;
  return schemaCopy;
}

export { ajv, prepareSchema };
