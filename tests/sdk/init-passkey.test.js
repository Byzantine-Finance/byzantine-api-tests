/**
 * Passkey deposit Transactions SDK Tests, what are tested:
 * - getApproveTransactionPasskey
 * - getDepositTransactionPasskey
 * - getWithdrawTransactionPasskey
 *
 * Note: Passkey tests require WebAuthn setup
 * Enable with: ENABLE_PASSKEY_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient } from "../../utils/sdk-client.js";
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
const describeInitApprovePasskey = FEATURE_FLAGS.enablePasskeyInitApproveTests
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
    const testAccountId = passkeyData.accountId;
    const testVaultAddr = TEST_DATA.vaults.selected.address;
    const chainId = TEST_DATA.vaults.selected.chainId;
    const depositAmount = txRequest.depositAmount;
    const sourceCurrency = txRequest.sourceCurrency;

    // Deposit using Passkey
    describeInitApprovePasskey("getApproveTransactionPasskey()", () => {
      it(
        "should get approve transaction body to sign",
        async () => {
          const requestBody = {
            accountId: testAccountId,
            vaultAddr: testVaultAddr,
          };

          assertSchema(requestBody, "ApproveRequestBody");

          const sdkResponse = await client.api.getApproveTransactionPasskey(
            chainId,
            requestBody
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyTxRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save approve bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "approve",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId
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

          const sdkResponse = await client.api.getApproveTransactionPasskey(
            99999,
            requestBody
          ); // Invalid chain ID

          // Assert SDK error handling
          assertError(sdkResponse);
        },
        getTimeout("api")
      );
    });

    describeInitDepositPasskey("getDepositTransactionPasskey()", () => {
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

          const sdkResponse = await client.api.getDepositTransactionPasskey(
            chainId,
            requestBody
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyTxRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save deposit bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "deposit",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId
          );
        },
        getTimeout("api")
      );
    });

    describeInitWithdrawPasskey("getWithdrawTransactionPasskey()", () => {
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

          const sdkResponse = await client.api.getWithdrawTransactionPasskey(
            chainId,
            requestBody
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "PasskeyTxRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save withdraw bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "withdraw",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId
          );
        },
        getTimeout("api")
      );
    });
  }
);
