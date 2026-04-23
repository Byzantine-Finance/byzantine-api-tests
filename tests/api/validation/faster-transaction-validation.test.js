/**
 * Faster-transaction validation — direct USDC deposit + withdraw on Ethereum
 *
 * Runs two transactions back-to-back:
 *   1. Direct deposit of USDC into the configured Ethereum vault
 *      → sign → immediately poll get-transaction until completed
 *   2. Withdraw back to USDC
 *      → sign → immediately poll get-transaction until completed
 *
 * Logs the full get-transaction response on every poll (no truncation).
 *
 * Run:
 *   ENABLE_PASSKEY_TESTS=true ENABLE_FASTER_TRANSACTION_VALIDATION_TESTS=true \
 *     npx vitest run tests/api/validation/faster-transaction-validation.test.js
 *
 * Required env:
 *   TEST_FASTER_TX_ACCOUNT_ID        — account to transact on
 *   TEST_FASTER_TX_VAULT_ADDR        — USDC vault address on Ethereum
 *   TEST_FASTER_TX_DEPOSIT_AMOUNT    — e.g. "1.0"
 *   TEST_FASTER_TX_WITHDRAW_AMOUNT   — e.g. "1.0"
 *   TEST_FASTER_TX_SOURCE_CURRENCY   — e.g. "usdc"
 *   TEST_FASTER_TX_DESTINATION_CURRENCY — e.g. "usdc"
 *
 *   ENABLE_PASSKEY_TESTS=true
 *   ENABLE_FASTER_TRANSACTION_VALIDATION_TESTS=true
 */

import { describe, it, beforeAll, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { FEATURE_FLAGS } from "../../../config/test.config.js";
import {
  assertSuccess,
  assertSuccessWithSchema,
  assertHasFields,
  assertSchema,
} from "../../../utils/api-assertions.js";
import { saveBodyToSign } from "../../../utils/test-data-persistence.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TX_FILE = join(
  __dirname,
  "../../../fixtures/test-data/__generated__/generated-tx-passkey.json"
);

// Chain hardcoded in this suite — USDC deposit + withdraw on Ethereum
const CHAIN_ID = 1;

const PASSKEY_PAUSE_MS = 30 * 1000;
const POLL_INTERVAL_MS = 3 * 1000;
const POLL_MAX_DURATION_MS = 20 * 60 * 1000;
const TEST_TIMEOUT_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logStep(num, total, title) {
  console.log(`\n━━━ Step ${num}/${total}: ${title} ━━━`);
}

function logSub(text) {
  console.log(`› ${text}`);
}

async function sleepWithCountdown(ms, label, tickMs = 5000) {
  const endTime = Date.now() + ms;
  while (true) {
    const remaining = endTime - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(tickMs, remaining));
    const left = endTime - Date.now();
    if (left > 0) {
      console.log(`  ${label}: ${Math.ceil(left / 1000)}s left...`);
    }
  }
}

async function pauseForPasskey(txType, waitMs = PASSKEY_PAUSE_MS) {
  console.log(`\n👉 ACTION: Sign "${txType}" in the mini webpage`);
  console.log(`   http://localhost:3000/tests/web/api-testing.html`);
  console.log(`   ⏳ ${waitMs / 1000}s window opened...`);
  await sleepWithCountdown(waitMs, "passkey window");

  const txData = JSON.parse(readFileSync(TX_FILE, "utf-8"));
  const entry = txData[txType];
  expect(
    entry?.webAuthnStamp,
    `${txType}.webAuthnStamp missing in generated-tx-passkey.json — did you sign in the webpage?`
  ).toBeTruthy();
  console.log(`   ✅ "${txType}" signature received`);
  return entry;
}

/**
 * Submit a signed payload and poll get-transaction until completed.
 * - First poll fires IMMEDIATELY after submit (no initial sleep)
 * - Full get-transaction response body is logged on every attempt
 */
async function submitAndPollVerbose({
  label,
  bodyToSign,
  transactionId,
  webAuthnStamp,
}) {
  const signRequest = { signedBody: bodyToSign, transactionId, webAuthnStamp };
  assertSchema(signRequest, "SignPayloadRequestBodyPasskey");

  logSub(`Submitting signed ${label}...`);
  const signResponse = await apiClient.post(
    endpoints.passkey.signPayloadPasskey(CHAIN_ID),
    signRequest,
    { authenticated: true, timeout: 60 * 1000 }
  );
  assertSuccessWithSchema(signResponse, "SendTransactionResponseBody");
  console.log(`  Submitted. Initial status: ${signResponse.data.status}`);

  const maxAttempts = Math.ceil(POLL_MAX_DURATION_MS / POLL_INTERVAL_MS);
  logSub(`Polling get-transaction (no initial wait, then every ${POLL_INTERVAL_MS / 1000}s, max ${maxAttempts} attempts)...`);

  let status = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const txResponse = await apiClient.get(
      endpoints.transactions.getById(transactionId),
      { authenticated: true }
    );
    assertSuccess(txResponse);

    console.log(`\n  [${attempt}/${maxAttempts}] get-transaction response:`);
    console.log(JSON.stringify(txResponse.data, null, 2));

    status = txResponse.data.status;
    if (status === "completed") break;

    await sleep(POLL_INTERVAL_MS);
  }

  expect(status).toBe("completed");
  console.log(`\n  ✅ ${label} status: completed`);
}

