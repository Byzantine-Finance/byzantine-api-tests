/**
 * Generate JSON Schema files from OpenAPI spec
 *
 * This script:
 * 1. Fetches OpenAPI spec from the API
 * 2. Converts OpenAPI schemas to JSON Schema format
 * 3. Saves generated schemas to fixtures/schemas/
 *
 * To see the changes in the generated schemas, you can:
 * 1. Backup the current generated schemas
 * cp fixtures/__generated__/generated-schemas.json fixtures/__generated__/generated-schemas.json.backup
 * 2. Run the schema generation
 * npm run generate-schemas
 * 3. Compare the differences
 * diff fixtures/__generated__/generated-schemas.json.backup fixtures/__generated__/generated-schemas.json
 */

import { openapiSchemaToJsonSchema } from "@openapi-contrib/openapi-schema-to-json-schema";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { getEnvironmentBaseURL } from "../config/environments.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Post-process schema to fix nullable fields in allOf
 * When OpenAPI has nullable: true with allOf, convert to anyOf to properly handle null
 * @dev The openapiSchemaToJsonSchema library doesn't handle the case where nullable is true with allOf correctly.
 */
function fixNullableInAllOf(schema, openApiSchema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return schema;

  if (openApiSchema?.nullable === true && schema.allOf) {
    const refSchema = schema.allOf?.[0];
    if (refSchema && refSchema.$ref) {
      // Convert allOf to anyOf to properly handle nullable
      // anyOf means "at least one of these must match"
      // So we create two branches: one for the actual schema, one for null
      const allOfSchema = {
        allOf: schema.allOf,
      };
      // Preserve any other properties except type (which conflicts)
      if (schema.description) allOfSchema.description = schema.description;
      if (schema.examples) allOfSchema.examples = schema.examples;

      schema.anyOf = [
        allOfSchema, // The allOf schema (for non-null values)
        { type: "null" }, // Allow null values
      ];
      delete schema.allOf; // Remove allOf since we're using anyOf now
      delete schema.type; // Remove type since anyOf handles it
    }
  }

  // Recursively process nested schemas
  if (schema.properties && openApiSchema?.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      if (openApiSchema.properties[key]) {
        schema.properties[key] = fixNullableInAllOf(
          value,
          openApiSchema.properties[key]
        );
      }
    }
  }

  return schema;
}

/**
 * Generate JSON Schema files from OpenAPI spec
 */
