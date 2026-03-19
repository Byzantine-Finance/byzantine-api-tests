/**
 * Passkey deposit Transactions SDK Tests, what are tested:
 * - getActivateAccountPayloadPasskey
 * - getDepositPayloadPasskey
 * - getWithdrawPayloadPasskey
 *
 * Note: Passkey tests require WebAuthn setup
 * Enable with: ENABLE_PASSKEY_TESTS=true
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
  assertError,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
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

describeInitPasskey(
  "Initiate Passkey transactions SDK - Using Integrator SDK",
  () => {
    const client = getSdkClient();
    const testAccountId = TEST_DATA.accounts.testAccountId;
    const testVaultAddr = TEST_DATA.vaults.selected.address;
    const chainId = TEST_DATA.vaults.selected.chainId;
    const depositAmount = passkeyData.depositAmount;
    const sourceCurrency = passkeyData.sourceCurrency;
    // Get bank account ID from generated-accounts based on destination currency
    const destinationCurrency = passkeyData.destinationCurrency;
    const bankAccountId =
      destinationCurrency === "eur" || destinationCurrency === "eurc"
        ? TEST_DATA.accounts.testEurBankAccountId
        : TEST_DATA.accounts.testUsBankAccountId;

    // Activate account using Passkey
    describeInitActivatePasskey("getActivateAccountPayloadPasskey()", () => {
      it(
        "should get activate account payload to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
          };

          assertSchema(requestBody, "ActivateAccountRequestBody");

          const sdkResponse = await client.api.getActivateAccountPayloadPasskey(
            chainId,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save activateAccount bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "activateAccount",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId,
          );
        },
        getTimeout("api"),
      );
    });

    describeInitDepositPasskey("getDepositPayloadPasskey()", () => {
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

          const sdkResponse = await client.api.getDepositPayloadPasskey(
            chainId,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save deposit bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "deposit",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId,
          );
        },
        getTimeout("api"),
      );
    });

    describeInitWithdrawPasskey("getWithdrawPayloadPasskey()", () => {
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

          const sdkResponse = await client.api.getWithdrawPayloadPasskey(
            chainId,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save withdraw bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "withdraw",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId,
          );
        },
        getTimeout("api"),
      );
    });
  },
);
