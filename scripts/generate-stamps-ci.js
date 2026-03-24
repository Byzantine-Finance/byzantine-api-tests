#!/usr/bin/env node

/**
 * WebAuthn Stamp Generation for CI/CD
 *
 * Two modes:
 *   1. Pure Node.js (preferred) — uses stored PKCS#8 private key via PasskeySigner.
 *      Requires: CI_PASSKEY_CREDENTIAL_ID and CI_PASSKEY_PRIVATE_KEY env vars.
 *      No browser, no Playwright, instant.
 *
 *   2. Virtual Authenticator (fallback) — uses Playwright + CDP.
 *      Requires: playwright installed + chromium browser.
 *      Only for local dev when CI secrets are not available.
 *
 * Usage:
 *   node scripts/generate-stamps-ci.js
 *
 * Environment variables:
 *   CI_PASSKEY_CREDENTIAL_ID  - base64url credential ID (from ci-one-time-setup.js)
 *   CI_PASSKEY_PRIVATE_KEY    - PKCS#8 DER base64 private key (from ci-one-time-setup.js)
 *   VIRTUAL_AUTH_PORT          - Dev server port for fallback mode (default: 3000)
 *   VIRTUAL_AUTH_RPID           - Relying party ID (default: localhost)
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);

const TX_FILE = join(
  rootDir,
  "fixtures/test-data/__generated__/generated-tx-passkey.json"
);

const PORT = parseInt(process.env.VIRTUAL_AUTH_PORT || "3000", 10);
const RP_ID = process.env.VIRTUAL_AUTH_RPID || "localhost";

const SIGNABLE_TYPES = [
  "approve",
  "deposit",
  "withdraw",
  "activateAccount",
  "activateAccountEth",
  "inviteUsers",
  "promoteUser",
];

// ──────────────────────────────────────────────────────────
// Signer factory — returns { signer, cleanup }
// ──────────────────────────────────────────────────────────
async function createSigner() {
  const credId = process.env.CI_PASSKEY_CREDENTIAL_ID;
  const privKey = process.env.CI_PASSKEY_PRIVATE_KEY;

  // Preferred: pure Node.js signing (no browser)
  if (credId && privKey) {
    console.log("Mode: Pure Node.js (PasskeySigner)\n");
    const { PasskeySigner } = await import("../utils/passkey-signer.js");
    return {
      signer: new PasskeySigner({
        credentialId: credId,
        privateKey: privKey,
        rpId: RP_ID,
        origin: `http://localhost:${PORT}`,
      }),
      cleanup: async () => {},
    };
  }

  // Fallback: Playwright virtual authenticator
  console.log("Mode: Virtual Authenticator (Playwright + CDP)");
  console.log("  (Set CI_PASSKEY_CREDENTIAL_ID + CI_PASSKEY_PRIVATE_KEY for pure mode)\n");

  const server = await startFallbackServer(PORT);
  const actualPort = server.address().port;
  console.log(`Dev server started on port ${actualPort}`);

  let VirtualAuthenticator;
  try {
    const mod = await import("../utils/virtual-authenticator.js");
    VirtualAuthenticator = mod.VirtualAuthenticator;
  } catch (err) {
    server.close();
    throw new Error(
      `Playwright not available and CI_PASSKEY secrets not set.\n` +
        `Either run ci-one-time-setup.js first, or install playwright.\n` +
        `Error: ${err.message}`
    );
  }

  const auth = new VirtualAuthenticator({ rpId: RP_ID, port: actualPort });
  await auth.setup();
  await auth.createPasskey("ci-test-user", "ci@byzantine.fi", "CI Test User");
  console.log(`Credential ID: ${auth.credentialId}\n`);

  return {
    signer: auth,
    cleanup: async () => {
      await auth.teardown();
      await new Promise((r) => server.close(r));
    },
  };
}

// ──────────────────────────────────────────────────────────
// Fallback HTTP server (only used when Playwright path is active)
// ──────────────────────────────────────────────────────────
function startFallbackServer(port) {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
  };
  const server = createServer((req, res) => {
    try {
      const urlPath = req.url === "/" ? "tests/web/api-testing.html" : req.url.substring(1);
      const filePath = join(rootDir, urlPath.split("?")[0]);
      const ext = filePath.substring(filePath.lastIndexOf("."));
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve(server));
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        startFallbackServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// ──────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────
async function main() {
  console.log("🔐 CI Stamp Generation\n");

  // Load payloads
  if (!existsSync(TX_FILE)) {
    console.log("No generated-tx-passkey.json found. Run init-passkey tests first.");
    process.exit(0);
  }

  let txData;
  try {
    txData = JSON.parse(readFileSync(TX_FILE, "utf-8"));
  } catch (err) {
    console.error(`Failed to read ${TX_FILE}:`, err.message);
    process.exit(1);
  }

  const toSign = SIGNABLE_TYPES.filter((type) => txData[type]?.bodyToSign);
  if (toSign.length === 0) {
    console.log("No bodyToSign payloads found. Nothing to sign.");
    process.exit(0);
  }

  console.log(`Found ${toSign.length} payload(s) to sign: ${toSign.join(", ")}`);
  console.log(`RP ID: ${RP_ID}\n`);

  // Create signer (pure Node.js or Playwright fallback)
  const { signer, cleanup } = await createSigner();

  try {
    for (const type of toSign) {
      console.log(`Signing ${type}...`);
      const stamp = await signer.signPayload(txData[type].bodyToSign);
      txData[type].webAuthnStamp = stamp;
      console.log(`  ✅ ${type} signed`);
    }

    writeFileSync(TX_FILE, JSON.stringify(txData, null, 2), "utf-8");
    console.log(`\n📝 Stamps written to generated-tx-passkey.json`);
    console.log("🔐 Stamp generation complete!\n");
  } catch (err) {
    console.error("\n❌ Error during stamp generation:", err.message);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
