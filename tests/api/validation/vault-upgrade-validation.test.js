/**
 * Vault upgrade validation — end-to-end flow
 * Deposits into a Base vault, migrates the position to an Ethereum vault,
 * then off-ramps the full Ethereum vault balance to a bank account.
 *
 * After every tx reaches status "completed", the wallet's EURC idle balance
 * is read on both Base and Ethereum via get-account-balances and logged.
 *
 * The suite is split into three sequential `it()` blocks so you can run them
 * independently via vitest's -t filter:
 *   - "Deposit into Base vault"
 *   - "Vault upgrade Base to Ethereum"
 *   - "Off-ramp withdraw to bank"
 *
 * Run the full flow:
 *   ENABLE_PASSKEY_TESTS=true ENABLE_VAULT_UPGRADE_VALIDATION_TESTS=true \
 *     npx vitest run tests/api/validation/vault-upgrade-validation.test.js
 *
 * Run only the off-ramp (requires DESTINATION_VAULT_ADDR in .env):
 *   ENABLE_PASSKEY_TESTS=true ENABLE_VAULT_UPGRADE_VALIDATION_TESTS=true \
 *     npx vitest run tests/api/validation/vault-upgrade-validation.test.js -t "Off-ramp"
 *
 * Required env :
 *   all blocks:  TEST_INIT_VAULT_UPGRADE_TARGET_ACCOUNT_ID
 *   deposit:     TEST_VAULT_UPGRADE_SOURCE_ADDR, DEPOSIT_AMOUNT, SOURCE_CURRENCY
 *   upgrade:     TEST_VAULT_UPGRADE_SOURCE_ADDR
 *   withdraw:    REAL_BANK_ACCOUNT_ID, DESTINATION_CURRENCY
 *                DESTINATION_VAULT_ADDR (only when running withdraw standalone)
 *
 *   ENABLE_PASSKEY_TESTS=true
 *   ENABLE_VAULT_UPGRADE_VALIDATION_TESTS=true
 */

import { describe, it, beforeAll, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { apiClient } from "../../../utils/api-client.js";
import { endpoints } from "../../../config/endpoints.js";
import { FEATURE_FLAGS, TEST_DATA } from "../../../config/test.config.js";
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

const SOURCE_CHAIN_ID = 8453; // Base
const DEST_CHAIN_ID = 1; // Ethereum
const PASSKEY_PAUSE_MS = 30 * 1000;
const INTER_TX_WAIT_MS = 5 * 1000; // Settle time between on-chain transactions
const POLL_INTERVAL_MS_BY_CHAIN = {
  [8453]: 1 * 1000, // Base: every 1s
  [1]: 12 * 1000, // Ethereum: every 12s
};
const POLL_MAX_DURATION_MS = 20 * 60 * 1000; // 20 minutes per transaction
const TEST_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes (three passkey flows + three polls)

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

function toNumber(decimal) {
  if (decimal == null) return 0;
  if (typeof decimal === "number") return decimal;
  const n = Number(decimal);
  return Number.isFinite(n) ? n : 0;
}

function toSixDecimals(decimal) {
  const n = Number(decimal);
  if (!Number.isFinite(n)) {
    throw new Error(`toSixDecimals: invalid decimal value ${decimal}`);
  }
  // Truncate (not round) to 6 decimals — safer for "max withdrawal" semantics
  // so we never request more than the available balance. Then strip trailing
  // zeros but keep at least one digit after the decimal point
  // (e.g. 1.000000 -> 1.0, 0.232456999 -> 0.232456).
  const truncated = Math.floor(n * 1e6) / 1e6;
  const fixed = truncated.toFixed(6);
  return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ".0");
}

function findVaultPosition(balancesResponse, vaultAddr) {
  const sub = balancesResponse.sub_accounts || [];
  for (const account of sub) {
    const position = (account.positions || []).find(
      (p) => p.vault_address?.toLowerCase() === vaultAddr.toLowerCase()
    );
    if (position) return position;
  }
  return null;
}

/**
 * Fetch balances for a single chain. Returns null after retries on error
 * (e.g. transient 500 from vault pricing multicall racing with a just-confirmed
 * onchain tx) so the other chain can still be logged independently.
 */
async function fetchChainBalances(accountId, chainId, { retries = 5, backoffMs = 3000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await apiClient.get(
      endpoints.accounts.getAccountBalances(accountId, {
        chain_id: chainId,
        include_test_vaults: false,
      }),
      { authenticated: true }
    );
    if (response.ok) return response.data;

    lastError = response.error?.error || `status ${response.status}`;
    if (attempt < retries) {
      console.log(
        `  ⏳ get-account-balances transient error on chain ${chainId} (attempt ${attempt}/${retries}): ${lastError}. Retrying in ${backoffMs / 1000}s...`
      );
      await sleep(backoffMs);
    }
  }
  console.log(
    `  ⚠️ get-account-balances failed for chain ${chainId} after ${retries} attempts: ${lastError}`
  );
  return null;
}

