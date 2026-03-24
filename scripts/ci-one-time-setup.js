#!/usr/bin/env node

/**
 * One-Time CI Setup
 *
 * Run this ONCE to create a test account with a virtual passkey credential,
 * then extract the private key via CDP. After running this script:
 *
 *   1. Approve KYC for the created account in the Byzantine dashboard
 *   2. Store the output values as CI secrets / .env variables
 *
 * After that, CI runs use pure Node.js crypto (no Playwright needed).
 *
 * Usage:
 *   node scripts/ci-one-time-setup.js
 *
 * Output:
 *   CI_PASSKEY_CREDENTIAL_ID, CI_PASSKEY_PRIVATE_KEY, CI_PASSKEY_ACCOUNT_ID, etc.
 */

import { createServer } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);

const PORT = parseInt(process.env.VIRTUAL_AUTH_PORT || "3000", 10);
const RP_ID = process.env.VIRTUAL_AUTH_RPID || "localhost";
const VALID_USER_FILE = join(rootDir, "fixtures/test-data/users/valid-user.json");

// ──────────────────────────────────────────────────────────
// Minimal HTTP server
// ──────────────────────────────────────────────────────────
function startServer(port) {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
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
    server.on("error", reject);
  });
}

// ──────────────────────────────────────────────────────────
// API helper
// ──────────────────────────────────────────────────────────
async function apiCall(method, path, body = null) {
  const { generateAuthHeaders } = await import("../utils/auth.js");
  const { getEnvironmentBaseURL, isProduction } = await import("../config/environments.js");

  const baseURL = getEnvironmentBaseURL();
  const key = isProduction()
    ? process.env.PROD_INTEGRATOR_PRIVATE_KEY
    : process.env.DEV_INTEGRATOR_PRIVATE_KEY;
  if (!key) throw new Error("INTEGRATOR_PRIVATE_KEY is required");

  const authHeaders = generateAuthHeaders(key, method, path, body || "");
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data };
}

