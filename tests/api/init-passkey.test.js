/**
 * Passkey deposit Transactions API Tests, what are tested:
 * - query/get-activate-account-payload-passkey
 * - query/get-deposit-payload-passkey
 * - query/get-withdraw-payload-passkey
 *
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
const describeInitActivatePasskey = FEATURE_FLAGS.enablePasskeyInitActivateTests
  ? describe
  : describe.skip;
const describeInitDepositPasskey = FEATURE_FLAGS.enablePasskeyInitDepositTests
  ? describe
  : describe.skip;
const describeInitWithdrawPasskey = FEATURE_FLAGS.enablePasskeyInitWithdrawTests
  ? describe
  : describe.skip;

describeInitPasskey("Initiate Passkey transactions API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const depositAmount = passkeyData.depositAmount;
  const sourceCurrency = passkeyData.sourceCurrency;
  // Get bank account ID from generated-accounts based on destination currency
  const destinationCurrency = passkeyData.destinationCurrency;
  const bankAccountId = destinationCurrency === "eur" || destinationCurrency === "eurc"
    ? TEST_DATA.accounts.testEurBankAccountId
    : TEST_DATA.accounts.testUsBankAccountId;

  // Activate account using Passkey
  describeInitActivatePasskey(
    "POST /v1/query/get-activate-account-payload-passkey",
    () => {
      it(
        "should get activate account payload to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
          };

          assertSchema(requestBody, "ActivateAccountRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getActivateAccountPayloadPasskey(chainId),
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save activateAccount bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "activateAccount",
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
          };

          const response = await apiClient.post(
            endpoints.passkey.getActivateAccountPayloadPasskey(99999), // Invalid chain ID
            requestBody,
            { authenticated: true }
          );

          assertError(response, 400);
        },
        getTimeout("api")
      );
    }
  );

  describeInitDepositPasskey(
    "POST /v1/query/get-deposit-payload-passkey",
    () => {
      it(
        "should get deposit payload to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
            amount: depositAmount,
            sourceCurrency: sourceCurrency,
          };

          assertSchema(requestBody, "DepositRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getDepositPayloadPasskey(chainId),
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
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
    "POST /v1/query/get-withdraw-payload-passkey",
    () => {
      it(
        "should get withdraw payload to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
            amount: passkeyData.withdrawAmount,
            destinationCurrency: destinationCurrency,
            bankAccountId: bankAccountId,
          };

          assertSchema(requestBody, "WithdrawRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getWithdrawPayloadPasskey(chainId),
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
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