async function logIdleEurcBalances(accountId, label = "", { vaultAddr } = {}) {
  // Vault addresses to surface, per chain (from .env). Other vaults on the
  // account are ignored in the per-vault log lines.
  const baseVaultAddr = process.env.TEST_VAULT_UPGRADE_SOURCE_ADDR;
  const ethVaultAddr =
    process.env.DESTINATION_VAULT_ADDR ||
    process.env.TEST_VAULT_UPGRADE_DEST_ADDR;

  // Per-chain fetches so a 500 on one chain doesn't sink the whole log.
  const [baseData, ethData] = await Promise.all([
    fetchChainBalances(accountId, SOURCE_CHAIN_ID),
    fetchChainBalances(accountId, DEST_CHAIN_ID),
  ]);

  const baseIdle = baseData ? findIdleBalance(baseData, SOURCE_CHAIN_ID, "eur") : null;
  const ethIdle = ethData ? findIdleBalance(ethData, DEST_CHAIN_ID, "eur") : null;

  const suffix = label ? ` (${label})` : "";
  console.log(`💰 Wallet EURC idle balance${suffix}:`);
  console.log(`   Base:     ${baseIdle ? baseIdle.balance : "0"}`);
  console.log(`   Ethereum: ${ethIdle ? ethIdle.balance : "0"}`);

  const basePosition =
    baseData && baseVaultAddr ? findVaultPosition(baseData, baseVaultAddr) : null;
  const ethPosition =
    ethData && ethVaultAddr ? findVaultPosition(ethData, ethVaultAddr) : null;

  if (baseVaultAddr) {
    console.log(
      `   Position in ${baseVaultAddr} (Base): ${
        basePosition ? `${basePosition.balance} ${basePosition.currency}` : "not found"
      }`
    );
  }
  if (ethVaultAddr) {
    console.log(
      `   Position in ${ethVaultAddr} (Eth):  ${
        ethPosition ? `${ethPosition.balance} ${ethPosition.currency}` : "not found"
      }`
    );
  }

  // If the caller asked about a specific vault, return its position — checked
  // against whichever chain fetch succeeded. Preserves the existing
  // `postDeposit.position` / `postUpgrade.position` assertions.
  let position = null;
  if (vaultAddr) {
    position =
      (baseData ? findVaultPosition(baseData, vaultAddr) : null) ||
      (ethData ? findVaultPosition(ethData, vaultAddr) : null);
  }

  return {
    base: baseIdle ? baseIdle.balance : "0",
    ethereum: ethIdle ? ethIdle.balance : "0",
    position,
  };
}

function findIdleBalance(balancesResponse, chainId, currency) {
  const sub = balancesResponse.sub_accounts || [];
  for (const account of sub) {
    const idle = (account.idle || []).find(
      (i) => i.chain_id === chainId && i.currency === currency
    );
    if (idle) return idle;
  }
  return null;
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

async function submitAndPoll({
  chainId,
  bodyToSign,
  transactionId,
  webAuthnStamp,
  accountId,
  label,
  vaultAddr,
}) {
  const signRequest = { signedBody: bodyToSign, transactionId, webAuthnStamp };
  assertSchema(signRequest, "SignPayloadRequestBodyPasskey");

  const signResponse = await apiClient.post(
    endpoints.passkey.signPayloadPasskey(chainId),
    signRequest,
    { authenticated: true, timeout: 60 * 1000 }
  );
  assertSuccessWithSchema(signResponse, "SendTransactionResponseBody");
  console.log(`  Submitted. Initial status: ${signResponse.data.status}`);

  const pollInterval = POLL_INTERVAL_MS_BY_CHAIN[chainId] ?? 10 * 1000;
  const maxAttempts = Math.ceil(POLL_MAX_DURATION_MS / pollInterval);
  logSub(`Polling get-transaction every ${pollInterval / 1000}s (chain ${chainId}, max ${maxAttempts} attempts)...`);

  let status = signResponse.data.status;
  let lastLoggedStatus = null;
  // Suppress the DEBUG_MODE response-body dump for polling — only the status matters
  const prevDebug = process.env.DEBUG_MODE;
  process.env.DEBUG_MODE = "";
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await sleep(pollInterval);
      const txResponse = await apiClient.get(
        endpoints.transactions.getById(transactionId),
        { authenticated: true }
      );
      assertSuccess(txResponse);
      status = txResponse.data.status;
      // Log only on status change or every 10th attempt to reduce noise
      if (status !== lastLoggedStatus || attempt % 10 === 0) {
        console.log(`  [${attempt}/${maxAttempts}] status: ${status}`);
        lastLoggedStatus = status;
      }
      if (status === "completed") break;
    }
  } finally {
    if (prevDebug === undefined) delete process.env.DEBUG_MODE;
    else process.env.DEBUG_MODE = prevDebug;
  }
  expect(status).toBe("completed");
  console.log(`  ✅ status: completed`);

  if (accountId) {
    return await logIdleEurcBalances(accountId, label || "after tx", { vaultAddr });
  }
}

