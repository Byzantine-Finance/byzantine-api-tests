/**
 * OTP deposit Transactions SDK Tests, what are tested:
 * - initApproveOtp
 * - initDepositOtp
 * - initWithdrawOtp
 *
 * Note: OTP tests require receiving real OTP codes via email
 * Enable with: ENABLE_OTP_TESTS=true ENABLE_AUTH_TESTS=true
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it } from "vitest";
import { getSdkClient, formatSdkResponse } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
  TEST_DATA,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertHasFields,
  assertError,
  assertSchema,
} from "../../utils/assertions.js";
import { saveOtpTransactionId } from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/__generated__/tx-otp.json";

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
  const depositAmount = txRequest.depositAmount;
  const sourceCurrency = txRequest.sourceCurrency;

  describeInitApproveOtp("initApproveOtp()", () => {
    it(
      "should initiate approve and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
        };

        assertSchema(requestBody, "ApproveRequestBody");

        const sdkResponse = await client.api.initApproveOtp(
          chainId,
          requestBody
        );
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "OtpRequestResponse");
        assertHasFields(response.data, [
          "transaction_id",
          "accountId",
          "vaultAddr",
        ]);

        // Save approve OTP transactionId to tx-otp.json
        saveOtpTransactionId("approve", response.data.transaction_id);
      },
      getTimeout("api")
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
          requestBody
        );
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "OtpRequestResponse");
        assertHasFields(response.data, ["transaction_id", "amount"]);

        // Save deposit OTP transactionId to tx-otp.json
        saveOtpTransactionId("deposit", response.data.transaction_id);
      },
      getTimeout("api")
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
          requestBody
        );
        const response = formatSdkResponse(sdkResponse);

        assertError(response, 400);
      },
      getTimeout("api")
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
          amount: txRequest.withdrawAmount,
          destinationCurrency: txRequest.destinationCurrency,
        };

        assertSchema(requestBody, "WithdrawRequestBody");

        const sdkResponse = await client.api.initWithdrawOtp(
          chainId,
          requestBody
        );
        const response = formatSdkResponse(sdkResponse);

        assertSuccessWithSchema(response, "OtpRequestResponse");
        assertHasFields(response.data, ["transaction_id"]);

        // Save withdraw OTP transactionId to tx-otp.json
        saveOtpTransactionId("withdraw", response.data.transaction_id);
      },
      getTimeout("api")
    );
  });
});
