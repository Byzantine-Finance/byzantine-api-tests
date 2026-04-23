/**
 * Passkey vault upgrade API Tests, what are tested:
 * - query/get-vault-upgrade-payload-passkey
 *
 * Returns two raw payloads (withdraw from Base, deposit on Ethereum)
 * to sign in one passkey prompt. Source vault must be on Base (chain 8453).
 */

import { describe, it } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertHasFields,
  assertSchema,
} from "../../utils/api-assertions.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import vaultData from "../../fixtures/test-data/__generated__/generated-vaults.json" assert { type: "json" };

// Skip if Passkey tests are disabled
const describeInitPasskey = FEATURE_FLAGS.enablePasskeyTests
  ? describe
  : describe.skip;
const describeInitVaultUpgradePasskey =
  FEATURE_FLAGS.enablePasskeyInitVaultUpgradeTests ? describe : describe.skip;

describeInitPasskey("Initiate Passkey vault upgrade API", () => {
  const testAccountId = TEST_DATA.accounts.initVaultUpgradeTargetAccountId;

  // Source vault must be on Base (chain_id 8453). Allow override via env.
  const sourceVaultAddr =
    process.env.TEST_VAULT_UPGRADE_SOURCE_ADDR ||
    vaultData.find((v) => v.chain_id === 8453 && v.is_active)?.vault_address;

  describeInitVaultUpgradePasskey(
    "POST /v1/query/get-vault-upgrade-payload-passkey",
    () => {
      it(
        "should get vault upgrade payload to sign (Base -> Ethereum)",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            sourceVaultAddr,
          };

          assertSchema(requestBody, "VaultUpgradeRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getVaultUpgradePayloadPasskey,
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "VaultUpgradePayloadResponse");
          assertHasFields(response.data, [
            "bodyToSign",
            "transactionId",
            "sourceAmount",
            "destinationAmount",
            "destinationVaultAddr",
          ]);

          saveBodyToSign(
            "vaultUpgrade",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );
    }
  );
});
