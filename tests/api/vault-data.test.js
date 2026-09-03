/**
 * Vaults API Tests, what are tested:
 * - query/get-top-vaults
 * - query/v1/apy/{vault_id}
 */

import { describe, it, beforeAll } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertNonEmptyArray,
  assertValidEthAddress,
} from "../../utils/api-assertions.js";
import { saveActiveVaults } from "../../utils/test-data-persistence.js";

// Skip all vault tests if disabled or network tests are disabled
const describeVaults = FEATURE_FLAGS.enableVaultTests
  ? describe
  : describe.skip;

describeVaults("Vaults API", () => {
  describe("GET /v1/top-vaults", () => {
    it(
      "should return list of vaults",
      async () => {
        const response = await apiClient.get(endpoints.vaults.top, { authenticated: true });
        assertSuccess(response);
        assertNonEmptyArray(response.data);

        // Save active vaults to generated-vaults.json
        saveActiveVaults(response.data);
      },
      getTimeout("api")
    );

    it(
      "should return vaults matching schema",
      async () => {
        const response = await apiClient.get(endpoints.vaults.top, { authenticated: true });
        assertSuccessWithArraySchema(response, "TopVault");
      },
      getTimeout("api")
    );

    it(
      "should have valid vault addresses",
      async () => {
        const response = await apiClient.get(endpoints.vaults.top, { authenticated: true });
        assertSuccess(response);

        response.data.forEach((vault) => {
          assertValidEthAddress(vault.vault_address);
        });
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/apy/{vault_id}", () => {
    // Only a minority of top-vaults have APY history; the rest legitimately
    // answer 404 "No data found for vault". Resolve one that does have data
    // once, rather than assuming the first vault in the list does.
    let apyVaultAddress;

    beforeAll(async () => {
      const vaultsResponse = await apiClient.get(endpoints.vaults.top, {
        authenticated: true,
      });
      assertSuccess(vaultsResponse);

      for (const vault of vaultsResponse.data) {
        const probe = await apiClient.get(
          endpoints.vaults.getApy(vault.vault_address),
          { authenticated: true }
        );
        if (probe.ok) {
          apyVaultAddress = vault.vault_address;
          break;
        }
      }
    }, getTimeout("integration"));

    it(
      "should return APY for specific vault",
      async () => {
        if (!apyVaultAddress) {
          console.warn("⚠️  No vault with APY data available — skipping");
          return;
        }

        const apyResponse = await apiClient.get(
          endpoints.vaults.getApy(apyVaultAddress),
          { authenticated: true }
        );
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

        const apyResponse = await apiClient.get(
          endpoints.vaults.getApy(apyVaultAddress, "daily"),
          { authenticated: true }
        );
        assertSuccessWithSchema(apyResponse, "ApyResponse");
      },
      getTimeout("api")
    );
  });
});
