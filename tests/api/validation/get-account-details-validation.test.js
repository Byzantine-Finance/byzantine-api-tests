/**
 * get-account-details validation — batch test
 *
 * Iterates over a comma-separated list of account IDs provided via
 * TEST_GET_ACCOUNT_DETAILS_IDS and asserts each response conforms to
 * GetAccountDetailsResponse. Each ID gets its own `it()` so failures
 * point at the specific account.
 *
 * Enable with:
 *   ENABLE_GET_ACCOUNT_DETAILS_VALIDATION_TESTS=true \
 *   TEST_GET_ACCOUNT_DETAILS_IDS="<uuid1>,<uuid2>,..." \
 *     npx vitest run tests/api/validation/get-account-details-validation.test.js
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { getTimeout } from "../../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertValidUuid,
} from "../../../utils/api-assertions.js";

const rawIds = process.env.TEST_GET_ACCOUNT_DETAILS_IDS ?? "";
const accountIds = rawIds
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const enabled =
  process.env.ENABLE_GET_ACCOUNT_DETAILS_VALIDATION_TESTS === "true" &&
  accountIds.length > 0;

const describeValidation = enabled ? describe : describe.skip;

describeValidation("get-account-details validation (batch)", () => {
  console.log(
    `\n━━━ get-account-details batch (${accountIds.length} account${accountIds.length === 1 ? "" : "s"}) ━━━`,
  );

  it.each(accountIds)(
    "returns a valid GetAccountDetailsResponse for %s",
    async (accountId) => {
      const response = await apiClient.get(
        endpoints.accounts.getAccountDetails(accountId),
        { authenticated: true },
      );

      assertSuccessWithSchema(response, "GetAccountDetailsResponse");
      assertSuccess(response);

      const { data } = response;
      expect(data.accountId).toBe(accountId);
      assertValidUuid(data.accountId);
      expect(data.accountName).toBeDefined();
      expect(data.accountType).toMatch(/^(individual|company)$/);
      expect(data.createdAt).toBeDefined();

      // walletDetails (new shape)
      expect(data.walletDetails).toBeDefined();
      expect(data.walletDetails.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof data.walletDetails.isTurnkeyWallet).toBe("boolean");
      expect(data.walletDetails.isSmartAccount).toBeDefined();
      expect(typeof data.walletDetails.isSmartAccount.ethereum).toBe("boolean");
      expect(typeof data.walletDetails.isSmartAccount.base).toBe("boolean");

      // Optional fields: bankAccounts, imageUrl, entityInfo
      if (data.bankAccounts != null) {
        expect(Array.isArray(data.bankAccounts)).toBe(true);
      }
      if (data.imageUrl != null) {
        expect(typeof data.imageUrl).toBe("string");
      }
      if (data.entityInfo != null) {
        expect(data.accountType).toBe("company");
      }

      console.log(
        `  ✅ ${accountId} → ${data.accountType} "${data.accountName}" ` +
          `wallet=${data.walletDetails.walletAddress} ` +
          `turnkey=${data.walletDetails.isTurnkeyWallet} ` +
          `smart={eth:${data.walletDetails.isSmartAccount.ethereum},base:${data.walletDetails.isSmartAccount.base}}`,
      );
    },
    getTimeout("api"),
  );
});

if (!enabled) {
  console.log(
    "ℹ️  get-account-details validation skipped. " +
      "Set ENABLE_GET_ACCOUNT_DETAILS_VALIDATION_TESTS=true and " +
      "TEST_GET_ACCOUNT_DETAILS_IDS=\"<id1>,<id2>,...\" to run.",
  );
}
