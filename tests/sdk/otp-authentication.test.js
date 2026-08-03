/**
 * OTP Authentication SDK Tests
 * - initOtp (initialize OTP for user)
 * - otpAuth (authenticate with OTP code)
 * - createAuthenticatorsOtp (create passkeys via OTP session)
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
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertDataHasFields,
  assertValidUuid,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import {
  saveOtpData,
  loadOtpData,
  loadInvitedUserData,
  loadNewAuthData,
} from "../../utils/test-data-persistence.js";

// Individual test flags for granular control
const describeInitOtpAuth = FEATURE_FLAGS.enableOtpInitAuthTests
  ? describe
  : describe.skip;

const describeAuthenticateOtp = FEATURE_FLAGS.enableOtpAuthenticateTests
  ? describe
  : describe.skip;

const describeCreateAuthenticatorsOtp =
  FEATURE_FLAGS.enableOtpCreateAuthenticatorsTests ? describe : describe.skip;

describe("OTP Authentication SDK", () => {
  const client = getSdkClient();
  // Load invited user data (saved by user-invitation.test.js)
  const invitedUser = loadInvitedUserData();
  const orchestrated = process.env.CI_TEST_ORCHESTRATED === "true";
  const testAccountId = orchestrated
    ? process.env.CI_ENTITY_PASSKEY_ACCOUNT_ID || invitedUser.accountId
    : invitedUser.accountId;
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

  describeInitOtpAuth("initOtp()", () => {
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

        const sdkResponse = await client.api.initOtp(requestBody, DUMMY_AUTH);

        assertSuccessWithSchema(sdkResponse, "InitOtpResponse");
        assertDataHasFields(sdkResponse, ["otpId"]);

        otpId = sdkResponse.data.otpId;
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

  describeAuthenticateOtp("otpAuth()", () => {
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

        const sdkResponse = await client.api.otpAuth(requestBody, DUMMY_AUTH);

        assertSuccessWithSchema(sdkResponse, "OtpAuthResponse");
        assertDataHasFields(sdkResponse, ["session", "sessionId", "expiresAt"]);

        assertValidUuid(sdkResponse.data.sessionId);
        expect(sdkResponse.data.session).toBeDefined();
        expect(sdkResponse.data.expiresAt).toBeDefined();

        sessionId = sdkResponse.data.sessionId;
        saveOtpData(otpId, sessionId);

        console.log(`✅ OTP authenticated. sessionId: ${sessionId}`);
        console.log(`⏰ Session expires at: ${sdkResponse.data.expiresAt}`);
      },
      getTimeout("api"),
    );
  });

  describeCreateAuthenticatorsOtp("createAuthenticatorsOtp()", () => {
    it(
      "should create virtual authenticator for the invited user",
      async () => {
        if (!sessionId) {
          console.warn(
            "⚠️  Skipping — no sessionId. Run otp-auth test first.",
          );
          return;
        }

        let authenticators;
        let credential;
        let privateKeyBase64;
        let cleanup = async () => {};

        if (orchestrated) {
          const { createServer } = await import("http");
          const { readFileSync, writeFileSync } = await import("fs");
          const { join, dirname } = await import("path");
          const { fileURLToPath } = await import("url");

          const __dir = dirname(fileURLToPath(import.meta.url));
          const rootDir = join(__dir, "../..");
          const PORT = parseInt(process.env.VIRTUAL_AUTH_PORT || "0", 10);
          const RP_ID = process.env.VIRTUAL_AUTH_RPID || "localhost";

          const mimeTypes = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".json": "application/json",
          };
          const server = createServer((req, res) => {
            try {
              const urlPath =
                req.url === "/"
                  ? "tests/web/api-testing.html"
                  : req.url.substring(1);
              const filePath = join(rootDir, urlPath.split("?")[0]);
              const ext = filePath.substring(filePath.lastIndexOf("."));
              const content = readFileSync(filePath);
              res.writeHead(200, {
                "Content-Type": mimeTypes[ext] || "application/octet-stream",
              });
              res.end(content);
            } catch {
              res.writeHead(404);
              res.end("Not found");
            }
          });
          const actualPort = await new Promise((resolve) => {
            server.listen(PORT, () => resolve(server.address().port));
          });

          const { VirtualAuthenticator } = await import(
            "../../utils/virtual-authenticator.js"
          );
          const auth = new VirtualAuthenticator({
            rpId: RP_ID,
            port: actualPort,
          });
          await auth.setup();
          cleanup = async () => {
            await auth.teardown();
            await new Promise((resolve) => server.close(resolve));
          };

          await auth.page.goto(
            `http://localhost:${actualPort}/tests/web/api-testing.html`,
          );
          credential = await auth.page.evaluate(
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
                return btoa(binary)
                  .replace(/\+/g, "-")
                  .replace(/\//g, "_")
                  .replace(/=/g, "");
              }
              const clientDataStr = new TextDecoder().decode(
                cred.response.clientDataJSON,
              );
              const clientData = JSON.parse(clientDataStr);
              return {
                credentialId: bufferToBase64url(cred.rawId),
                clientDataJson: bufferToBase64url(cred.response.clientDataJSON),
                attestationObject: bufferToBase64url(
                  cred.response.attestationObject,
                ),
                challengeFromClientData: clientData.challenge,
              };
            },
            { rpId: RP_ID, rpName: "Byzantine Test" },
          );

          const { credentials } = await auth.cdpSession.send(
            "WebAuthn.getCredentials",
            { authenticatorId: auth.authenticatorId },
          );
          privateKeyBase64 = credentials[credentials.length - 1].privateKey;

          console.log(`  Virtual credential ID: ${credential.credentialId}`);
          console.log(
            `  Private key extracted (${privateKeyBase64.length} chars)`,
          );

          authenticators = [
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
        } else {
          const newAuthData = loadNewAuthData();
          if (!newAuthData.authenticators?.length) {
            console.warn(
              "⚠️  Skipping — no authenticators in generated-new-auth.json. Run npm run serve and create a passkey first.",
            );
            return;
          }
          authenticators = newAuthData.authenticators;
          console.log(
            `📂 Using ${authenticators.length} authenticator(s) from generated-new-auth.json`,
          );
        }

        try {
          const requestBody = {
            sessionId: sessionId,
            accountId: testAccountId,
            userId: testUserId,
            authenticators: authenticators,
          };

          assertSchema(requestBody, "CreateAuthenticatorsOtpRequest");

          const sdkResponse = await client.api.createAuthenticatorsOtp(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(sdkResponse, "CreateAuthenticatorsOtpResponse");
          assertDataHasFields(sdkResponse, ["authenticatorIds"]);
          expect(sdkResponse.data.authenticatorIds).toBeInstanceOf(Array);
          expect(sdkResponse.data.authenticatorIds.length).toBeGreaterThan(0);

          console.log(
            `✅ Created ${sdkResponse.data.authenticatorIds.length} authenticator(s) for invited user`,
          );

          if (orchestrated && credential && privateKeyBase64) {
            const { readFileSync, writeFileSync } = await import("fs");
            const { join, dirname } = await import("path");
            const { fileURLToPath } = await import("url");
            const __dir = dirname(fileURLToPath(import.meta.url));
            const rootDir = join(__dir, "../..");
            const INVITED_USER_FILE = join(
              rootDir,
              "fixtures/test-data/__generated__/generated-invited-user.json",
            );
            const existingData = JSON.parse(
              readFileSync(INVITED_USER_FILE, "utf-8"),
            );
            const updatedData = {
              ...existingData,
              credentialId: credential.credentialId,
              privateKey: privateKeyBase64,
              authenticatorIds: sdkResponse.data.authenticatorIds,
              lastUpdated: new Date().toISOString(),
            };
            writeFileSync(
              INVITED_USER_FILE,
              JSON.stringify(updatedData, null, 2),
              "utf-8",
            );
            console.log(
              `📝 Saved credential + private key to generated-invited-user.json`,
            );
          }
        } finally {
          await cleanup();
        }
      },
      getTimeout("passkey"),
    );
  });
});
