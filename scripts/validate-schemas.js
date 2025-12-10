/**
 * Validate Generated JSON Schema definitions at every openapi spec change (one-time check)
 *
 * This script:
 * 1. Loads generated-schemas JSON file
 * 2. Checks that all $ref references can be resolved
 * 3. Tests that schemas can be compiled by Ajv which builds a validation function for each schema
 * 4. Validates that all schemas are valid JSON Schema
 * 5. Exits with error code if any schemas are invalid
 */

import {ajv, prepareSchema} from "../utils/ajv.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validate all generated schemas
 */
function validateSchemas() {
  const schemasPath = path.join(
    __dirname,
    "..",
    "fixtures",
    "__generated__",
    "generated-schemas.json"
  );

  // Check if schemas file exists
  if (!fs.existsSync(schemasPath)) {
    console.error("❌ Generated schemas file not found!");
    console.error(`   Expected: ${schemasPath}`);
    console.error(
      '   Run "npm run generate-schemas" to generate schemas first.'
    );
    process.exit(1);
  }

  // 1. Load schemas
  let generatedSchemas;
  try {
    const schemasContent = fs.readFileSync(schemasPath, "utf8");
    generatedSchemas = JSON.parse(schemasContent);
  } catch (error) {
    console.error("❌ Failed to load generated schemas:");
    console.error(`   ${error.message}`);
    if (error instanceof SyntaxError) {
      console.error("   The generated-schemas.json file is not valid JSON.");
    }
    process.exit(1);
  }

  if (!generatedSchemas || typeof generatedSchemas !== "object") {
    console.error("❌ Invalid schemas file: expected an object");
    process.exit(1);
  }

  // Filter out _comment header property
  const schemaNames = Object.keys(generatedSchemas).filter(
    (name) => name !== "_comment"
  );
  if (schemaNames.length === 0) {
    console.error("❌ No schemas found in generated-schemas.json");
    process.exit(1);
  }

  console.log(`\n🔍 Validating ${schemaNames.length} schemas...\n`);

  // 2. Checks that all $ref references can be resolved
  // Register all schemas with Ajv so $ref references can be resolved during compilation
  for (const [schemaName, schema] of Object.entries(generatedSchemas)) {
    // Skip the _comment header property
    if (schemaName === "_comment") {
      continue;
    }
    if (!schema || typeof schema !== "object") {
      continue;
    }

    try {
      // Register schema with the path that $ref uses
      ajv.addSchema(
        prepareSchema(schema),
        `#/components/schemas/${schemaName}`
      );
    } catch (error) {
      console.error(`❌ Failed to register schema "${schemaName}":`);
      console.error(`   ${error.message}`);
      process.exit(1);
    }
  }

  // 3. Tests that schemas can be compiled by Ajv
  // 4. Validates that all schemas are valid JSON Schema
  // Compilation validates both that schemas are compilable and that they are valid JSON Schema
  const errors = [];
  const warnings = [];

  for (const [schemaName, schema] of Object.entries(generatedSchemas)) {
    // Skip the _comment header property
    if (schemaName === "_comment") {
      continue;
    }
    if (!schema || typeof schema !== "object") {
      warnings.push({
        schema: schemaName,
        message: "Schema is not an object, skipping validation",
      });
      continue;
    }

    try {
      // Compile the schema - this validates it's valid JSON Schema and can be used by Ajv
      ajv.compile(prepareSchema(schema));
      console.log(`  ✓ ${schemaName}`);
    } catch (error) {
      errors.push({
        schema: schemaName,
        message: error.message,
        error: error,
      });
      console.error(`  ✗ ${schemaName}`);
      console.error(`    Error: ${error.message}`);
    }
  }

  // Report results
  console.log("");

  if (warnings.length > 0) {
    console.warn(`⚠️  ${warnings.length} warning(s):`);
    warnings.forEach((w) => {
      console.warn(`   - ${w.schema}: ${w.message}`);
    });
    console.log("");
  }

  // 5. Exits with error code if any schemas are invalid
  if (errors.length > 0) {
    console.error(
      `❌ Validation failed: ${errors.length} schema(s) have errors\n`
    );
    console.error("Errors:");
    errors.forEach((err) => {
      console.error(`\n  Schema: ${err.schema}`);
      console.error(`  Error:  ${err.message}`);
    });
    console.error("\n💡 Check the OpenAPI spec and schema generation process.");
    process.exit(1);
  }

  console.log(
    `✅ All ${schemaNames.length} schemas are valid and compile successfully!`
  );
}

// Run validation
try {
  validateSchemas();
} catch (error) {
  console.error("\n❌ Unexpected error during validation:");
  console.error(error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
