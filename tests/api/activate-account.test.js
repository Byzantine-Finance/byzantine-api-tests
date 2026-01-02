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
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

const describeGetPayload = !FEATURE_FLAGS.enableSignActivateAccount
  ? describe
  : describe.skip;

const describeSignPayload = FEATURE_FLAGS.enableSignActivateAccount
  ? describe
  : describe.skip;

describe("Activate an Byzantine account with Passkey", () => {
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const chainId = TEST_DATA.vaults.selected.chainId;

  describeGetPayload(
    "POST /v1/query/get-activate-account-payload-passkey",
    () => {
      it(
        "should get the activate account payload to sign",
        async () => {
          const response = await apiClient.post(
            endpoints.passkey.getActivateAccountPayloadPasskey(chainId),
            { accountId: testAccountId },
            { authenticated: true }
          );
          assertSuccessWithSchema(response, "PasskeyPayloadRequestResponse");
          assertHasFields(response.data, ["bodyToSign", "transactionId"]);

          // Save activate account payload to sign to generated-activate-account-payload.json
          saveBodyToSign(
            "activateAccount",
            response.data.bodyToSign,
            response.data.transactionId
          );
        },
        getTimeout("api")
      );
    }
  );

  describeSignPayload("POST /v1/submit/sign-payload-passkey", () => {
    it(
      "should sign the activate account payload",
      async () => {
        const requestBody = {
          signedBody: txRequest.activateAccount.bodyToSign,
          transactionId: txRequest.activateAccount.transactionId,
          webAuthnStamp: txRequest.activateAccount.webAuthnStamp,
        };

        assertSchema(requestBody, "SignPayloadRequestBodyPasskey");

        const response = await apiClient.post(
          endpoints.passkey.signActivateAccountPayloadPasskey(chainId),
          requestBody,
          { authenticated: true }
        );

        assertSuccessWithSchema(response, "SendTransactionResponseBody");
      },
      getTimeout("api")
    );
  });
});
