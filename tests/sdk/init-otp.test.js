/**
 * OTP deposit Transactions SDK Tests, what are tested:
 * - initApproveOtp (via raw client - not wrapped in SDK)
 * - initDepositOtp
 * - initWithdrawOtp
 *
 * Note: OTP tests require receiving real OTP codes via email
 * Enable with: ENABLE_OTP_TESTS=true ENABLE_AUTH_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertDataHasFields,
  assertError,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import { assertHasFields } from "../../utils/api-assertions.js";
import { saveOtpTransactionId } from "../../utils/test-data-persistence.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";

// Skip if OTP tests are disabled
const describeInitOtp = FEATURE_FLAGS.enableOtpTests ? describe : describe.skip;
const describeInitApproveOtp = FEATURE_FLAGS.enableOtpInitApproveTests
  ? describe
  : describe.skip;
const describeInitDepositOtp = FEATURE_FLAGS.enableOtpInitDepositTests
  ? describe
  : describe.skip;
const describeInitWithdrawOtp = FEATURE_FLAGS.enableOtpInitWithdrawTests
  ? describe
  : describe.skip;

describeInitOtp("Initiate OTP transactions SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  const depositAmount = passkeyData.depositAmount;
  const sourceCurrency = passkeyData.sourceCurrency;

  // Approve using OTP (via raw client - endpoint not wrapped in SDK)
  describeInitApproveOtp("initApproveOtp()", () => {
    it(
      "should initiate approve and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
        };

        assertHasFields(requestBody, ["accountId", "vaultAddr"]);

        // Use raw client since approve OTP is not in the OpenAPI types
        const sdkResponse = await client.api.client.POST(
          "/v1/query/init-approve-otp",
          {
            params: { query: { chain_id: chainId } },
            body: requestBody,
          },
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "OtpRequestResponse");
        assertDataHasFields(sdkResponse, [
          "transaction_id",
          "accountId",
          "vaultAddr",
        ]);

        // Save approve OTP transactionId to generated-tx-otp.json
        saveOtpTransactionId("approve", sdkResponse.data.transaction_id);
      },
      getTimeout("api"),
    );
  });

  describeInitDepositOtp("initDepositOtp()", () => {
    it(
      "should initiate deposit and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: depositAmount,
          sourceCurrency: sourceCurrency,
        };

        assertSchema(requestBody, "DepositRequestBody");

        const sdkResponse = await client.api.initDepositOtp(
          chainId,
          requestBody,
          DUMMY_AUTH,
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "OtpRequestResponse");
        assertDataHasFields(sdkResponse, ["transaction_id", "amount"]);

        // Save deposit OTP transactionId to generated-tx-otp.json
        saveOtpTransactionId("deposit", sdkResponse.data.transaction_id);
      },
      getTimeout("api"),
    );

    it(
      "should reject deposit with invalid amount",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: "-100.00", // Invalid negative amount
          sourceCurrency: sourceCurrency,
        };

        const sdkResponse = await client.api.initDepositOtp(
          chainId,
          requestBody,
          DUMMY_AUTH,
        );

        // Assert SDK error handling
        assertError(sdkResponse);
      },
      getTimeout("api"),
    );
  });

  // Withdrawal using OTP
  describeInitWithdrawOtp("initWithdrawOtp()", () => {
    it(
      "should initiate withdraw and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: passkeyData.withdrawAmount,
          destinationCurrency: passkeyData.destinationCurrency,
        };

        assertSchema(requestBody, "WithdrawRequestBody");

        const sdkResponse = await client.api.initWithdrawOtp(
          chainId,
          requestBody,
          DUMMY_AUTH,
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "OtpRequestResponse");
        assertDataHasFields(sdkResponse, ["transaction_id"]);

        // Save withdraw OTP transactionId to generated-tx-otp.json
        saveOtpTransactionId("withdraw", sdkResponse.data.transaction_id);
      },
      getTimeout("api"),
    );
  });
});
