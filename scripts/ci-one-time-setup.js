#!/usr/bin/env node

/**
 * One-Time CI Setup
 *
 * Creates test accounts (individual + entity) with virtual passkey credentials,
 * then extracts the private keys via CDP. After running this script:
 *
 *   1. Approve KYC/KYB for the created accounts in the Byzantine dashboard
 *   2. Store the output values as CI secrets / .env variables
 *
 * Usage:
 *   node scripts/ci-one-time-setup.js              # Both individual + entity
 *   node scripts/ci-one-time-setup.js --individual  # Individual only
 *   node scripts/ci-one-time-setup.js --entity      # Entity only
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
const VALID_ENTITY_FILE = join(rootDir, "fixtures/test-data/entities/valid-entity.json");

// Parse CLI args
const args = process.argv.slice(2);
const createIndividual = args.includes("--individual") || args.includes("--all") || args.length === 0;
const createEntity = args.includes("--entity") || args.includes("--all") || args.length === 0;

// ── Shared helpers ──────────────────────────────────────

function startServer(port) {
  const mimeTypes = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json" };
  const server = createServer((req, res) => {
    try {
      const urlPath = req.url === "/" ? "tests/web/api-testing.html" : req.url.substring(1);
      const filePath = join(rootDir, urlPath.split("?")[0]);
      const ext = filePath.substring(filePath.lastIndexOf("."));
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(content);
    } catch { res.writeHead(404); res.end("Not found"); }
  });
  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve(server));
    server.on("error", reject);
  });
}

async function apiCall(method, path, body = null) {
  const { generateAuthHeaders } = await import("../utils/auth.js");
  const { getEnvironmentBaseURL, isProduction } = await import("../config/environments.js");
  const baseURL = getEnvironmentBaseURL();
  const key = isProduction() ? process.env.PROD_INTEGRATOR_PRIVATE_KEY : process.env.DEV_INTEGRATOR_PRIVATE_KEY;
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

function uniqueEmail(base) {
  const ts = Math.floor(Date.now() / 1000);
  const [local, domain] = base.split("@");
  return `${local}+ci-passkey-${ts}@${domain}`;
}

/**
 * Create a passkey credential and extract its private key via CDP
 */
