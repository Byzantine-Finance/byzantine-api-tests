/**
 * OTP Authentication API Tests
 * - POST /v1/submit/init-otp (initialize OTP for user)
 * - POST /v1/submit/otp-auth (authenticate with OTP code)
 * - POST /v1/submit/create-authenticators-otp (create passkeys via OTP session)
 *
 * Flow:
 * 1. Initialize OTP — sends email with OTP code to invited user
 * 2. Authenticate with OTP code — returns session ID (requires human to enter OTP)
 * 3. Use session ID to create authenticators (passkey for the invited user)
 *
 * Control individual tests with flags:
 * - ENABLE_OTP_INIT_AUTH_TESTS=true/false
 * - ENABLE_OTP_AUTHENTICATE_TESTS=true/false
 * - ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS=true/false
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertHasFields,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";
import {
  saveOtpData,
  loadOtpData,
  loadInvitedUserData,
} from "../../utils/test-data-persistence.js";

// Individual test flags
const describeInitOtpAuth = FEATURE_FLAGS.enableOtpInitAuthTests
  ? describe
  : describe.skip;

const describeAuthenticateOtp = FEATURE_FLAGS.enableOtpAuthenticateTests
  ? describe
  : describe.skip;

const describeCreateAuthenticatorsOtp =
  FEATURE_FLAGS.enableOtpCreateAuthenticatorsTests ? describe : describe.skip;

describe("OTP Authentication API", () => {
  // Load invited user data (saved by user-invitation.test.js)
  const invitedUser = loadInvitedUserData();
  const testAccountId =
    process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID || invitedUser.accountId;
  const testUserId = invitedUser.userId;

  // Load saved OTP data from previous test runs
  const savedOtpData = loadOtpData();
  let otpId = savedOtpData.otpId;
  let sessionId = savedOtpData.sessionId;

  if (testUserId) {
    console.log(`📂 Invited user: ${testUserId} (${invitedUser.email})`);
  } else {
    console.log(
      "⚠️  No invited user found. Run user-invitation tests first.",
    );
  }
  if (otpId) console.log(`📂 Loaded saved otpId: ${otpId}`);
  if (sessionId) console.log(`📂 Loaded saved sessionId: ${sessionId}`);

  describeInitOtpAuth("POST /v1/submit/init-otp", () => {
    it(
      "should initialize OTP for the invited user and send email",
      async () => {
        expect(testAccountId).toBeDefined();
        expect(testUserId).toBeDefined();

        const requestBody = {
          accountId: testAccountId,
          userId: testUserId,
        };

        assertSchema(requestBody, "InitOtpRequest");

        const response = await apiClient.post(
          endpoints.auth.initOtp,
          requestBody,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "InitOtpResponse");
        assertHasFields(response.data, ["otpId"]);

        otpId = response.data.otpId;
        expect(otpId).toBeDefined();
        expect(typeof otpId).toBe("string");

        saveOtpData(otpId);

        console.log(`✅ OTP initialized. otpId: ${otpId}`);
        console.log(`📧 Check email (${invitedUser.email}) for OTP code`);
        console.log(
          `💡 Set TEST_OTP_CODE=<code> and re-run with ENABLE_OTP_AUTHENTICATE_TESTS=true`,
        );
      },
      getTimeout("api"),
    );
  });

  describeAuthenticateOtp("POST /v1/submit/otp-auth", () => {
    it(
      "should authenticate with valid OTP code and return session",
      async () => {
        const otpCode = process.env.TEST_OTP_CODE;

        if (!otpCode) {
          console.warn(
            "⚠️  Skipping — set TEST_OTP_CODE env var with the code from email",
          );
          return;
        }

        if (!otpId) {
          console.warn("⚠️  Skipping — no otpId. Run init-otp test first.");
          return;
        }

        const requestBody = {
          accountId: testAccountId,
          userId: testUserId,
          otpId: otpId,
          otpCode: otpCode,
        };

        assertSchema(requestBody, "OtpAuthRequestBody");

        const response = await apiClient.post(
          endpoints.auth.authenticateOtp,
          requestBody,
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "OtpAuthResponse");
        assertHasFields(response.data, ["session", "sessionId", "expiresAt"]);

        assertValidUuid(response.data.sessionId);
        expect(response.data.session).toBeDefined();
        expect(response.data.expiresAt).toBeDefined();

        sessionId = response.data.sessionId;
        saveOtpData(otpId, sessionId);

        console.log(`✅ OTP authenticated. sessionId: ${sessionId}`);
        console.log(`⏰ Session expires at: ${response.data.expiresAt}`);
      },
      getTimeout("api"),
    );
  });

  describeCreateAuthenticatorsOtp(
    "POST /v1/submit/create-authenticators-otp",
    () => {
      it(
        "should create virtual authenticator for the invited user",
        async () => {
          if (!sessionId) {
            console.warn(
              "⚠️  Skipping — no sessionId. Run otp-auth test first.",
            );
            return;
          }

          // Create a real virtual authenticator credential using Playwright + CDP
          // so we can extract the private key and use it for signing later
          const { createServer } = await import("http");
          const { readFileSync, writeFileSync } = await import("fs");
          const { join, dirname } = await import("path");
          const { fileURLToPath } = await import("url");

          const __dir = dirname(fileURLToPath(import.meta.url));
          const rootDir = join(__dir, "../..");
          const PORT = parseInt(process.env.VIRTUAL_AUTH_PORT || "3000", 10);
          const RP_ID = process.env.VIRTUAL_AUTH_RPID || "localhost";

          // Start minimal server for WebAuthn page context
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
          const actualPort = await new Promise((resolve) => {
            server.listen(PORT, () => resolve(server.address().port));
          });

          const { VirtualAuthenticator } = await import("../../utils/virtual-authenticator.js");
          const auth = new VirtualAuthenticator({ rpId: RP_ID, port: actualPort });
          await auth.setup();

          try {
            // Navigate and create credential
            await auth.page.goto(`http://localhost:${actualPort}/tests/web/api-testing.html`);
            const credential = await auth.page.evaluate(
              async ({ rpId, rpName }) => {
                const challenge = crypto.getRandomValues(new Uint8Array(32));
                const cred = await navigator.credentials.create({
                  publicKey: {
                    challenge,
                    rp: { id: rpId, name: rpName },
                    user: {
                      id: new TextEncoder().encode("invited-user"),
                      name: "invited-user@byzantine.fi",
                      displayName: "Invited User",
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

            // Extract private key via CDP
            const { credentials } = await auth.cdpSession.send("WebAuthn.getCredentials", {
              authenticatorId: auth.authenticatorId,
            });
            const privateKeyBase64 = credentials[credentials.length - 1].privateKey;

            console.log(`  Virtual credential ID: ${credential.credentialId}`);
            console.log(`  Private key extracted (${privateKeyBase64.length} chars)`);

            // Register the authenticator with the API
            const authenticators = [
              {
                authenticatorName: "CI Invited User Passkey",
                challenge: credential.challengeFromClientData,
                attestation: {
                  credentialId: credential.credentialId,
                  clientDataJson: credential.clientDataJson,
                  attestationObject: credential.attestationObject,
                  transports: ["AUTHENTICATOR_TRANSPORT_INTERNAL"],
                },
              },
            ];

            const requestBody = {
              sessionId: sessionId,
              accountId: testAccountId,
              userId: testUserId,
              authenticators: authenticators,
            };

            assertSchema(requestBody, "CreateAuthenticatorsOtpRequest");

            const response = await apiClient.post(
              endpoints.auth.createAuthenticatorsOtp,
              requestBody,
              { authenticated: true },
            );

            assertSuccessWithSchema(response, "CreateAuthenticatorsOtpResponse");
            assertHasFields(response.data, ["authenticatorIds"]);
            expect(response.data.authenticatorIds).toBeInstanceOf(Array);
            expect(response.data.authenticatorIds.length).toBeGreaterThan(0);

            console.log(
              `✅ Created ${response.data.authenticatorIds.length} authenticator(s) for invited user`,
            );

            // Save credentials to generated-invited-user.json for future signing
            const INVITED_USER_FILE = join(
              rootDir,
              "fixtures/test-data/__generated__/generated-invited-user.json",
            );
            const existingData = JSON.parse(readFileSync(INVITED_USER_FILE, "utf-8"));
            const updatedData = {
              ...existingData,
              credentialId: credential.credentialId,
              privateKey: privateKeyBase64,
              authenticatorIds: response.data.authenticatorIds,
              lastUpdated: new Date().toISOString(),
            };
            writeFileSync(INVITED_USER_FILE, JSON.stringify(updatedData, null, 2), "utf-8");
            console.log(`📝 Saved credential + private key to generated-invited-user.json`);
          } finally {
            await auth.teardown();
            await new Promise((resolve) => server.close(resolve));
          }
        },
        getTimeout("passkey"),
      );
    },
  );
});
