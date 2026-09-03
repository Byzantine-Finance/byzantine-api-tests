/**
 * Vaults SDK Tests, what are tested:
 * - getTopVaults
 * - getVaultApy
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, beforeAll } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertDataArray,
  assertValidEthAddress,
} from "../../utils/sdk-assertions.js";
import { saveActiveVaults } from "../../utils/test-data-persistence.js";

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
        const sdkResponse = await client.api.getTopVaults(DUMMY_AUTH);

        // Assert SDK behavior: array response
        assertSuccess(sdkResponse);
        assertDataArray(sdkResponse, 1);

        // Save active vaults to generated-vaults.json
        saveActiveVaults(sdkResponse.data);
      },
      getTimeout("api")
    );

    it(
      "should return vaults with expected structure",
      async () => {
        const sdkResponse = await client.api.getTopVaults(DUMMY_AUTH);

        // Assert SDK behavior: array with expected data shape
        assertArrayWithSchema(sdkResponse, "TopVault");
      },
      getTimeout("api")
    );

    it(
      "should have valid vault addresses",
      async () => {
        const sdkResponse = await client.api.getTopVaults(DUMMY_AUTH);

        // Assert SDK behavior
        assertSuccess(sdkResponse);
        assertDataArray(sdkResponse, 1);

        sdkResponse.data.forEach((vault) => {
          assertValidEthAddress(vault.vault_address);
        });
      },
      getTimeout("api")
    );
  });

  describe("getVaultApy()", () => {
    // Only a minority of top-vaults have APY history; the rest legitimately
    // answer 404 "No data found for vault". Resolve one that does have data
    // once, rather than assuming the first vault in the list does.
    let apyVaultAddress;

    beforeAll(async () => {
      const vaultsResponse = await client.api.getTopVaults(DUMMY_AUTH);
      assertSuccess(vaultsResponse);
      assertDataArray(vaultsResponse, 1);

      for (const vault of vaultsResponse.data) {
        const probe = await client.api.getVaultApy(
          vault.vault_address,
          DUMMY_AUTH
        );
        if (!probe.error && probe.data) {
          apyVaultAddress = vault.vault_address;
          break;
        }
      }
    }, getTimeout("integration"));

    it(
      "should return APY for specific vault with expected structure",
      async () => {
        if (!apyVaultAddress) {
          console.warn("⚠️  No vault with APY data available — skipping");
          return;
        }

        const apyResponse = await client.api.getVaultApy(
          apyVaultAddress,
          DUMMY_AUTH
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(apyResponse, "ApyResponse");
      },
      getTimeout("api")
    );

    it(
      "should return APY for specific period",
      async () => {
        if (!apyVaultAddress) {
          console.warn("⚠️  No vault with APY data available — skipping");
          return;
        }

        const apyResponse = await client.api.getVaultApy(
          apyVaultAddress,
          DUMMY_AUTH,
          "daily",
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(apyResponse, "ApyResponse");
      },
      getTimeout("api")
    );
  });
});
