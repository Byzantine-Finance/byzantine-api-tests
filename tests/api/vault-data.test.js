/**
 * Vaults API Tests, what are tested:
 * - query/get-top-vaults
 * - query/v1/apy/{vault_id}
 */

import { describe, it } from "vitest";
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
        const response = await apiClient.get(endpoints.vaults.top);
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
        const response = await apiClient.get(endpoints.vaults.top);
        assertSuccessWithArraySchema(response, "TopVault");
      },
      getTimeout("api")
    );

    it(
      "should have valid vault addresses",
      async () => {
        const response = await apiClient.get(endpoints.vaults.top);
        assertSuccess(response);

        response.data.forEach((vault) => {
          assertValidEthAddress(vault.vault_address);
        });
      },
      getTimeout("api")
    );
  });

  describe("GET /v1/apy/{vault_id}", () => {
    it(
      "should return APY for specific vault",
      async () => {
        // First get a vault ID
        const vaultsResponse = await apiClient.get(endpoints.vaults.top);
        assertSuccess(vaultsResponse);

        const vaultId = vaultsResponse.data[0].vault_address;

        // Then get its APY
        const apyResponse = await apiClient.get(
          endpoints.vaults.getApy(vaultId)
        );
        assertSuccessWithSchema(apyResponse, "ApyResponse");
      },
      getTimeout("api")
    );

    it(
      "should return APY for specific period",
      async () => {
        // Get a vault ID
        const vaultsResponse = await apiClient.get(endpoints.vaults.top);
        assertSuccess(vaultsResponse);

        const vaultId = vaultsResponse.data[0].vault_address;

        // Get daily APY
        const apyResponse = await apiClient.get(
          endpoints.vaults.getApy(vaultId, "daily")
        );
        assertSuccessWithSchema(apyResponse, "ApyResponse");
      },
      getTimeout("api")
    );
  });
});
