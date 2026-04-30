#!/usr/bin/env node

/**
 * Run parallel passkey deposit and/or withdrawal transactions using CI credentials.
 *
 * Each mode fires N transactions simultaneously to test nonce/concurrency behaviour.
 *
 * Usage:
 *   node scripts/run-parallel-transactions.js --deposits              # deposits only (default)
 *   node scripts/run-parallel-transactions.js --withdrawals           # withdrawals only
 *   node scripts/run-parallel-transactions.js --deposits --withdrawals # both sequentially
 *
 *   node scripts/run-parallel-transactions.js --deposits --amount 5 --currency eurc
 *   node scripts/run-parallel-transactions.js --withdrawals --withdraw-amount 5 --dest-currency eurc
 *   node scripts/run-parallel-transactions.js --count 3              # fire 3 in parallel instead of 2
 *
 * Environment variables:
 *   CI_PASSKEY_ACCOUNT_ID      - Account ID for deposits (required)
 *   CI_PASSKEY_CREDENTIAL_ID   - Base64url passkey credential ID (required)
 *   CI_PASSKEY_PRIVATE_KEY     - PKCS#8 DER base64 private key (required)
 *   CHAIN                      - "ETH" for Ethereum mainnet, otherwise Base (default)
 *   EUR_VAULT                  - "true" to use the EUR/EURC vault (default: USD vault)
 *   TEST_VAULT_ETH / TEST_VAULT_BASE  - Override vault address
 *
 *   Deposits:
 *     DEPOSIT_AMOUNT           - Deposit amount
 *     SOURCE_CURRENCY          - Source currency (default: usdc)
 *
 *   Withdrawals:
 *     WITHDRAW_AMOUNT          - Withdrawal amount
 *     DESTINATION_CURRENCY     - Destination currency (default: usdc)
 *     TEST_US_BANK_ACCOUNT_ID  - Bank account ID for USD fiat withdrawals
 *     TEST_EUR_BANK_ACCOUNT_ID - Bank account ID for EUR fiat withdrawals
 *
 *   VIRTUAL_AUTH_RPID          - Relying party ID (default: localhost)
 *   VIRTUAL_AUTH_PORT          - Port for RP origin (default: 3000)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);

// ── Parse CLI args ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { runDeposits: false, runWithdrawals: false };
  for (let i = 0; i < args.length; i++) {
    if      (args[i] === "--deposits")                          result.runDeposits = true;
    else if (args[i] === "--withdrawals")                       result.runWithdrawals = true;
    else if (args[i] === "--amount"          && args[i + 1])   result.amount = args[++i];
    else if (args[i] === "--currency"        && args[i + 1])   result.currency = args[++i];
    else if (args[i] === "--withdraw-amount" && args[i + 1])   result.withdrawAmount = args[++i];
    else if (args[i] === "--dest-currency"   && args[i + 1])   result.destCurrency = args[++i];
    else if (args[i] === "--count"           && args[i + 1])   result.count = parseInt(args[++i], 10);
  }
  // Default to deposits only when no mode flag given
  if (!result.runDeposits && !result.runWithdrawals) result.runDeposits = true;
  return result;
}

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveVault(chainId) {
  const envKey = chainId === 1 ? "TEST_VAULT_ETH" : "TEST_VAULT_BASE";
  if (process.env[envKey]) return process.env[envKey];

  const vaultData = JSON.parse(
    readFileSync(join(rootDir, "fixtures/test-data/__generated__/generated-vaults.json"), "utf-8")
  );
  const useEur = process.env.EUR_VAULT === "true";
  const vault = vaultData.find(
    (v) =>
      v.is_active === true &&
      v.chain_id === chainId &&
      (useEur ? v.is_asynchronous === true : !v.is_asynchronous)
  );
  if (!vault) throw new Error(`No active ${useEur ? "EUR" : "USD"} vault found for chainId=${chainId}`);
  return vault.vault_address;
}

function resolveConfig(cliArgs) {
  const accountId    = process.env.CI_PASSKEY_ACCOUNT_ID;
  const credentialId = process.env.CI_PASSKEY_CREDENTIAL_ID;
  const privateKey   = process.env.CI_PASSKEY_PRIVATE_KEY;

  if (!accountId)    throw new Error("CI_PASSKEY_ACCOUNT_ID is required in .env");
  if (!credentialId) throw new Error("CI_PASSKEY_CREDENTIAL_ID is required in .env");
  if (!privateKey)   throw new Error("CI_PASSKEY_PRIVATE_KEY is required in .env");

  const chainId  = process.env.CHAIN?.toUpperCase() === "ETH" ? 1 : 8453;
  const vaultAddr = resolveVault(chainId);
  const count    = cliArgs.count || 2;
  const rpId     = process.env.VIRTUAL_AUTH_RPID || "localhost";
  const port     = parseInt(process.env.VIRTUAL_AUTH_PORT || "3000", 10);

  // Deposit config
  const deposit = {
    amount:   cliArgs.amount   || process.env.DEPOSIT_AMOUNT,
    currency: cliArgs.currency || process.env.SOURCE_CURRENCY || "usdc",
  };

  // Withdrawal config
  const destCurrency = cliArgs.destCurrency || process.env.DESTINATION_CURRENCY || "usdc";
  const isCrypto     = ["usdc", "eurc"].includes(destCurrency.toLowerCase());
  const bankAccountId = isCrypto ? null : (
    destCurrency.toLowerCase() === "eur"
      ? process.env.TEST_EUR_BANK_ACCOUNT_ID
      : process.env.TEST_US_BANK_ACCOUNT_ID
  ) || null;

  const withdraw = {
    amount:        cliArgs.withdrawAmount || process.env.WITHDRAW_AMOUNT,
    destCurrency,
    bankAccountId,
  };

  return { accountId, credentialId, privateKey, chainId, vaultAddr, count, rpId, port, deposit, withdraw };
}

// ── API helper ────────────────────────────────────────────────────────────────

async function apiCall(method, path, body = null) {
  const { generateAuthHeaders } = await import("../../utils/auth.js");
  const { getEnvironmentBaseURL, isProduction } = await import("../../config/environments.js");
  const baseURL = getEnvironmentBaseURL();
  const key = isProduction() ? process.env.PROD_INTEGRATOR_PRIVATE_KEY : process.env.DEV_INTEGRATOR_PRIVATE_KEY;
  if (!key) throw new Error("DEV_INTEGRATOR_PRIVATE_KEY or PROD_INTEGRATOR_PRIVATE_KEY is required");
  const authHeaders = generateAuthHeaders(key, method, path, body || "");
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${method} ${path}: ${text}`);
  return data;
}

// ── Transaction cycles ────────────────────────────────────────────────────────

async function runOneDeposit(cfg, signer, index) {
  console.log(`\n  ── Deposit ${index} ──`);

  const path = `/v1/query/get-deposit-payload-passkey?chain_id=${cfg.chainId}`;
  const body = {
    accountId:      cfg.accountId,
    vaultAddr:      cfg.vaultAddr,
    amount:         cfg.deposit.amount,
    sourceCurrency: cfg.deposit.currency,
  };

  console.log(`  → getDepositPayloadPasskey (chainId=${cfg.chainId}, amount=${body.amount} ${body.sourceCurrency})`);
  const { bodyToSign, transactionId } = await apiCall("POST", path, body);
  console.log(`     transactionId: ${transactionId}`);

  const webAuthnStamp = signer.signPayload(bodyToSign);
  console.log(`     stamp signed ✓`);

  console.log(`  → signPayloadPasskey`);
  const result = await apiCall("POST", `/v1/submit/sign-payload-passkey?chain_id=${cfg.chainId}`, {
    signedBody: bodyToSign,
    transactionId,
    webAuthnStamp,
  });

  console.log(`     ✅ Deposit ${index} submitted`);
  if (result?.transactionHash) console.log(`     txHash: ${result.transactionHash}`);
  if (result?.transactionId)   console.log(`     txId:   ${result.transactionId}`);
  return result;
}

async function runOneWithdrawal(cfg, signer, index) {
  console.log(`\n  ── Withdrawal ${index} ──`);

  const body = {
    accountId:           cfg.accountId,
    vaultAddr:           cfg.vaultAddr,
    amount:              cfg.withdraw.amount,
    destinationCurrency: cfg.withdraw.destCurrency,
    ...(cfg.withdraw.bankAccountId && { bankAccountId: cfg.withdraw.bankAccountId }),
  };

  console.log(`  → getWithdrawPayloadPasskey (chainId=${cfg.chainId}, amount=${body.amount} ${body.destinationCurrency})`);
  const { bodyToSign, transactionId } = await apiCall(
    "POST",
    `/v1/query/get-withdraw-payload-passkey?chain_id=${cfg.chainId}`,
    body
  );
  console.log(`     transactionId: ${transactionId}`);

  const webAuthnStamp = signer.signPayload(bodyToSign);
  console.log(`     stamp signed ✓`);

  console.log(`  → signPayloadPasskey`);
  const result = await apiCall("POST", `/v1/submit/sign-payload-passkey?chain_id=${cfg.chainId}`, {
    signedBody: bodyToSign,
    transactionId,
    webAuthnStamp,
  });

  console.log(`     ✅ Withdrawal ${index} submitted`);
  if (result?.transactionHash) console.log(`     txHash: ${result.transactionHash}`);
  if (result?.transactionId)   console.log(`     txId:   ${result.transactionId}`);
  return result;
}

// ── Parallel runner + result summary ─────────────────────────────────────────

async function runParallel(label, taskFn, count) {
  console.log(`\n  Firing ${count} ${label} in parallel...`);
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => taskFn(i + 1))
  );
  console.log(`\n── ${label} results ${"─".repeat(40 - label.length)}`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`  ${label} ${i + 1}: ✅ fulfilled`);
    } else {
      console.log(`  ${label} ${i + 1}: ❌ rejected — ${r.reason?.message}`);
    }
  });
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`  ${count - failed}/${count} succeeded.`);
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cliArgs = parseArgs();
  const cfg = resolveConfig(cliArgs);

  console.log("💸 Passkey Transaction Runner\n");
  console.log(`  Account:  ${cfg.accountId}`);
  console.log(`  Vault:    ${cfg.vaultAddr}`);
  console.log(`  ChainId:  ${cfg.chainId}`);
  console.log(`  Count:    ${cfg.count} per mode`);
  console.log(`  Cred ID:  ${cfg.credentialId.substring(0, 20)}...`);
  if (cliArgs.runDeposits)    console.log(`  Deposits:    ${cfg.deposit.amount} ${cfg.deposit.currency}`);
  if (cliArgs.runWithdrawals) console.log(`  Withdrawals: ${cfg.withdraw.amount} ${cfg.withdraw.destCurrency}${cfg.withdraw.bankAccountId ? ` (bankAccountId: ${cfg.withdraw.bankAccountId})` : ""}`);

  const { PasskeySigner } = await import("../../utils/passkey-signer.js");
  const signer = new PasskeySigner({
    credentialId: cfg.credentialId,
    privateKey:   cfg.privateKey,
    rpId:         cfg.rpId,
    origin:       `http://localhost:${cfg.port}`,
  });

  if (cliArgs.runDeposits) {
    if (!cfg.deposit.amount) throw new Error("Deposit amount is required. Pass --amount <value> or set DEPOSIT_AMOUNT in .env");
    await runParallel("deposits", (i) => runOneDeposit(cfg, signer, i), cfg.count);
  }

  if (cliArgs.runWithdrawals) {
    if (!cfg.withdraw.amount) throw new Error("Withdrawal amount is required. Pass --withdraw-amount <value> or set WITHDRAW_AMOUNT in .env");
    await runParallel("withdrawals", (i) => runOneWithdrawal(cfg, signer, i), cfg.count);
  }

  console.log();
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  if (process.env.DEBUG_MODE === "true") console.error(err.stack);
  process.exit(1);
});