const describeValidation =
  FEATURE_FLAGS.enablePasskeyTests &&
  FEATURE_FLAGS.enableVaultUpgradeValidationTests
    ? describe
    : describe.skip;

describeValidation("Vault Upgrade Validation (Base -> Ethereum)", () => {
  const accountId = TEST_DATA.accounts.initVaultUpgradeTargetAccountId;
  const sourceVaultAddr = process.env.TEST_VAULT_UPGRADE_SOURCE_ADDR;
  const bankAccountId = process.env.REAL_BANK_ACCOUNT_ID;
  const destinationCurrency = process.env.DESTINATION_CURRENCY;
  const depositAmount = process.env.DEPOSIT_AMOUNT;
  const sourceCurrency = process.env.SOURCE_CURRENCY;

  // Shared state across blocks (populated by earlier blocks when they run together)
  const state = {
    walletAddress: null,
    destinationVaultAddr: null,
  };

  beforeAll(async () => {
    expect(accountId).toBeTruthy();

    console.log(`\n━━━ Pre-flight ━━━`);
    const accountDetails = await apiClient.get(
      endpoints.accounts.getAccountDetails(accountId),
      { authenticated: true }
    );
    assertSuccessWithSchema(accountDetails, "GetAccountDetailsResponse");
    state.walletAddress = accountDetails.data.walletAddress;
    expect(state.walletAddress).toBeTruthy();
    console.log(`  Account ID: ${accountId}`);
    console.log(`  Wallet:     ${state.walletAddress}`);
  });

  it(
    "Deposit into Base vault",
    async () => {
      expect(sourceVaultAddr, "TEST_VAULT_UPGRADE_SOURCE_ADDR must be set").toBeTruthy();
      expect(depositAmount, "DEPOSIT_AMOUNT must be set").toBeTruthy();
      expect(sourceCurrency, "SOURCE_CURRENCY must be set").toBeTruthy();

      logStep(1, 3, "Deposit into Base vault");
      const depositAmountRounded = toSixDecimals(depositAmount);
      logSub(`Requesting deposit payload (${depositAmountRounded} ${sourceCurrency} → ${sourceVaultAddr})...`);
      const depositBody = {
        accountId,
        vaultAddr: sourceVaultAddr,
        amount: depositAmountRounded,
        sourceCurrency,
      };
      assertSchema(depositBody, "DepositRequestBody");

      const depositInit = await apiClient.post(
        endpoints.passkey.getDepositPayloadPasskey(SOURCE_CHAIN_ID),
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
      logSub(`Submitting signed deposit to Base...`);
      const postDeposit = await submitAndPoll({
        chainId: SOURCE_CHAIN_ID,
        bodyToSign: depositEntry.bodyToSign,
        transactionId: depositInit.data.transactionId,
        webAuthnStamp: depositEntry.webAuthnStamp,
        accountId,
        label: "after deposit",
        vaultAddr: sourceVaultAddr,
      });

      expect(
        postDeposit?.position,
        `No position found for source vault ${sourceVaultAddr} on Base after deposit`
      ).toBeTruthy();
      expect(toNumber(postDeposit.position.balance)).toBeGreaterThan(0);

      console.log(`\n⏸  Inter-tx settle (${INTER_TX_WAIT_MS / 1000}s)...`);
      await sleep(INTER_TX_WAIT_MS);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "Vault upgrade Base to Ethereum",
    async () => {
      expect(sourceVaultAddr, "TEST_VAULT_UPGRADE_SOURCE_ADDR must be set").toBeTruthy();

      logStep(2, 3, "Vault upgrade (Base → Ethereum)");
      logSub(`Requesting vault upgrade payload for ${sourceVaultAddr}...`);
      const initBody = { accountId, sourceVaultAddr };
      assertSchema(initBody, "VaultUpgradeRequestBody");

      const initResponse = await apiClient.post(
        endpoints.passkey.getVaultUpgradePayloadPasskey,
        initBody,
        { authenticated: true }
      );
      assertSuccessWithSchema(initResponse, "VaultUpgradePayloadResponse");
      assertHasFields(initResponse.data, [
        "bodyToSign",
        "transactionId",
        "sourceAmount",
        "destinationAmount",
        "destinationVaultAddr",
      ]);

      const {
        bodyToSign: upgradeBodyToSign,
        transactionId: upgradeTxId,
        destinationVaultAddr,
      } = initResponse.data;
      state.destinationVaultAddr = destinationVaultAddr;
      saveBodyToSign("vaultUpgrade", upgradeBodyToSign, upgradeTxId);
      console.log(`  Upgrade tx ID:     ${upgradeTxId}`);
      console.log(`  Destination vault: ${destinationVaultAddr}`);

      const upgradeEntry = await pauseForPasskey("vaultUpgrade");
      logSub(`Submitting signed upgrade to Base...`);
      const postUpgrade = await submitAndPoll({
        chainId: SOURCE_CHAIN_ID,
        bodyToSign: upgradeEntry.bodyToSign,
        transactionId: upgradeTxId,
        webAuthnStamp: upgradeEntry.webAuthnStamp,
        accountId,
        label: "after vault upgrade",
        vaultAddr: destinationVaultAddr,
      });

      expect(
        postUpgrade?.position,
        `No position found for destination vault ${destinationVaultAddr} on Ethereum after upgrade`
      ).toBeTruthy();
      expect(toNumber(postUpgrade.position.balance)).toBeGreaterThan(0);

      console.log(`\n⏸  Inter-tx settle (${INTER_TX_WAIT_MS / 1000}s)...`);
      await sleep(INTER_TX_WAIT_MS);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "Off-ramp withdraw to bank",
    async () => {
      expect(bankAccountId, "REAL_BANK_ACCOUNT_ID must be set").toBeTruthy();
      expect(destinationCurrency, "DESTINATION_CURRENCY must be set").toBeTruthy();

      // When running standalone (without the upgrade block), read destination vault from env
      const destinationVaultAddr =
        state.destinationVaultAddr || process.env.DESTINATION_VAULT_ADDR;
      expect(
        destinationVaultAddr,
        "Destination vault unknown — run the upgrade block first OR set DESTINATION_VAULT_ADDR in .env"
      ).toBeTruthy();

      logStep(3, 3, "Off-ramp withdraw (Ethereum → bank)");
      logSub(`Re-fetching freshest destination vault balance...`);
      const freshBalances = await apiClient.get(
        endpoints.accounts.getAccountBalances(accountId, {
          chain_id: DEST_CHAIN_ID,
          include_test_vaults: false,
        }),
        { authenticated: true }
      );
      assertSuccessWithSchema(freshBalances, "GetAccountBalancesResponse");
      const freshDestPosition = findVaultPosition(
        freshBalances.data,
        destinationVaultAddr
      );
      expect(
        freshDestPosition,
        `No position found for destination vault ${destinationVaultAddr} on Ethereum`
      ).toBeTruthy();
      const totalWithdrawAmount = toSixDecimals(freshDestPosition.balance);
      console.log(
        `  Withdraw amount: ${totalWithdrawAmount} ${freshDestPosition.currency} (raw: ${freshDestPosition.balance})`
      );
      console.log(
        `  Off-ramp to:     bankAccountId=${bankAccountId}, currency=${destinationCurrency}`
      );

      logSub(`Requesting withdraw payload...`);
      const withdrawBody = {
        accountId,
        vaultAddr: destinationVaultAddr,
        amount: totalWithdrawAmount,
        destinationCurrency,
        bankAccountId,
      };
      assertSchema(withdrawBody, "WithdrawRequestBody");

      const withdrawInit = await apiClient.post(
        endpoints.passkey.getWithdrawPayloadPasskey(DEST_CHAIN_ID),
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
      logSub(`Submitting signed withdraw to Ethereum...`);
      await submitAndPoll({
        chainId: DEST_CHAIN_ID,
        bodyToSign: withdrawEntry.bodyToSign,
        transactionId: withdrawInit.data.transactionId,
        webAuthnStamp: withdrawEntry.webAuthnStamp,
        accountId,
        label: "after off-ramp withdraw",
      });

      console.log(
        `\n🎉 Off-ramp complete. Funds will arrive at bank account ${bankAccountId}.`
      );
    },
    TEST_TIMEOUT_MS
  );
});
