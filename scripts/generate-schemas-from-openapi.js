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
    const specHash = crypto.createHash("sha256").update(specString).digest("hex");
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

          // Store with OpenAPI component name
          schemas[schemaName] = jsonSchema;
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

                  schemas[schemaName] = jsonSchema;
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

              schemas[schemaName] = jsonSchema;
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
