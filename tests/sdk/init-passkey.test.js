/**
 * Passkey deposit Transactions SDK Tests, what are tested:
 * - getActivateAccountPayloadPasskey
 * - getDepositPayloadPasskey
 * - getWithdrawPayloadPasskey
 * - getCancelWithdrawalPayloadPasskey
 *
 * Note: Passkey tests require WebAuthn setup
 * Enable with: ENABLE_PASSKEY_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
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

// A well-formed UUID that should not correspond to any transaction
const NONEXISTENT_TRANSACTION_ID = "00000000-0000-4000-8000-000000000000";

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
const describeInitCancelWithdrawPasskey =
  FEATURE_FLAGS.enablePasskeyInitCancelWithdrawTests ? describe : describe.skip;

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

    // Cancel a queued withdrawal. What makes a withdrawal cancellable is its
    // status, not the vault type — a `withdrawal_initiated` transaction is
    // cancellable, and that happens on vaults reported as `is_async_vault: false`
    // too. So the happy path needs a live queued withdrawal: set
    // TEST_CANCEL_WITHDRAWAL_TRANSACTION_ID to the transactionId the withdraw
    // payload returned. The 400 cases need no state.
    describeInitCancelWithdrawPasskey(
      "get-cancel-withdrawal-payload-passkey",
      () => {
        // Explicit config only: falling back to a stale persisted withdrawal would
        // turn "no queued withdrawal right now" into a test failure.
        const cancelTransactionId =
          TEST_DATA.transactions.cancelWithdrawalTransactionId;
        const itCancellable = cancelTransactionId ? it : it.skip;

        // The named method maps its `chainId` argument to the `chain_id` query
        // param the API expects.
        const getCancelPayload = (transactionId) =>
          client.api.getCancelWithdrawalPayloadPasskey(
            chainId,
            { transactionId },
            DUMMY_AUTH,
          );

        itCancellable(
          "should get cancel withdrawal payload to sign",
          async () => {
            const requestBody = { transactionId: cancelTransactionId };

            assertSchema(requestBody, "CancelWithdrawalRequestBody");

            const sdkResponse = await getCancelPayload(cancelTransactionId);

            // A withdrawal that has already settled, or was never queued, answers
            // 400 — say so plainly rather than failing on a schema mismatch.
            expect(
              sdkResponse.response.status,
              `transaction ${cancelTransactionId} is not a cancellable queued withdrawal on chain ${chainId}: ${JSON.stringify(sdkResponse.error)}`,
            ).toBe(200);

            assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
            assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

            // Save cancellation bodyToSign for the sign-payload-passkey step
            saveBodyToSign(
              "cancelWithdrawal",
              sdkResponse.data.bodyToSign,
              sdkResponse.data.transactionId,
            );
          },
          getTimeout("api"),
        );

        it(
          "should reject a transaction that does not exist",
          async () => {
            const sdkResponse = await getCancelPayload(
              NONEXISTENT_TRANSACTION_ID,
            );

            assertError(sdkResponse);
            expect(sdkResponse.response.status).toBe(400);
          },
          getTimeout("api"),
        );

        it(
          "should reject a request with no transactionId",
          async () => {
            const sdkResponse =
              await client.api.getCancelWithdrawalPayloadPasskey(
                chainId,
                {},
                DUMMY_AUTH,
              );

            // transactionId is required by CancelWithdrawalRequestBody
            assertError(sdkResponse);
            expect(sdkResponse.response.status).toBeGreaterThanOrEqual(400);
            expect(sdkResponse.response.status).toBeLessThan(500);
          },
          getTimeout("api"),
        );
      },
    );
  },
);
