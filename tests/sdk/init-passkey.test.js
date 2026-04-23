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
  assertSchema,
} from "../../utils/sdk-assertions.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";

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
    // Use a KYC/KYB-approved account for passkey operations
    // Set TEST_PASSKEY_TARGET_ACCOUNT_ID in .env to a verified account
    const testActivateAccountId = TEST_DATA.accounts.initActivateTargetAccountId;
    const testDepositAccountId = TEST_DATA.accounts.initDepositTargetAccountId;
    const testWithdrawAccountId = TEST_DATA.accounts.initWithdrawTargetAccountId;
    const testVaultAddr = TEST_DATA.vaults.selected.address;
    const chainId = TEST_DATA.vaults.selected.chainId;
    // Amounts + currencies come from .env (DEPOSIT_AMOUNT, SOURCE_CURRENCY,
    // WITHDRAW_AMOUNT, DESTINATION_CURRENCY). Set them before running this file.
    const depositAmount = process.env.DEPOSIT_AMOUNT;
    const sourceCurrency = process.env.SOURCE_CURRENCY;
    const withdrawAmount = process.env.WITHDRAW_AMOUNT;
    // Get bank account ID — only needed for fiat off-ramp (usd/eur), not crypto (usdc/eurc)
    const destinationCurrency = process.env.DESTINATION_CURRENCY;
    const isCryptoWithdrawal = ["usdc", "eurc"].includes(destinationCurrency);
    const bankAccountId = isCryptoWithdrawal
      ? null
      : destinationCurrency === "eur"
        ? TEST_DATA.accounts.testEurBankAccountId
        : TEST_DATA.accounts.testUsBankAccountId;

    // Activate account using Passkey on both chains
    describeInitActivatePasskey("getActivateAccountPayloadPasskey()", () => {
      it(
        "should get activate account payload to sign (Base, chain 8453)",
        async () => {
          const requestBody = {
            accountId: testActivateAccountId,
          };

          assertSchema(requestBody, "ActivateAccountRequestBody");

          const sdkResponse = await client.api.getActivateAccountPayloadPasskey(
            8453,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          saveBodyToSign(
            "activateAccount",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId,
          );
        },
        getTimeout("api"),
      );

      it(
        "should get activate account payload to sign (Ethereum, chain 1)",
        async () => {
          const requestBody = {
            accountId: testActivateAccountId,
          };

          assertSchema(requestBody, "ActivateAccountRequestBody");

          const sdkResponse = await client.api.getActivateAccountPayloadPasskey(
            1,
            requestBody,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          saveBodyToSign(
            "activateAccountEth",
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
            accountId: testDepositAccountId,
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
            accountId: testWithdrawAccountId,
            vaultAddr: testVaultAddr,
            amount: withdrawAmount,
            destinationCurrency: destinationCurrency,
            // bankAccountId only needed for fiat off-ramp (eur/usd), not for crypto (usdc)
            ...(bankAccountId && { bankAccountId }),
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
