/**
 * OTP Authentication SDK Tests
 * - initOtp (initialize OTP for user)
 * - otpAuth (authenticate with OTP code)
 * - createAuthenticatorsOtp (create passkeys via OTP session)
 *
 * Note: OTP tests require receiving real OTP codes via email
 *
 * Control individual tests with flags:
 * - ENABLE_OTP_INIT_AUTH_TESTS=true/false
 * - ENABLE_OTP_AUTHENTICATE_TESTS=true/false
 * - ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS=true/false
 *
 * Flow:
 * 1. Initialize OTP - sends email with OTP code
 * 2. Authenticate with OTP code - returns session ID
 * 3. Use session ID to create authenticators (passkeys)
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
} from "../../utils/test-data-persistence.js";
import { TEST_DATA } from "../../config/test.config.js";

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
  const testAccountId = TEST_DATA.accounts.testEntityAccountId;
  const invitedUserId = "235708ce-c4d4-4f87-8ac3-e6df8821bef1"; // TODO: store somewhere 

  // Load saved OTP data from previous test runs (if available)
  const savedOtpData = loadOtpData();
  let otpId = savedOtpData.otpId;
  let sessionId = savedOtpData.sessionId;

  if (otpId) {
    console.log(`📂 Loaded saved otpId: ${otpId}`);
  }
  if (sessionId) {
    console.log(`📂 Loaded saved sessionId: ${sessionId}`);
  }

  describeInitOtpAuth("initOtp()", () => {
    it(
      "should initialize OTP for a user and send email",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          userId: invitedUserId,
        };

        assertSchema(requestBody, "InitOtpRequest");

        const sdkResponse = await client.api.initOtp(
          requestBody,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "InitOtpResponse");
        assertDataHasFields(sdkResponse, ["otpId"]);

        // Save otpId for next test
        otpId = sdkResponse.data.otpId;
        expect(otpId).toBeDefined();
        expect(typeof otpId).toBe("string");

        // Persist otpId to file for use in separate test runs
        saveOtpData(otpId);

        console.log(`✅ OTP initialized. otpId: ${otpId}`);
        console.log(
          `📧 Check email for OTP code to use in authenticate test`,
        );
      },
      getTimeout("api"),
    );
  });

  describeAuthenticateOtp("otpAuth()", () => {
    it(
      "should authenticate with valid OTP code and return session",
      async () => {
        // This test requires manual OTP code entry
        const otpCode = process.env.TEST_OTP_CODE;

        if (!otpCode) {
          console.warn(
            "⚠️  Skipping OTP authentication test - no OTP code provided",
          );
          console.log(
            "💡 Set TEST_OTP_CODE environment variable with the code from email",
          );
          return;
        }

        if (!otpId) {
          console.warn(
            "⚠️  Skipping OTP authentication test - no otpId from init-otp test",
          );
          return;
        }

        const requestBody = {
          accountId: testAccountId,
          userId: invitedUserId,
          otpId: otpId,
          otpCode: otpCode,
        };

        assertSchema(requestBody, "OtpAuthRequestBody");

        const sdkResponse = await client.api.otpAuth(
          requestBody,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "OtpAuthResponse");
        assertDataHasFields(sdkResponse, [
          "session",
          "sessionId",
          "expiresAt",
        ]);

        // Validate session fields
        assertValidUuid(sdkResponse.data.sessionId);
        expect(sdkResponse.data.session).toBeDefined();
        expect(sdkResponse.data.expiresAt).toBeDefined();

        // Save sessionId for next test
        sessionId = sdkResponse.data.sessionId;

        // Persist sessionId to file for use in separate test runs
        saveOtpData(otpId, sessionId);

        console.log(`✅ OTP authenticated. sessionId: ${sessionId}`);
        console.log(
          `⏰ Session expires at: ${sdkResponse.data.expiresAt}`,
        );
      },
      getTimeout("api"),
    );
  });

  describeCreateAuthenticatorsOtp(
    "createAuthenticatorsOtp()",
    () => {
      it(
        "should create authenticators using OTP session",
        async () => {
          if (!sessionId) {
            console.warn(
              "⚠️  Skipping create authenticators test - no sessionId from otp-auth test",
            );
            return;
          }

          // Use authenticator data from valid-user.json
          const authenticators = [
            {
              authenticatorName: "Passkey",
              challenge:
                "Hsa7hWL4VOmHFgV0jZHFa8zVcXvt0gT69hbgE9znyiQ",
              attestation: {
                credentialId: "UHA5LqAHX7SLxNUTM6_MeHE",
                clientDataJson:
                  "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiSHNhN2hXTDRWT21IRmdWMGpaSEZhOHpWY1h2dDBnVDY5aGJnRTl6bnlpUSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImNyb3NzT3JpZ2luIjpmYWxzZX0",
                attestationObject:
                  "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViUSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAOqbjWZNAR0hPOS2tIy1ddQAEHA5LqAHX7SLxNUTM6_MeHGlAQIDJiABIVggkCN_kwFHNrqiWI6n4jlE4spGPCTUUI-RtplXUsOs1hEiWCBRIhVyRosbljVFN0gPX4omuhqiL6klWGlUNeZ33-OOPA",
                transports: [
                  "AUTHENTICATOR_TRANSPORT_HYBRID",
                  "AUTHENTICATOR_TRANSPORT_INTERNAL",
                ],
              },
            },
          ];

          const requestBody = {
            sessionId: sessionId,
            accountId: testAccountId,
            userId: invitedUserId,
            authenticators: authenticators,
          };

          assertSchema(requestBody, "CreateAuthenticatorsOtpRequest");

          const sdkResponse = await client.api.createAuthenticatorsOtp(
            requestBody,
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(
            sdkResponse,
            "CreateAuthenticatorsOtpResponse",
          );
          assertDataHasFields(sdkResponse, ["authenticatorIds"]);

          // Validate authenticatorIds
          expect(sdkResponse.data.authenticatorIds).toBeInstanceOf(Array);
          expect(sdkResponse.data.authenticatorIds.length).toBeGreaterThan(0);

          console.log(
            `✅ Created ${sdkResponse.data.authenticatorIds.length} authenticator(s)`,
          );
        },
        getTimeout("api"),
      );
    },
  );
});
