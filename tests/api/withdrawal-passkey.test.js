/**
 * Withdrawal Transactions API Tests, what are tested:
 * - query/init-withdraw-otp
 * - query/get-withdraw-transaction-passkey
 *
 * Note: Passkey tests require WebAuthn signing capability
 * Enable with: ENABLE_PASSKEY_TESTS=true ENABLE_AUTH_TESTS=true
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
  assertError,
  assertHasFields,
  assertSchema,
} from "../../utils/assertions.js";
import txRequest from "../../fixtures/test-data/transactions/tx-passkey.json" assert { type: "json" };
import { saveBodyToSign } from "../../utils/test-data-persistence.js";

// Skip if OTP and Passkey tests are disabled
const describeWithdrawalPasskey =
  FEATURE_FLAGS.enablePasskeyTests && FEATURE_FLAGS.enableAuthenticatedTests
    ? describe
    : describe.skip;

describeWithdrawalPasskey(
  "Initiate Passkey Withdrawal Transactions API",
  () => {
    const testAccountId = TEST_DATA.accounts.testAccountId;
    const testVaultAddr = TEST_DATA.vaults.selected.address;
    const chainId = TEST_DATA.vaults.selected.chainId;

    describe("POST /v1/query/get-withdraw-transaction-passkey", () => {
      it(
        "should get withdraw transaction body to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
            amount: txRequest.withdrawAmount,
            destinationCurrency: txRequest.destinationCurrency,
          }

          assertSchema(requestBody, "WithdrawRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getWithdrawTransaction(chainId),
            requestBody
          );

          assertSuccessWithSchema(response, "PasskeyTxRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save withdraw bodyToSign and transactionId to tx-passkey.json
          saveBodyToSign(
            "withdraw",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );
    });
  }
);
