/**
 * Health SDK Tests
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
import { getTimeout } from "../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertHasFields,
} from "../../utils/assertions.js";

describe("Health SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  it(
    "should return 200 status",
    async () => {
      const sdkResponse = await client.api.healthCheck();
      const response = formatSdkResponse(sdkResponse);
      assertSuccess(response);
    },
    getTimeout("api")
  );

  it(
    "should return valid health status with schema validation",
    async () => {
      const sdkResponse = await client.api.healthCheck();
      const response = formatSdkResponse(sdkResponse);
      assertSuccessWithSchema(response, "HealthResponse");
    },
    getTimeout("api")
  );

  it(
    "should have status field",
    async () => {
      const sdkResponse = await client.api.healthCheck();
      const response = formatSdkResponse(sdkResponse);
      assertSuccess(response);
      assertHasFields(response.data, ["status"]);
    },
    getTimeout("api")
  );
});