const describeFasterTxValidation =
  FEATURE_FLAGS.enablePasskeyTests &&
  FEATURE_FLAGS.enableFasterTransactionValidationTests
    ? describe
    : describe.skip;

describeFasterTxValidation(
  "Faster Transaction Validation (USDC deposit + withdraw on Ethereum)",
  () => {
    const accountId = process.env.TEST_FASTER_TX_ACCOUNT_ID;
    const vaultAddr = process.env.TEST_FASTER_TX_VAULT_ADDR;
    const depositAmount = process.env.TEST_FASTER_TX_DEPOSIT_AMOUNT;
    const withdrawAmount = process.env.TEST_FASTER_TX_WITHDRAW_AMOUNT;
    const sourceCurrency = process.env.TEST_FASTER_TX_SOURCE_CURRENCY;
    const destinationCurrency = process.env.TEST_FASTER_TX_DESTINATION_CURRENCY;

    beforeAll(() => {
      expect(accountId, "TEST_FASTER_TX_ACCOUNT_ID must be set").toBeTruthy();
      expect(vaultAddr, "TEST_FASTER_TX_VAULT_ADDR must be set").toBeTruthy();
      expect(depositAmount, "TEST_FASTER_TX_DEPOSIT_AMOUNT must be set").toBeTruthy();
      expect(withdrawAmount, "TEST_FASTER_TX_WITHDRAW_AMOUNT must be set").toBeTruthy();
      expect(sourceCurrency, "TEST_FASTER_TX_SOURCE_CURRENCY must be set").toBeTruthy();
      expect(destinationCurrency, "TEST_FASTER_TX_DESTINATION_CURRENCY must be set").toBeTruthy();
      console.log(`\n━━━ Faster-tx pre-flight ━━━`);
      console.log(`  Chain:    Ethereum (${CHAIN_ID})`);
      console.log(`  Account:  ${accountId}`);
      console.log(`  Vault:    ${vaultAddr}`);
      console.log(`  Deposit:  ${depositAmount} ${sourceCurrency}`);
      console.log(`  Withdraw: ${withdrawAmount} ${destinationCurrency}`);
    });

    it(
      "deposit then withdraw, immediate polling on both",
      async () => {
        // ── Deposit ───────────────────────────────────────────────────────
        logStep(1, 2, "Direct USDC deposit on Ethereum");
        const depositBody = {
          accountId,
          vaultAddr,
          amount: depositAmount,
          sourceCurrency,
        };
        assertSchema(depositBody, "DepositRequestBody");

        logSub("Requesting deposit payload...");
        const depositInit = await apiClient.post(
          endpoints.passkey.getDepositPayloadPasskey(CHAIN_ID),
          depositBody,
          { authenticated: true }
        );
        assertSuccessWithSchema(depositInit, "PasskeyPayloadRequestResponse");
        assertHasFields(depositInit.data, ["bodyToSign", "transactionId"]);
        saveBodyToSign(
          "deposit",
          depositInit.data.bodyToSign,
          depositInit.data.transactionId
        );
        console.log(`  Deposit tx ID: ${depositInit.data.transactionId}`);

        const depositEntry = await pauseForPasskey("deposit");
        await submitAndPollVerbose({
          label: "deposit",
          bodyToSign: depositEntry.bodyToSign,
          transactionId: depositInit.data.transactionId,
          webAuthnStamp: depositEntry.webAuthnStamp,
        });

        // ── Withdraw ──────────────────────────────────────────────────────
        logStep(2, 2, "Direct USDC withdraw on Ethereum");
        const withdrawBody = {
          accountId,
          vaultAddr,
          amount: withdrawAmount,
          destinationCurrency,
          // USDC withdrawal is crypto off-ramp — no bankAccountId required
        };
        assertSchema(withdrawBody, "WithdrawRequestBody");

        logSub("Requesting withdraw payload...");
        const withdrawInit = await apiClient.post(
          endpoints.passkey.getWithdrawPayloadPasskey(CHAIN_ID),
          withdrawBody,
          { authenticated: true }
        );
        assertSuccessWithSchema(withdrawInit, "PasskeyPayloadRequestResponse");
        assertHasFields(withdrawInit.data, ["bodyToSign", "transactionId"]);
        saveBodyToSign(
          "withdraw",
          withdrawInit.data.bodyToSign,
          withdrawInit.data.transactionId
        );
        console.log(`  Withdraw tx ID: ${withdrawInit.data.transactionId}`);

        const withdrawEntry = await pauseForPasskey("withdraw");
        await submitAndPollVerbose({
          label: "withdraw",
          bodyToSign: withdrawEntry.bodyToSign,
          transactionId: withdrawInit.data.transactionId,
          webAuthnStamp: withdrawEntry.webAuthnStamp,
        });

        console.log(`\n🎉 Faster-tx flow complete (deposit + withdraw).`);
      },
      TEST_TIMEOUT_MS
    );
  }
);