// ──────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────
async function main() {
  console.log("🔧 One-Time CI Setup — Create Account + Extract Passkey Credentials\n");

  // Step 1: Start server + virtual authenticator
  console.log("Step 1: Starting server and virtual authenticator...");
  const server = await startServer(PORT);
  const actualPort = server.address().port;

  const { VirtualAuthenticator } = await import("../utils/virtual-authenticator.js");
  const auth = new VirtualAuthenticator({ rpId: RP_ID, port: actualPort });
  await auth.setup();
  console.log(`  Server on port ${actualPort}, authenticator ready\n`);

  try {
    // Step 2: Create passkey credential
    console.log("Step 2: Creating passkey credential...");
    await auth.page.goto(`http://localhost:${actualPort}/tests/web/api-testing.html`);

    const credential = await auth.page.evaluate(
      async ({ rpId, rpName }) => {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const cred = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { id: rpId, name: rpName },
            user: {
              id: new TextEncoder().encode("ci-passkey-user"),
              name: "ci-passkey@byzantine.fi",
              displayName: "CI Passkey User",
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" },
              { alg: -257, type: "public-key" },
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              residentKey: "preferred",
              userVerification: "preferred",
            },
            timeout: 60000,
          },
        });

        function bufferToBase64url(buffer) {
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
        }

        const clientDataStr = new TextDecoder().decode(cred.response.clientDataJSON);
        const clientData = JSON.parse(clientDataStr);

        return {
          credentialId: bufferToBase64url(cred.rawId),
          clientDataJson: bufferToBase64url(cred.response.clientDataJSON),
          attestationObject: bufferToBase64url(cred.response.attestationObject),
          challengeFromClientData: clientData.challenge,
        };
      },
      { rpId: RP_ID, rpName: "Byzantine Test" }
    );

    auth.credentialId = credential.credentialId;
    console.log(`  Credential ID: ${credential.credentialId}\n`);

    // Step 3: Extract private key via CDP
    console.log("Step 3: Extracting private key via CDP...");
    const { credentials } = await auth.cdpSession.send("WebAuthn.getCredentials", {
      authenticatorId: auth.authenticatorId,
    });

    if (!credentials || credentials.length === 0) {
      throw new Error("No credentials found in virtual authenticator");
    }

    const privateKeyBase64 = credentials[0].privateKey;
    console.log(`  Private key extracted (PKCS#8, ${privateKeyBase64.length} chars)\n`);

    // Step 4: Verify signing works with PasskeySigner
    console.log("Step 4: Verifying pure Node.js signing...");
    const { PasskeySigner } = await import("../utils/passkey-signer.js");
    const signer = new PasskeySigner({
      credentialId: credential.credentialId,
      privateKey: privateKeyBase64,
      rpId: RP_ID,
      origin: `http://localhost:${actualPort}`,
    });
    const testStamp = signer.signPayload({ test: "payload" });
    console.log(`  ✅ PasskeySigner produces valid stamps (${JSON.parse(testStamp).signature.length} char sig)\n`);

    // Step 5: Create account via API
    console.log("Step 5: Creating individual account with passkey credential...");
    const validUser = JSON.parse(readFileSync(VALID_USER_FILE, "utf-8"));
    const timestamp = Math.floor(Date.now() / 1000);
    const [emailLocal, emailDomain] = (validUser.userInfo.email || "ci@byzantine.fi").split("@");
    const uniqueEmail = `${emailLocal}+ci-passkey-${timestamp}@${emailDomain}`;

    const createUserRequest = {
      ...validUser,
      userInfo: { ...validUser.userInfo, email: uniqueEmail },
      authenticators: [
        {
          authenticatorName: "CI Passkey",
          challenge: credential.challengeFromClientData,
          attestation: {
            credentialId: credential.credentialId,
            clientDataJson: credential.clientDataJson,
            attestationObject: credential.attestationObject,
            transports: ["AUTHENTICATOR_TRANSPORT_INTERNAL"],
          },
        },
      ],
    };

    const createResponse = await apiCall("POST", "/v1/submit/create-individual-account", createUserRequest);
    if (!createResponse.ok) {
      console.error("  ❌ Account creation failed:", JSON.stringify(createResponse.data));
      process.exit(1);
    }

    const { userId, accountId } = createResponse.data;
    console.log(`  ✅ Account created!`);
    console.log(`  User ID:    ${userId}`);
    console.log(`  Account ID: ${accountId}`);
    console.log(`  Email:      ${uniqueEmail}\n`);

    // Step 6: Output secrets
    const divider = "═".repeat(60);
    console.log(divider);
    console.log("  📋 CI SECRETS — Add these to .env and/or GitHub Secrets");
    console.log(divider);
    console.log();
    console.log(`CI_PASSKEY_CREDENTIAL_ID=${credential.credentialId}`);
    console.log(`CI_PASSKEY_PRIVATE_KEY=${privateKeyBase64}`);
    console.log(`CI_PASSKEY_ACCOUNT_ID=${accountId}`);
    console.log(`CI_PASSKEY_USER_ID=${userId}`);
    console.log(`CI_PASSKEY_EMAIL=${uniqueEmail}`);
    console.log();
    console.log(divider);
    console.log("  ⚠️  NEXT STEPS:");
    console.log("  1. Approve KYC for this account in the Byzantine dashboard");
    console.log("  2. Add the above values to your .env file");
    console.log("  3. Add CI_PASSKEY_CREDENTIAL_ID and CI_PASSKEY_PRIVATE_KEY");
    console.log("     as secrets in GitHub Actions");
    console.log("  4. Set TEST_PASSKEY_TARGET_ACCOUNT_ID and");
    console.log("     TEST_INIT_ACTIVATE_TARGET_ACCOUNT_ID and");
    console.log("     TEST_INIT_DEPOSIT_TARGET_ACCOUNT_ID to the account ID above");
    console.log(divider);
  } finally {
    await auth.teardown();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err.message);
  if (process.env.DEBUG_MODE === "true") console.error(err.stack);
  process.exit(1);
});
