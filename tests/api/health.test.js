/**
 * Health API Tests
 * Example demonstrating how to use the assertion helpers
 */

import { describe, it } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout } from "../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertHasFields,
} from "../../utils/api-assertions.js";

describe("Health API - Direct HTTP", () => {
  it(
    "should return 200 status",
    async () => {
      const response = await apiClient.get(endpoints.health);
      assertSuccess(response);
    },
    getTimeout("api")
  );

  it(
    "should return valid health status with schema validation",
    async () => {
      const response = await apiClient.get(endpoints.health);
      assertSuccessWithSchema(response, "HealthResponse");
    },
    getTimeout("api")
  );

  it(
    "should have status field",
    async () => {
      const response = await apiClient.get(endpoints.health);
      assertSuccess(response);
      assertHasFields(response.data, ["status"]);
    },
    getTimeout("api")
  );
});
