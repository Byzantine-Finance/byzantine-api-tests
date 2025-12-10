/**
 * Vaults SDK Tests, what are tested:
 * - getTopVaults
 * - getVaultApy
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertNonEmptyArray,
  assertValidEthAddress,
} from "../../utils/assertions.js";

// Skip all vault tests if disabled or network tests are disabled
const describeVaults = FEATURE_FLAGS.enableVaultTests
  ? describe
  : describe.skip;

describeVaults("Vaults SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  describe("getTopVaults()", () => {
    it(
      "should return list of vaults",
      async () => {
        const sdkResponse = await client.api.getTopVaults();
        const response = formatSdkResponse(sdkResponse);
        assertSuccess(response);
        assertNonEmptyArray(response.data);
      },
      getTimeout("api")
    );

    it(
      "should return vaults matching schema",
      async () => {
        const sdkResponse = await client.api.getTopVaults();
        const response = formatSdkResponse(sdkResponse);
        assertSuccessWithArraySchema(response, "TopVault");
      },
      getTimeout("api")
    );

    it(
      "should have valid vault addresses",
      async () => {
        const sdkResponse = await client.api.getTopVaults();
        const response = formatSdkResponse(sdkResponse);
        assertSuccess(response);

        response.data.forEach((vault) => {
          assertValidEthAddress(vault.vault_address);
        });
      },
      getTimeout("api")
    );
  });

  describe("getVaultApy()", () => {
    it(
      "should return APY for specific vault",
      async () => {
        // First get a vault ID
        const vaultsResponse = await client.api.getTopVaults();
        const vaults = formatSdkResponse(vaultsResponse);
        assertSuccess(vaults);

        const vaultId = vaults.data[0].vault_address;

        // Then get its APY
        const apyResponse = await client.api.getVaultApy(vaultId);
        const response = formatSdkResponse(apyResponse);
        assertSuccessWithSchema(response, "ApyResponse");
      },
      getTimeout("api")
    );

    it(
      "should return APY for specific period",
      async () => {
        // Get a vault ID
        const vaultsResponse = await client.api.getTopVaults();
        const vaults = formatSdkResponse(vaultsResponse);
        assertSuccess(vaults);

        const vaultId = vaults.data[0].vault_address;

        // Get daily APY
        const apyResponse = await client.api.getVaultApy(vaultId, {
          period: "daily",
        });
        const response = formatSdkResponse(apyResponse);
        assertSuccessWithSchema(response, "ApyResponse");
      },
      getTimeout("api")
    );
  });
});
