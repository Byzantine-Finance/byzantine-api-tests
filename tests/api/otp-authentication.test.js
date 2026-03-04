/**
 * OTP Authentication API Tests
 * - POST /v1/submit/init-otp (initialize OTP for user)
 * - POST /v1/submit/otp-auth (authenticate with OTP code)
 * - POST /v1/submit/create-authenticators-otp (create passkeys via OTP session)
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
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertHasFields,
  assertError,
  assertValidUuid,
  assertSchema,
} from "../../utils/api-assertions.js";
import {
  saveOtpData,
  loadOtpData,
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

describe("OTP Authentication API", () => {
  const testAccountId = "b0d17121-68dc-45d2-84fb-bdc18a3e903b";
  const testUserId = "448a1057-357a-4ba5-b446-f0fdbafefc42";
  
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

  describeInitOtpAuth("POST /v1/submit/init-otp", () => {
    it(
      "should initialize OTP for a user and send email",
      async () => {
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

        // Save otpId for next test
        otpId = response.data.otpId;
        expect(otpId).toBeDefined();
        expect(typeof otpId).toBe("string");

        // Persist otpId to file for use in separate test runs
        saveOtpData(otpId);

        console.log(`✅ OTP initialized. otpId: ${otpId}`);
        console.log(`📧 Check email for OTP code to use in authenticate test`);
      },
      getTimeout("api"),
    );
  });

  describeAuthenticateOtp("POST /v1/submit/otp-auth", () => {
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

        // Validate session fields
        assertValidUuid(response.data.sessionId);
        expect(response.data.session).toBeDefined();
        expect(response.data.expiresAt).toBeDefined();

        // Save sessionId for next test
        sessionId = response.data.sessionId;
        
        // Persist sessionId to file for use in separate test runs
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
              "authenticatorName": "Passkey",
              "challenge": "Hsa7hWL4VOmHFgV0jZHFa8zVcXvt0gT69hbgE9znyiQ",
              "attestation": {
                "credentialId": "UHA5LqAHX7SLxNUTM6_MeHE",
                "clientDataJson": "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiSHNhN2hXTDRWT21IRmdWMGpaSEZhOHpWY1h2dDBnVDY5aGJnRTl6bnlpUSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImNyb3NzT3JpZ2luIjpmYWxzZX0",
                "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViUSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAOqbjWZNAR0hPOS2tIy1ddQAEHA5LqAHX7SLxNUTM6_MeHGlAQIDJiABIVggkCN_kwFHNrqiWI6n4jlE4spGPCTUUI-RtplXUsOs1hEiWCBRIhVyRosbljVFN0gPX4omuhqiL6klWGlUNeZ33-OOPA",
                "transports": [
                  "AUTHENTICATOR_TRANSPORT_HYBRID",
                  "AUTHENTICATOR_TRANSPORT_INTERNAL"
                ]
              }
            }
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

          // Validate authenticatorIds
          expect(response.data.authenticatorIds).toBeInstanceOf(Array);
          expect(response.data.authenticatorIds.length).toBeGreaterThan(0);

          console.log(
            `✅ Created ${response.data.authenticatorIds.length} authenticator(s)`,
          );
        },
        getTimeout("api"),
      );
    },
  );
});
