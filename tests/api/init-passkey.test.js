/**
 * Passkey deposit Transactions API Tests, what are tested:
 * - query/get-approve-transaction-passkey
 * - query/get-deposit-transaction-passkey
 *
 * Note: OTP tests require receiving real OTP codes via email
 * Enable with: ENABLE_OTP_TESTS=true ENABLE_AUTH_TESTS=true
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
  assertError,
  assertSchema,
} from "../../utils/api-assertions.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json";
import passkeyData from "../../fixtures/test-data/passkey-data.json";

// Skip if Passkey tests are disabled
const describeInitPasskey = FEATURE_FLAGS.enablePasskeyTests
  ? describe
  : describe.skip;
const describeInitApprovePasskey = FEATURE_FLAGS.enablePasskeyInitApproveTests
  ? describe
  : describe.skip;
const describeInitDepositPasskey = FEATURE_FLAGS.enablePasskeyInitDepositTests
  ? describe
  : describe.skip;
const describeInitWithdrawPasskey = FEATURE_FLAGS.enablePasskeyInitWithdrawTests
  ? describe
  : describe.skip;

describeInitPasskey("Initiate Passkey transactions API", () => {
  const testAccountId = passkeyData.accountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const depositAmount = txRequest.depositAmount;
  const sourceCurrency = txRequest.sourceCurrency;

  // Deposit using Passkey
  describeInitApprovePasskey(
    "POST /v1/query/get-approve-transaction-passkey",
    () => {
      it(
        "should get approve transaction body to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
          };

          assertSchema(requestBody, "ApproveRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getApproveTransaction(chainId),
            requestBody
          );

          assertSuccessWithSchema(response, "PasskeyTxRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save approve bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "approve",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );

      it(
        "should reject invalid chain ID",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
          };

          assertSchema(requestBody, "ApproveRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getApproveTransaction(99999), // Invalid chain ID
            requestBody
          );

          assertError(response, 400);
        },
        getTimeout("api")
      );
    }
  );

  describeInitDepositPasskey(
    "POST /v1/query/get-deposit-transaction-passkey",
    () => {
      it(
        "should get deposit transaction body to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
            amount: depositAmount,
            sourceCurrency: sourceCurrency,
          };

          assertSchema(requestBody, "DepositRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getDepositTransaction(chainId),
            requestBody
          );

          assertSuccessWithSchema(response, "PasskeyTxRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save deposit bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "deposit",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );
    }
  );

  describeInitWithdrawPasskey(
    "POST /v1/query/get-withdraw-transaction-passkey",
    () => {
      it(
        "should get withdraw transaction body to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
            amount: txRequest.withdrawAmount,
            destinationCurrency: txRequest.destinationCurrency,
          };

          assertSchema(requestBody, "WithdrawRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getWithdrawTransaction(chainId),
            requestBody
          );

          assertSuccessWithSchema(response, "PasskeyTxRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save withdraw bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "withdraw",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );
    }
  );
});
