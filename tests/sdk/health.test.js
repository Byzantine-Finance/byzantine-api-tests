/**
 * Health SDK Tests
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
import { getTimeout } from "../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertDataHasFields,
} from "../../utils/sdk-assertions.js";

describe("Health SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  it(
    "should return 200 status with health data",
    async () => {
      const sdkResponse = await client.api.healthCheck();
      
      // Assert SDK behavior: success response
      assertSuccess(sdkResponse);
      
      // Assert expected data shape
      expect(sdkResponse.data.status).toBeDefined();
      expect(["healthy", "ok", "up"]).toContain(
        sdkResponse.data.status.toLowerCase()
      );
    },
    getTimeout("api")
  );

  it(
    "should return valid health status with expected data shape",
    async () => {
      const sdkResponse = await client.api.healthCheck();
      
      // Assert SDK behavior: success with expected data shape
      assertSuccessWithSchema(sdkResponse, "HealthResponse");
    },
    getTimeout("api")
  );

  it(
    "should have status field",
    async () => {
      const sdkResponse = await client.api.healthCheck();
      
      // Assert SDK behavior
      assertSuccess(sdkResponse);
      assertDataHasFields(sdkResponse, ["status"]);
    },
    getTimeout("api")
  );
});
