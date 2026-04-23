#!/usr/bin/env node

/**
 * Generate WebAuthn Stamps for Passkey Tests
 *
 * Reads pending bodyToSign payloads from generated-tx-passkey.json,
 * signs each one using a CDP virtual authenticator (via Playwright),
 * and writes the stamps back to the JSON file.
 *
 * Prerequisites:
 *   1. npm install --save-dev playwright
 *   2. The local dev server must be running: npm run serve
 *   3. Run init-passkey tests first to populate bodyToSign payloads
 *
 * Usage:
 *   node scripts/generate-webauthn-stamps.js
 *
 * Environment variables:
 *   VIRTUAL_AUTH_PORT  - Dev server port (default: 3000)
 *   VIRTUAL_AUTH_RPID  - Relying party ID (default: localhost)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { VirtualAuthenticator } from "../utils/virtual-authenticator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TX_FILE = join(
  __dirname,
  "../fixtures/test-data/__generated__/generated-tx-passkey.json"
);

const PORT = parseInt(process.env.VIRTUAL_AUTH_PORT || "3000", 10);
const RP_ID = process.env.VIRTUAL_AUTH_RPID || "localhost";

// Transaction types that need signing
const SIGNABLE_TYPES = [
  "approve",
  "deposit",
  "withdraw",
  "activateAccount",
  "inviteUsers",
  "promoteUser",
  "vaultUpgrade",
];

async function main() {
  console.log("Reading generated-tx-passkey.json...");

  let txData;
  try {
    txData = JSON.parse(readFileSync(TX_FILE, "utf-8"));
  } catch (err) {
    console.error(
      `Failed to read ${TX_FILE}. Run init-passkey tests first to generate bodyToSign payloads.`
    );
    process.exit(1);
  }

  // Find which transaction types have a bodyToSign but need a fresh stamp
  const toSign = SIGNABLE_TYPES.filter((type) => {
    const entry = txData[type];
    return entry && entry.bodyToSign;
  });

  if (toSign.length === 0) {
    console.log("No bodyToSign payloads found. Nothing to sign.");
    process.exit(0);
  }

  console.log(`Found ${toSign.length} payload(s) to sign: ${toSign.join(", ")}`);
  console.log(`Using RP ID: ${RP_ID}, Port: ${PORT}`);

  const auth = new VirtualAuthenticator({ rpId: RP_ID, port: PORT });

  try {
    console.log("Setting up virtual authenticator...");
    await auth.setup();

    // Create a passkey first
    console.log("Creating virtual passkey credential...");
    await auth.createPasskey("virtual-test-user", "test@byzantine.fi", "Virtual Test User");
    console.log(`Credential ID: ${auth.credentialId}`);

    // Sign each payload
    for (const type of toSign) {
      const bodyToSign = txData[type].bodyToSign;
      console.log(`Signing ${type} payload...`);

      const stamp = await auth.signPayload(bodyToSign);
      txData[type].webAuthnStamp = stamp;

      console.log(`  Signed ${type} successfully.`);
    }

    // Write back
    writeFileSync(TX_FILE, JSON.stringify(txData, null, 2), "utf-8");
    console.log(`\nWrote stamps to ${TX_FILE}`);
    console.log("Done!");
  } catch (err) {
    console.error("Error during stamp generation:", err.message);
    process.exit(1);
  } finally {
    await auth.teardown();
  }
}

main();