async function createCredentialAndExtractKey(auth, actualPort, label) {
  console.log(`  Creating passkey credential for ${label}...`);
  await auth.page.goto(`http://localhost:${actualPort}/tests/web/api-testing.html`);

  const credential = await auth.page.evaluate(
    async ({ rpId, rpName, label }) => {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: rpId, name: rpName },
          user: {
            id: new TextEncoder().encode(`ci-${label}`),
            name: `ci-${label}@byzantine.fi`,
            displayName: `CI ${label}`,
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
    { rpId: RP_ID, rpName: "Byzantine Test", label }
  );

  auth.credentialId = credential.credentialId;

  // Extract private key via CDP
  const { credentials } = await auth.cdpSession.send("WebAuthn.getCredentials", {
    authenticatorId: auth.authenticatorId,
  });
  const lastCred = credentials[credentials.length - 1];

  console.log(`  Credential ID: ${credential.credentialId}`);
  console.log(`  Private key extracted (${lastCred.privateKey.length} chars)\n`);

  // Verify PasskeySigner works
  const { PasskeySigner } = await import("../utils/passkey-signer.js");
  new PasskeySigner({
    credentialId: credential.credentialId,
    privateKey: lastCred.privateKey,
    rpId: RP_ID,
    origin: `http://localhost:${actualPort}`,
  }).signPayload({ test: true });
  console.log("  ✅ PasskeySigner verification passed\n");

  return { ...credential, privateKeyBase64: lastCred.privateKey };
}

/**
 * Build the authenticator attestation object for API requests
 */
function buildAuthenticator(credential) {
  return {
    authenticatorName: "CI Passkey",
    challenge: credential.challengeFromClientData,
    attestation: {
      credentialId: credential.credentialId,
      clientDataJson: credential.clientDataJson,
      attestationObject: credential.attestationObject,
      transports: ["AUTHENTICATOR_TRANSPORT_INTERNAL"],
    },
  };
}

// ── Main ────────────────────────────────────────────────

async function main() {
  console.log("🔧 One-Time CI Setup — Create Accounts + Extract Passkey Credentials\n");
  console.log(`  Create individual: ${createIndividual}`);
  console.log(`  Create entity:     ${createEntity}\n`);

  const server = await startServer(PORT);
  const actualPort = server.address().port;
  const { VirtualAuthenticator } = await import("../utils/virtual-authenticator.js");
  const auth = new VirtualAuthenticator({ rpId: RP_ID, port: actualPort });
  await auth.setup();
  console.log(`  Server on port ${actualPort}, authenticator ready\n`);

  const secrets = {};

  try {
    // ── Individual account ────────────────────────────────
    if (createIndividual) {
      console.log("━".repeat(50));
      console.log("  INDIVIDUAL ACCOUNT");
      console.log("━".repeat(50));

      const cred = await createCredentialAndExtractKey(auth, actualPort, "individual");
      const validUser = JSON.parse(readFileSync(VALID_USER_FILE, "utf-8"));
      const email = uniqueEmail(validUser.userInfo.email || "ci@byzantine.fi");

      const resp = await apiCall("POST", "/v1/submit/create-individual-account", {
        ...validUser,
        userInfo: { ...validUser.userInfo, email },
        authenticators: [buildAuthenticator(cred)],
      });

      if (!resp.ok) {
        console.error("  ❌ Individual account creation failed:", JSON.stringify(resp.data));
        process.exit(1);
      }

      secrets.individual = {
        credentialId: cred.credentialId,
        privateKey: cred.privateKeyBase64,
        accountId: resp.data.accountId,
        userId: resp.data.userId,
        email,
      };

      console.log(`  ✅ Individual account created`);
      console.log(`     User ID:    ${secrets.individual.userId}`);
      console.log(`     Account ID: ${secrets.individual.accountId}`);
      console.log(`     Email:      ${email}\n`);
    }

    // ── Entity account ────────────────────────────────────
    if (createEntity) {
      console.log("━".repeat(50));
      console.log("  ENTITY ACCOUNT");
      console.log("━".repeat(50));

      const cred = await createCredentialAndExtractKey(auth, actualPort, "entity");
      const validEntity = JSON.parse(readFileSync(VALID_ENTITY_FILE, "utf-8"));
      const entityEmail = uniqueEmail(validEntity.entityInfo.email || "ci-entity@byzantine.fi");
      const rootUserEmail = uniqueEmail(validEntity.rootUsers[0]?.email || "ci-root@byzantine.fi");

      const resp = await apiCall("POST", "/v1/submit/create-entity-account", {
        ...validEntity,
        entityInfo: { ...validEntity.entityInfo, email: entityEmail },
        rootUsers: validEntity.rootUsers.map((user, index) => ({
          ...user,
          email: index === 0 ? rootUserEmail : uniqueEmail(user.email),
          // Attach authenticator to the first root user
          ...(index === 0 && { authenticators: [buildAuthenticator(cred)] }),
        })),
        associatedPersons: validEntity.associatedPersons?.map((person) => ({
          ...person,
          userInfo: { ...person.userInfo, email: uniqueEmail(person.userInfo.email) },
        })),
      });

      if (!resp.ok) {
        console.error("  ❌ Entity account creation failed:", JSON.stringify(resp.data));
        process.exit(1);
      }

      const rootUser = resp.data.rootUsers?.[0];
      secrets.entity = {
        credentialId: cred.credentialId,
        privateKey: cred.privateKeyBase64,
        entityId: resp.data.entityId,
        accountId: resp.data.accountId,
        rootUserId: rootUser?.userId,
        entityEmail,
        rootUserEmail,
      };

      console.log(`  ✅ Entity account created`);
      console.log(`     Entity ID:     ${secrets.entity.entityId}`);
      console.log(`     Account ID:    ${secrets.entity.accountId}`);
      console.log(`     Root User ID:  ${secrets.entity.rootUserId}`);
      console.log(`     Entity Email:  ${entityEmail}`);
      console.log(`     Root Email:    ${rootUserEmail}\n`);
    }

    // ── Output secrets ──────────────────────────────────
    const divider = "═".repeat(60);
    console.log(divider);
    console.log("  📋 CI SECRETS — Add these to .env and/or GitHub Secrets");
    console.log(divider);
    console.log();

    if (secrets.individual) {
      console.log("# ── Individual Account ──");
      console.log(`CI_PASSKEY_CREDENTIAL_ID=${secrets.individual.credentialId}`);
      console.log(`CI_PASSKEY_PRIVATE_KEY=${secrets.individual.privateKey}`);
      console.log(`CI_PASSKEY_ACCOUNT_ID=${secrets.individual.accountId}`);
      console.log(`CI_PASSKEY_USER_ID=${secrets.individual.userId}`);
      console.log(`CI_PASSKEY_EMAIL=${secrets.individual.email}`);
      console.log();
    }

    if (secrets.entity) {
      console.log("# ── Entity Account ──");
      console.log(`CI_ENTITY_PASSKEY_CREDENTIAL_ID=${secrets.entity.credentialId}`);
      console.log(`CI_ENTITY_PASSKEY_PRIVATE_KEY=${secrets.entity.privateKey}`);
      console.log(`CI_ENTITY_PASSKEY_ACCOUNT_ID=${secrets.entity.accountId}`);
      console.log(`CI_ENTITY_PASSKEY_ENTITY_ID=${secrets.entity.entityId}`);
      console.log(`CI_ENTITY_PASSKEY_ROOT_USER_ID=${secrets.entity.rootUserId}`);
      console.log(`CI_ENTITY_PASSKEY_EMAIL=${secrets.entity.entityEmail}`);
      console.log();
    }

    console.log(divider);
    console.log("  ⚠️  NEXT STEPS:");
    let step = 1;
    if (secrets.individual) {
      console.log(`  ${step++}. Approve KYC for individual account ${secrets.individual.accountId}`);
    }
    if (secrets.entity) {
      console.log(`  ${step++}. Approve KYB for entity account ${secrets.entity.accountId}`);
    }
    console.log(`  ${step}. Add the above values to .env and GitHub Secrets`);
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
