/**
 * Activate Account SDK Tests, what are tested:
 * - getActivateAccountPayloadPasskey
 * - signPayloadPasskey (for activate account)
 *
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
  assertSchema,
} from "../../utils/sdk-assertions.js";
import { saveBodyToSign } from "../../utils/test-data-persistence.js";
import txRequest from "../../fixtures/test-data/__generated__/generated-tx-passkey.json" assert { type: "json" };

const describeGetPayload = !FEATURE_FLAGS.enableSignActivateAccount
  ? describe
  : describe.skip;

const describeSignPayload = FEATURE_FLAGS.enableSignActivateAccount
  ? describe
  : describe.skip;

describe("Activate a Byzantine account with Passkey SDK", () => {
  const client = getSdkClient();
  const testAccountId = TEST_DATA.accounts.testAccountId;
  const chainId = TEST_DATA.vaults.selected.chainId;

  describeGetPayload(
    "getActivateAccountPayloadPasskey()",
    () => {
      it(
        "should get the activate account payload to sign",
        async () => {
          const sdkResponse = await client.api.getActivateAccountPayloadPasskey(
            chainId,
            { accountId: testAccountId },
            DUMMY_AUTH,
          );

          assertSuccessWithSchema(sdkResponse, "PasskeyPayloadRequestResponse");
          assertDataHasFields(sdkResponse, ["bodyToSign", "transactionId"]);

          // Save activate account payload to sign to generated-tx-passkey.json
          saveBodyToSign(
            "activateAccount",
            sdkResponse.data.bodyToSign,
            sdkResponse.data.transactionId,
          );
        },
        getTimeout("api"),
      );
    },
  );

  describeSignPayload("signPayloadPasskey() - activate account", () => {
    it(
      "should sign the activate account payload",
      async () => {
        const requestBody = {
          signedBody: txRequest.activateAccount.bodyToSign,
          transactionId: txRequest.activateAccount.transactionId,
          webAuthnStamp: txRequest.activateAccount.webAuthnStamp,
        };

        assertSchema(requestBody, "SignPayloadRequestBodyPasskey");

        const sdkResponse = await client.api.signPayloadPasskey(
          chainId,
          requestBody,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "SendTransactionResponseBody");
      },
      getTimeout("api"),
    );
  });
});
