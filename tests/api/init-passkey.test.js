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
  // Use a KYC/KYB-approved account for passkey operations
  // Set TEST_PASSKEY_TARGET_ACCOUNT_ID in .env to a verified account
  const testActivateAccountId = TEST_DATA.accounts.initActivateTargetAccountId;
  const testDepositAccountId = TEST_DATA.accounts.initDepositTargetAccountId;
  const testWithdrawAccountId = TEST_DATA.accounts.initWithdrawTargetAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const depositAmount = passkeyData.depositAmount;
  const sourceCurrency = passkeyData.sourceCurrency;
  // Get bank account ID — only needed for fiat off-ramp (usd/eur), not crypto (usdc/eurc)
  const destinationCurrency = passkeyData.destinationCurrency;
  const isCryptoWithdrawal = ["usdc", "eurc"].includes(destinationCurrency);
  const bankAccountId = isCryptoWithdrawal
    ? null
    : destinationCurrency === "eur"
      ? TEST_DATA.accounts.testEurBankAccountId
      : TEST_DATA.accounts.testUsBankAccountId;

  // Activate account using Passkey on both chains
  describeInitActivatePasskey(
    "POST /v1/query/get-activate-account-payload-passkey",
    () => {
      it(
        "should get activate account payload to sign (Base, chain 8453)",
        async () => {
          const requestBody = {
            accountId: testActivateAccountId,
          };

          assertSchema(requestBody, "ActivateAccountRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getActivateAccountPayloadPasskey(8453),
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          saveBodyToSign(
            "activateAccount",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );

      it(
        "should get activate account payload to sign (Ethereum, chain 1)",
        async () => {
          const requestBody = {
            accountId: testActivateAccountId,
          };

          assertSchema(requestBody, "ActivateAccountRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getActivateAccountPayloadPasskey(1),
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          saveBodyToSign(
            "activateAccountEth",
            response.data.bodyToSign,
            response.data.transactionId
          );
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
            accountId: testDepositAccountId,
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
            accountId: testWithdrawAccountId,
            vaultAddr: testVaultAddr,
            amount: passkeyData.withdrawAmount,
            destinationCurrency: destinationCurrency,
            // bankAccountId only needed for fiat off-ramp (eur/usd), not for crypto (usdc)
            ...(bankAccountId && { bankAccountId }),
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
