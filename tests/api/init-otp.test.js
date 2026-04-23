/**
 * OTP deposit Transactions API Tests, what are tested:
 * - query/init-deposit-otp
 * - query/init-withdraw-otp
 *
 * Note: OTP tests require receiving real OTP codes via email
 * Enable with: ENABLE_OTP_TESTS=true ENABLE_AUTH_TESTS=true
 */

import { describe, it } from "vitest";
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
  assertSchema,
} from "../../utils/api-assertions.js";
import { saveOtpTransactionId } from "../../utils/test-data-persistence.js";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load generated OTP data if it exists (avoid crash when file is missing and OTP tests are disabled)
const __otpDir = dirname(fileURLToPath(import.meta.url));
const __otpFile = join(__otpDir, "../../fixtures/test-data/__generated__/generated-tx-otp.json");
const txRequest = existsSync(__otpFile) ? JSON.parse(readFileSync(__otpFile, "utf-8")) : {};

// Skip if OTP tests are disabled
const describeInitOtp = FEATURE_FLAGS.enableOtpTests ? describe : describe.skip;
const describeInitDepositOtp = FEATURE_FLAGS.enableOtpInitDepositTests
  ? describe
  : describe.skip;
const describeInitWithdrawOtp = FEATURE_FLAGS.enableOtpInitWithdrawTests
  ? describe
  : describe.skip;

describeInitOtp("Initiate OTP transactions API", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const testVaultAddr = TEST_DATA.vaults.selected.address;
  const chainId = TEST_DATA.vaults.selected.chainId;
  // Amounts + currencies come from .env (DEPOSIT_AMOUNT, SOURCE_CURRENCY,
  // WITHDRAW_AMOUNT, DESTINATION_CURRENCY). Set them before running this file.
  const depositAmount = process.env.DEPOSIT_AMOUNT;
  const sourceCurrency = process.env.SOURCE_CURRENCY;
  const withdrawAmount = process.env.WITHDRAW_AMOUNT;
  const destinationCurrency = process.env.DESTINATION_CURRENCY;

  describeInitDepositOtp("POST /v1/query/init-deposit-otp", () => {
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

        const response = await apiClient.post(
          endpoints.otp.initDeposit(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "OtpRequestResponse");
        assertHasFields(response.data, ["transaction_id", "amount"]);

        // Save deposit OTP transactionId to generated-tx-otp.json
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

        const response = await apiClient.post(
          endpoints.otp.initDeposit(chainId),
          requestBody
        );

        assertError(response, 400);
      },
      getTimeout("api")
    );
  });

  // Withdrawal using OTP
  describeInitWithdrawOtp("POST /v1/query/init-withdraw-otp", () => {
    it(
      "should initiate withdraw and send OTP",
      async () => {
        const requestBody = {
          accountId: testAccountId,
          vaultAddr: testVaultAddr,
          amount: withdrawAmount,
          destinationCurrency: destinationCurrency,
        };

        assertSchema(requestBody, "WithdrawRequestBody");

        const response = await apiClient.post(
          endpoints.otp.initWithdraw(chainId),
          requestBody
        );

        assertSuccessWithSchema(response, "OtpRequestResponse");
        assertHasFields(response.data, ["transaction_id"]);

        // Save withdraw OTP transactionId to generated-tx-otp.json
        saveOtpTransactionId("withdraw", response.data.transaction_id);
      },
      getTimeout("api")
    );
  });
});