async function generateSchemasFromOpenAPI() {
  try {
    // Get OpenAPI URL from environment config
    const apiBaseURL = getEnvironmentBaseURL();
    const openApiUrl =
      process.env.OPENAPI_URL ||
      `${apiBaseURL}/api-docs/openapi-integrator.json`;

    console.log(`Fetching OpenAPI spec from: ${openApiUrl}`);

    // Fetch OpenAPI spec
    const response = await fetch(openApiUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}\n` +
          `URL: ${openApiUrl}\n`
      );
    }

    const openApiSpec = await response.json();
    console.log(
      `✅ Successfully fetched OpenAPI spec (version: ${
        openApiSpec.info?.version || "unknown"
      })`
    );

    // Create output directory
    const outputDir = path.join(__dirname, "..", "fixtures", "__generated__");
    fs.mkdirSync(outputDir, { recursive: true });

    // Generate checksum for the spec
    const specString = JSON.stringify(openApiSpec);
    const specHash = crypto
      .createHash("sha256")
      .update(specString)
      .digest("hex");
    console.log(`Spec SHA-256: ${specHash.substring(0, 16)}...`);

    // Check if spec has changed
    const hashFile = path.join(outputDir, "generated-schemas.hash");
    const schemasFile = path.join(outputDir, "generated-schemas.json");

    // Early exit if spec unchanged and schemas already exist
    if (fs.existsSync(hashFile) && fs.existsSync(schemasFile)) {
      const previousHash = fs.readFileSync(hashFile, "utf-8").trim();
      if (previousHash === specHash) {
        console.log("ℹ️  Spec unchanged - no need to regenerate schemas\n");
        process.exit(0);
      }
      console.log("Spec changed - regenerating schemas");
    } else {
      console.log("No hash file or schemas file found - generating schemas");
    }

    // Save hash file
    fs.writeFileSync(hashFile, specHash);

    const schemas = {};

    // Extract schemas from OpenAPI components (using $ref)
    if (openApiSpec.components?.schemas) {
      for (const [schemaName, openApiSchema] of Object.entries(
        openApiSpec.components.schemas
      )) {
        try {
          // Convert OpenAPI schema to JSON Schema
          const jsonSchema = openapiSchemaToJsonSchema(openApiSchema, {
            supportPatternProperties: true,
            removeReadOnly: false,
            removeWriteOnly: false,
            strictMode: false,
          });

          // Fix nullable fields in allOf
          const fixedSchema = fixNullableInAllOf(jsonSchema, openApiSchema);

          // Store with OpenAPI component name
          schemas[schemaName] = fixedSchema;
        } catch (error) {
          console.warn(
            `  ⚠️ Failed to convert schema "${schemaName}": ${error.message}`
          );
        }
      }
    } else {
      console.warn("⚠️ No components.schemas found in OpenAPI spec");
    }

    // Also extract response schemas from paths (for endpoints that don't use components $ref)
    // Skip schemas that use components
    let pathSchemaCount = 0;
    if (openApiSpec.paths) {
      for (const [path, methods] of Object.entries(openApiSpec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (operation.responses) {
            for (const [statusCode, response] of Object.entries(
              operation.responses
            )) {
              if (response.content?.["application/json"]?.schema) {
                const openApiSchema =
                  response.content["application/json"].schema;

                // Skip if schema is just a $ref
                if (
                  openApiSchema.$ref &&
                  Object.keys(openApiSchema).length === 1
                ) {
                  continue;
                }

                const operationId =
                  operation.operationId ||
                  `${method}_${path.replace(/\//g, "_")}`;
                const schemaName = `${operationId}_${statusCode}`;

                try {
                  const jsonSchema = openapiSchemaToJsonSchema(openApiSchema, {
                    supportPatternProperties: true,
                    strictMode: false,
                  });

                  // Fix nullable fields in allOf
                  const fixedSchema = fixNullableInAllOf(
                    jsonSchema,
                    openApiSchema
                  );

                  schemas[schemaName] = fixedSchema;
                  pathSchemaCount++;
                } catch (error) {
                  console.warn(
                    `  ⚠️  Failed to convert response schema "${schemaName}": ${error.message}`
                  );
                }
              }
            }
          }

          // Also extract request body schemas
          if (operation.requestBody?.content?.["application/json"]?.schema) {
            const openApiSchema =
              operation.requestBody.content["application/json"].schema;

            // Skip if schema is just a $ref (already exists in components)
            if (openApiSchema.$ref && Object.keys(openApiSchema).length === 1) {
              continue;
            }

            const operationId =
              operation.operationId || `${method}_${path.replace(/\//g, "_")}`;
            const schemaName = `${operationId}_Request`;

            try {
              const jsonSchema = openapiSchemaToJsonSchema(openApiSchema, {
                supportPatternProperties: true,
                strictMode: false,
              });

              // Fix nullable fields in allOf
              const fixedSchema = fixNullableInAllOf(jsonSchema, openApiSchema);

              schemas[schemaName] = fixedSchema;
              pathSchemaCount++;
            } catch (error) {
              console.warn(
                `  ⚠️  Failed to convert request schema "${schemaName}": ${error.message}`
              );
            }
          }
        }
      }
    }

    // Add header comment with hash to indicate file is auto-generated
    const schemasWithHeader = {
      _comment: `This file is auto-generated. Do not modify by hand.\nGenerated from: ${openApiUrl}\nGenerated at: ${new Date().toISOString()}\nSpec SHA-256: ${specHash}`,
      ...schemas,
    };

    // Write schemas to file
    fs.writeFileSync(schemasFile, JSON.stringify(schemasWithHeader, null, 2));
    console.log(`\n✅ Generated ${Object.keys(schemas).length} schemas`);
    if (pathSchemaCount > 0) {
      console.log(
        `   - ${pathSchemaCount} inline schemas extracted from paths`
      );
    }
    console.log(`📁 Schemas saved to: ${schemasFile}`);

    return { schemas };
  } catch (error) {
    console.error("\n❌ Schema generation failed:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1])
) {
  generateSchemasFromOpenAPI();
}

export { generateSchemasFromOpenAPI };
