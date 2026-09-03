/**
 * Passkey deposit Transactions API Tests, what are tested:
 * - query/get-activate-account-payload-passkey
 * - query/get-deposit-payload-passkey
 * - query/get-withdraw-payload-passkey
 * - query/get-cancel-withdrawal-payload-passkey
 *
 */

import { describe, it, expect } from "vitest";
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
const describeInitTransferPasskey = FEATURE_FLAGS.enablePasskeyInitTransferTests
  ? describe
  : describe.skip;
const describeInitCancelWithdrawPasskey =
  FEATURE_FLAGS.enablePasskeyInitCancelWithdrawTests ? describe : describe.skip;

// A well-formed UUID that should not correspond to any transaction
const NONEXISTENT_TRANSACTION_ID = "00000000-0000-4000-8000-000000000000";

describeInitPasskey("Initiate Passkey transactions API", () => {
  // Use a KYC/KYB-approved account for passkey operations.
  // Set TEST_INIT_<CYCLE>_TARGET_ACCOUNT_ID in .env to a verified account for
  // direct `npx vitest` runs. Under ci-test.js the orchestrator sets
  // CI_TEST_ORCHESTRATED=true and every init cycle runs against the single
  // account ci-one-time-setup.js registered a passkey for, so
  // CI_PASSKEY_ACCOUNT_ID wins there and the per-cycle .env vars are ignored.
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const ciPasskeyAccountId =
    orchestrated && process.env.CI_PASSKEY_ACCOUNT_ID
      ? process.env.CI_PASSKEY_ACCOUNT_ID
      : null;
  const testActivateAccountId =
    ciPasskeyAccountId ?? TEST_DATA.accounts.initActivateTargetAccountId;
  const testDepositAccountId =
    ciPasskeyAccountId ?? TEST_DATA.accounts.initDepositTargetAccountId;
  const testWithdrawAccountId =
    ciPasskeyAccountId ?? TEST_DATA.accounts.initWithdrawTargetAccountId;
  const testTransferAccountId =
    ciPasskeyAccountId ?? TEST_DATA.accounts.initTransferTargetAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  // Amounts + currencies come from .env (DEPOSIT_AMOUNT, SOURCE_CURRENCY,
  // WITHDRAW_AMOUNT, DESTINATION_CURRENCY). Set them before running this file.
  const depositAmount = process.env.DEPOSIT_AMOUNT;
  const sourceCurrency = process.env.SOURCE_CURRENCY;
  const withdrawAmount = process.env.WITHDRAW_AMOUNT;
  // Wallet-to-wallet transfer config (TRANSFER_AMOUNT, TRANSFER_CURRENCY,
  // TRANSFER_DESTINATION_ADDRESS). `currency` is a CryptoCurrency — usdc | eurc.
  const transferAmount = process.env.TRANSFER_AMOUNT;
  const transferCurrency = process.env.TRANSFER_CURRENCY;
  const transferDestinationAddress = process.env.TRANSFER_DESTINATION_ADDRESS;
  // Get bank account ID — only needed for fiat off-ramp (usd/eur), not crypto (usdc/eurc)
  const destinationCurrency = process.env.DESTINATION_CURRENCY;
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
            amount: withdrawAmount,
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

  // Wallet-to-wallet transfer: move assets from the account's wallet to any
  // destination address. Unlike withdraw there is no vault or bank account
  // involved, and `currency` is restricted to CryptoCurrency (usdc | eurc).
  describeInitTransferPasskey(
    "POST /v1/query/get-transfer-payload-passkey",
    () => {
      it(
        "should get transfer payload to sign",
        async () => {
          const requestBody = {
            accountId: testTransferAccountId,
            currency: transferCurrency,
            amount: transferAmount,
            destinationAddress: transferDestinationAddress,
          };

          assertSchema(requestBody, "TransferRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getTransferPayloadPasskey(chainId),
            requestBody,
            { authenticated: true }
          );

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save transfer bodyToSign and transactionId to generated-tx-passkey.json
          saveBodyToSign(
            "transfer",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );
    }
  );

  // Cancel a queued withdrawal. What makes a withdrawal cancellable is its
  // status, not the vault type — a `withdrawal_initiated` transaction is
  // cancellable, and that happens on vaults reported as `is_async_vault: false`
  // too. So the happy path needs a live queued withdrawal: set
  // TEST_CANCEL_WITHDRAWAL_TRANSACTION_ID to the transactionId the withdraw
  // payload returned. The 400 cases need no state.
  describeInitCancelWithdrawPasskey(
    "POST /v1/query/get-cancel-withdrawal-payload-passkey",
    () => {
      // Explicit config only: falling back to a stale persisted withdrawal would
      // turn "no queued withdrawal right now" into a test failure.
      const cancelTransactionId =
        TEST_DATA.transactions.cancelWithdrawalTransactionId;
      const itCancellable = cancelTransactionId ? it : it.skip;

      itCancellable(
        "should get cancel withdrawal payload to sign",
        async () => {
          const requestBody = { transactionId: cancelTransactionId };

          assertSchema(requestBody, "CancelWithdrawalRequestBody");

          const response = await apiClient.post(
            endpoints.passkey.getCancelWithdrawalPayloadPasskey(chainId),
            requestBody,
            { authenticated: true }
          );

          // A withdrawal that has already settled, or was never queued, answers
          // 400 — say so plainly rather than failing on a schema mismatch.
          expect(
            response.status,
            `transaction ${cancelTransactionId} is not a cancellable queued withdrawal on chain ${chainId}: ${JSON.stringify(response.error)}`
          ).toBe(200);

          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save cancellation bodyToSign for the sign-payload-passkey step
          saveBodyToSign(
            "cancelWithdrawal",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );

      it(
        "should reject a transaction that does not exist",
        async () => {
          const response = await apiClient.post(
            endpoints.passkey.getCancelWithdrawalPayloadPasskey(chainId),
            { transactionId: NONEXISTENT_TRANSACTION_ID },
            { authenticated: true }
          );

          assertError(response, 400);
          expect(response.status).toBe(400);
        },
        getTimeout("api")
      );

      it(
        "should reject a request with no transactionId",
        async () => {
          const response = await apiClient.post(
            endpoints.passkey.getCancelWithdrawalPayloadPasskey(chainId),
            {},
            { authenticated: true }
          );

          // transactionId is required by CancelWithdrawalRequestBody
          expect(response.status).toBeGreaterThanOrEqual(400);
          expect(response.status).toBeLessThan(500);
        },
        getTimeout("api")
      );
    }
  );
});
