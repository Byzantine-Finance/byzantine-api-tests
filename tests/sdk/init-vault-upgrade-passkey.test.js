/**
 * Passkey vault upgrade SDK Tests, what are tested:
 * - getVaultUpgradePayloadPasskey
 *
 * Note: Passkey tests require WebAuthn setup
 * Enable with: ENABLE_PASSKEY_TESTS=true and ENABLE_PASSKEY_INIT_VAULT_UPGRADE_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertDataHasFields,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import vaultData from "../../fixtures/test-data/__generated__/generated-vaults.json" assert { type: "json" };

// Skip if Passkey tests are disabled
const describeInitPasskey = FEATURE_FLAGS.enablePasskeyTests
  ? describe
  : describe.skip;
const describeInitVaultUpgradePasskey =
  FEATURE_FLAGS.enablePasskeyInitVaultUpgradeTests ? describe : describe.skip;

describeInitPasskey(
  "Initiate Passkey vault upgrade SDK - Using Integrator SDK",
  () => {
    const client = getSdkClient();
    const testAccountId = TEST_DATA.accounts.initVaultUpgradeTargetAccountId;

    // Source vault must be on Base (chain_id 8453). Allow override via env.
    const sourceVaultAddr =
      process.env.TEST_VAULT_UPGRADE_SOURCE_ADDR ||
      vaultData.find((v) => v.chain_id === 8453 && v.is_active)?.vault_address;

    describeInitVaultUpgradePasskey("getVaultUpgradePayloadPasskey()", () => {
      it(
        "should get vault upgrade payload to sign (Base -> Ethereum)",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            sourceVaultAddr,
          };

          assertSchema(requestBody, "VaultUpgradeRequestBody");

          const sdkResponse = await client.api.getVaultUpgradePayloadPasskey(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(sdkResponse, "VaultUpgradePayloadResponse");
          assertDataHasFields(sdkResponse, [
            "bodyToSign",
            "transactionId",
            "sourceAmount",
            "destinationAmount",
            "destinationVaultAddr",
          ]);

          saveBodyToSign(
            "vaultUpgrade",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId,
          );
        },
        getTimeout("api"),
      );
    });
  },
);
