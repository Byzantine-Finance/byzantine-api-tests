/**
 * Integrator Key Management SDK Tests, what are tested (via @byzantine/integrator-sdk):
 * - GET    /v1/integrator/whoami                (current credential + capabilities)
 * - POST   /v1/integrator/credentials           (issue a credential)
 * - PATCH  /v1/integrator/credentials/{pubkey}  (label / active / accessScope)
 * - DELETE /v1/integrator/credentials/{pubkey}  (revoke)
 *
 * Test-for-test mirror of tests/api/integrator-credentials.test.js, driven through
 * the SDK (response shape: { data, error, response }) instead of raw HTTP. Keep the
 * two files in step: when a case is added or dropped there, do the same here.
 *
 * NOTE: the bundled SDK (1.11.0) has no credential methods yet, so the credential
 * routes use the SDK's typed escape hatch
 * `client.api.client.{GET,POST,PATCH,DELETE}`. Doing so still exercises what the
 * SDK owns here — notably signing a request *with a body*, which is where the auth
 * middleware does the most work. The read sweep does use the SDK's named methods
 * where they exist. Swap in named credential methods once the SDK ships them.
 *
 * whoami is read-only and runs by default (enableIntegratorTests). The credential
 * lifecycle issues REAL credentials, so it is opt-in via
 * ENABLE_INTEGRATOR_CREDENTIAL_TESTS=true and additionally gated by
 * enableWriteTests — it never runs against production.
 */

import { describe, it, expect, afterAll } from "vitest";
import { ByzantineClient } from "@byzantine/integrator-sdk";
import { createSdkClient, getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import { getTimeout, FEATURE_FLAGS, TEST_DATA } from "../../config/test.config.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertError,
  assertValidUuid,
} from "../../utils/sdk-assertions.js";
import { derivePublicKey } from "../../utils/auth.js";
import { isProduction, getEnvironmentBaseURL } from "../../config/environments.js";
import { maybeUniqueEmail } from "../../utils/test-helpers.js";

import validUser from "../../fixtures/test-data/users/valid-user.json" assert { type: "json" };

const WHOAMI_PATH = "/v1/integrator/whoami";
const CREDENTIALS_PATH = "/v1/integrator/credentials";
const CREDENTIAL_PATH = "/v1/integrator/credentials/{pubkey}";
const EVENTS_PATH = "/v1/query/events";

// A syntactically valid compressed SEC1 key that belongs to no credential
const UNKNOWN_PUBKEY = `0x03${"a".repeat(64)}`;
// A private key whose pubkey is not registered for any integrator
const UNREGISTERED_PRIVATE_KEY = `0x${"11".repeat(32)}`;
// A well-formed UUID that should not correspond to any real record
const NONEXISTENT_ID = "00000000-0000-4000-8000-000000000000";

const ACCESS_SCOPES = ["read_write", "read_only"];

/**
 * The same full CreateIndividualAccountRequest the account-creation suite posts,
 * with owner/root emails uniquified the same way (see
 * tests/sdk/account-creation.test.js) so that if the scope check ever regressed,
 * the resulting account would be an obvious throwaway rather than a collision
 * with the suite's fixture account.
 */
function buildIndividualAccountRequest() {
  const ownerEmail = maybeUniqueEmail(validUser.userInfo.email);

  return {
    ...validUser,
    userInfo: { ...validUser.userInfo, email: ownerEmail },
    rootUsers: (validUser.rootUsers || []).map((r) => ({
      ...r,
      email:
        r.email === validUser.userInfo.email
          ? ownerEmail
          : maybeUniqueEmail(r.email),
    })),
  };
}

const describeIntegrator = FEATURE_FLAGS.enableIntegratorTests
  ? describe
  : describe.skip;

// Credential mutations: opt-in, write-gated, dev-only
const describeCredentials =
  FEATURE_FLAGS.enableIntegratorTests &&
  FEATURE_FLAGS.enableIntegratorCredentialTests &&
  FEATURE_FLAGS.enableWriteTests &&
  !isProduction()
    ? describe
    : describe.skip;

describeIntegrator("Integrator Key Management SDK - Using Integrator SDK", () => {
  const client = getSdkClient();

  const whoami = (c = client) => c.api.client.GET(WHOAMI_PATH);

  describe("GET /v1/integrator/whoami", () => {
    it(
      "should report the signing credential's identity and capabilities",
      async () => {
        const sdkResponse = await whoami();

        assertSuccessWithSchema(sdkResponse, "CurrentIntegratorResponse");
        const { integratorId, accessScope, capabilities } = sdkResponse.data;

        assertValidUuid(integratorId);
        expect(ACCESS_SCOPES).toContain(accessScope);
        // canWrite is derived from the scope — it is the flag a frontend gates UI on
        expect(capabilities.canWrite).toBe(accessScope === "read_write");
        console.log(
          `✅ whoami: integrator ${integratorId}, scope ${accessScope}, canWrite=${capabilities.canWrite}`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject a credential that is not registered",
      async () => {
        const strangerClient = createSdkClient({
          privateKey: UNREGISTERED_PRIVATE_KEY,
        });
        const sdkResponse = await whoami(strangerClient);

        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(401);
      },
      getTimeout("api"),
    );

    it(
      "should require integrator authentication",
      async () => {
        // A bare SDK client, built without utils/sdk-client's auth middleware, so
        // the request goes out unsigned.
        const unsignedClient = new ByzantineClient({
          integratorPrivateKey: UNREGISTERED_PRIVATE_KEY, // never used — nothing signs
          api: { baseUrl: getEnvironmentBaseURL() },
        });
        const sdkResponse = await whoami(unsignedClient);

        // Missing X-Pubkey is a malformed request, not an auth failure
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );
  });

  describeCredentials("Credential lifecycle", () => {
    // Every pubkey created here, removed in afterAll
    const created = [];

    const issueCredential = async (body, c = client) => {
      const sdkResponse = await c.api.client.POST(CREDENTIALS_PATH, { body });
      if (!sdkResponse.error) created.push(sdkResponse.data.pubkey);
      return sdkResponse;
    };

    const updateCredential = (pubkey, body, c = client) =>
      c.api.client.PATCH(CREDENTIAL_PATH, { params: { path: { pubkey } }, body });

    const deleteCredential = (pubkey, c = client) =>
      c.api.client.DELETE(CREDENTIAL_PATH, { params: { path: { pubkey } } });

    afterAll(async () => {
      for (const pubkey of created) {
        try {
          await deleteCredential(pubkey);
        } catch {
          // ignore cleanup errors
        }
      }
    });

    // The read_only credential the first test creates, and an SDK client that
    // signs with it — both reused by the rest of the block.
    let readOnly = null;
    let readOnlyClient = null;

    it(
      "should issue a read_only credential by default",
      async () => {
        const label = `sdk-test-${Date.now()}`;
        const sdkResponse = await issueCredential({ label });

        assertSuccessWithSchema(sdkResponse, "CreateCredentialResponse");
        expect(sdkResponse.response.status).toBe(201);

        const credential = sdkResponse.data;
        assertValidUuid(credential.integratorId);
        expect(credential.label).toBe(label);
        // accessScope is read_only unless asked for otherwise — least privilege
        expect(credential.accessScope).toBe("read_only");
        expect(credential.active).toBe(true);
        expect(credential.pubkey).toMatch(/^0x0[23][0-9a-f]{64}$/);
        // The private key is returned exactly once, at creation, and the pubkey
        // must be the one derived from it.
        expect(typeof credential.privateKey).toBe("string");
        expect(derivePublicKey(credential.privateKey)).toBe(credential.pubkey);

        readOnly = credential;
        readOnlyClient = createSdkClient({ privateKey: credential.privateKey });
        console.log(`✅ Issued read_only credential ${credential.pubkey}`);
      },
      getTimeout("api"),
    );

    it(
      "should issue a read_write credential when asked",
      async () => {
        const label = `sdk-test-rw-${Date.now()}`;
        const sdkResponse = await issueCredential({
          accessScope: "read_write",
          label,
        });

        assertSuccessWithSchema(sdkResponse, "CreateCredentialResponse");
        expect(sdkResponse.response.status).toBe(201);
        expect(sdkResponse.data.accessScope).toBe("read_write");
        expect(sdkResponse.data.active).toBe(true);
        expect(sdkResponse.data.label).toBe(label);
        expect(derivePublicKey(sdkResponse.data.privateKey)).toBe(
          sdkResponse.data.pubkey,
        );
      },
      getTimeout("api"),
    );

    it(
      "should keep multiple credentials working independently",
      async () => {
        // An integrator holds many credentials at once, each with its own scope,
        // label and active status. Two throwaway keys alongside the env one prove
        // they resolve independently and don't share state.
        const first = await issueCredential({
          label: `sdk-test-multi-a-${Date.now()}`,
        });
        const second = await issueCredential({
          accessScope: "read_write",
          label: `sdk-test-multi-b-${Date.now()}`,
        });
        assertSuccessWithSchema(first, "CreateCredentialResponse");
        assertSuccessWithSchema(second, "CreateCredentialResponse");

        const keys = [
          { name: "read_only", credential: first.data, canWrite: false },
          { name: "read_write", credential: second.data, canWrite: true },
        ];

        // Same integrator, distinct pubkeys, each reporting its own scope
        expect(first.data.pubkey).not.toBe(second.data.pubkey);
        for (const { name, credential, canWrite } of keys) {
          const sdkResponse = await whoami(
            createSdkClient({ privateKey: credential.privateKey }),
          );
          assertSuccessWithSchema(sdkResponse, "CurrentIntegratorResponse");
          expect(sdkResponse.data.integratorId).toBe(credential.integratorId);
          expect(sdkResponse.data.accessScope).toBe(name);
          expect(sdkResponse.data.capabilities.canWrite).toBe(canWrite);
        }

        // Deactivating one leaves the other — and the env credential — untouched
        const deactivated = await updateCredential(first.data.pubkey, {
          active: false,
        });
        assertSuccessWithSchema(deactivated, "CredentialSummaryResponse");

        const blocked = await whoami(
          createSdkClient({ privateKey: first.data.privateKey }),
        );
        assertError(blocked);
        expect(blocked.response.status).toBe(401);

        const sibling = await whoami(
          createSdkClient({ privateKey: second.data.privateKey }),
        );
        assertSuccessWithSchema(sibling, "CurrentIntegratorResponse");
        expect(sibling.data.accessScope).toBe("read_write");

        const envKey = await whoami();
        assertSuccessWithSchema(envKey, "CurrentIntegratorResponse");
        console.log(
          "✅ Multiple credentials coexist with independent scope and active status",
        );
      },
      getTimeout("api"),
    );

    it(
      "should let the new credential authenticate with read_only capabilities",
      async () => {
        expect(readOnly).not.toBeNull();

        const sdkResponse = await whoami(readOnlyClient);

        assertSuccessWithSchema(sdkResponse, "CurrentIntegratorResponse");
        expect(sdkResponse.data.integratorId).toBe(readOnly.integratorId);
        expect(sdkResponse.data.accessScope).toBe("read_only");
        expect(sdkResponse.data.capabilities.canWrite).toBe(false);

        // One authenticated GET per domain the integrator can read: `read_only`
        // is a *write* restriction, so all of these must behave exactly as they
        // do for the read_write credential. Named SDK methods where 1.11.0 has
        // them, the escape hatch for events. `array: true` validates each item
        // instead of the envelope.
        const queries = [
          { name: "top-vaults", call: (c) => c.api.getTopVaults(DUMMY_AUTH), schema: "TopVault", array: true },
          { name: "assets", call: (c) => c.api.getAssets(DUMMY_AUTH), schema: "get_assets_200" },
          { name: "get-customers", call: (c) => c.api.getCustomers(DUMMY_AUTH), schema: "GetCustomersResponse" },
          {
            name: "events",
            call: (c) => c.api.client.GET(EVENTS_PATH, { params: { query: { limit: 1 } } }),
            schema: "ListEventsResponse",
          },
          { name: "webhook subscriptions", call: (c) => c.api.listWebhookSubscriptions(DUMMY_AUTH), schema: "ListWebhookSubscriptionsResponse" },
          { name: "webhook deliveries", call: (c) => c.api.listWebhookDeliveries(DUMMY_AUTH), schema: "ListWebhookDeliveriesResponse" },
        ];

        // An account-scoped read too, when the suite has an account to point at —
        // collection listings alone wouldn't prove per-account reads work.
        const { testAccountId } = TEST_DATA.accounts;
        if (testAccountId) {
          queries.push({
            name: "get-account-details",
            call: (c) => c.api.getAccountDetails(testAccountId, DUMMY_AUTH),
            schema: "GetAccountDetailsResponse",
          });
        }

        for (const { name, call, schema, array } of queries) {
          const result = await call(readOnlyClient);

          // Fail with the endpoint name attached — a bare schema error here would
          // not say which of the reads regressed.
          expect(
            result.response.status,
            `${name} should be readable by a read_only credential, got ${result.response.status}: ${JSON.stringify(result.error)}`,
          ).toBe(200);

          if (array) {
            assertArrayWithSchema(result, schema);
          } else {
            assertSuccessWithSchema(result, schema);
          }
        }

        console.log(
          `✅ read_only credential read ${queries.length} query endpoint(s): ${queries
            .map((q) => q.name)
            .join(", ")}`,
        );
      },
      // Seven round-trips plus schema validation of some large payloads — the
      // 15s api timeout is too tight when suites run in parallel.
      getTimeout("integration"),
    );

    it(
      "should forbid a read_only credential from mutating anything",
      async () => {
        expect(readOnly).not.toBeNull();

        // Issuing credentials...
        const issue = await issueCredential(
          { label: "read-only-credential" },
          readOnlyClient,
        );
        assertError(issue);
        expect(issue.response.status).toBe(403);

        // ...editing them...
        const edit = await updateCredential(
          readOnly.pubkey,
          { label: "should-not-apply" },
          readOnlyClient,
        );
        assertError(edit);
        expect(edit.response.status).toBe(403);

        // ...and any other mutation route. The scope check runs before body
        // validation, so an intentionally invalid body still answers 403.
        const write = await readOnlyClient.api.createIndividualAccount(
          { firstName: "scope-check" },
          DUMMY_AUTH,
        );
        assertError(write);
        expect(write.response.status).toBe(403);

        // The same route with a genuinely valid CreateIndividualAccountRequest —
        // the one the account-creation suite uses to create real accounts. This is
        // the assertion that matters: the scope, not a malformed body, is what
        // blocks it, so no account is created.
        const validRequest = buildIndividualAccountRequest();
        assertSchema(validRequest, "CreateIndividualAccountRequest");

        const realWrite = await readOnlyClient.api.createIndividualAccount(
          validRequest,
          DUMMY_AUTH,
        );
        assertError(realWrite);
        expect(realWrite.response.status).toBe(403);
        // A 201 here would mean a real account was created by a read-only key
        expect(realWrite.response.status).not.toBe(201);

        console.log(
          "✅ read_only credential rejected with 403 on all mutations, including a valid create-individual-account",
        );
      },
      // The valid payload is ~360KB of base64 documents — allow for the upload
      getTimeout("integration"),
    );

    it(
      "should fail closed for a read_only credential on every non-GET route",
      async () => {
        expect(readOnly).not.toBeNull();

        // Enforcement lives in the auth middleware, not per-route, so the check is
        // that it fires across every family of mutation route. A real subscription
        // is created with the env credential first, so the webhook cases can't pass
        // for the wrong reason (404 before the scope check).
        const subscription = await client.api.createWebhookSubscription(
          {
            url: `https://example.com/byzantine-webhook/sdk-scope-check-${Date.now()}`,
            enabled: true,
            eventTypes: ["customer.created"],
          },
          DUMMY_AUTH,
        );
        assertSuccessWithSchema(subscription, "WebhookSubscriptionResponse");
        const subscriptionId = subscription.data.subscription.id;

        try {
          const ro = readOnlyClient;
          const mutations = [
            // /v1/submit/*
            { name: "createIndividualAccount", call: () => ro.api.createIndividualAccount({ firstName: "x" }, DUMMY_AUTH) },
            { name: "updateIndividualAccount", call: () => ro.api.updateIndividualAccount({ userId: NONEXISTENT_ID }, DUMMY_AUTH) },
            { name: "addBankAccount", call: () => ro.api.addBankAccount({}, DUMMY_AUTH) },
            { name: "inviteUsers", call: () => ro.api.inviteUsers({}, DUMMY_AUTH) },
            { name: "initOtp", call: () => ro.api.initOtp({}, DUMMY_AUTH) },
            // Payload preparation — POST routes that live under /v1/query
            { name: "getDepositPayloadPasskey", call: () => ro.api.getDepositPayloadPasskey(8453, {}, DUMMY_AUTH) },
            { name: "getWithdrawPayloadPasskey", call: () => ro.api.getWithdrawPayloadPasskey(8453, {}, DUMMY_AUTH) },
            { name: "getInviteUsersPayloadPasskey", call: () => ro.api.getInviteUsersPayloadPasskey({}, DUMMY_AUTH) },
            // Webhook control
            { name: "createWebhookSubscription", call: () => ro.api.createWebhookSubscription({ url: "https://example.com/nope", enabled: true, eventTypes: [] }, DUMMY_AUTH) },
            { name: "updateWebhookSubscription", call: () => ro.api.updateWebhookSubscription(subscriptionId, { enabled: false }, DUMMY_AUTH) },
            { name: "sendTestWebhookDelivery", call: () => ro.api.sendTestWebhookDelivery(subscriptionId, DUMMY_AUTH) },
            { name: "deleteWebhookSubscription", call: () => ro.api.deleteWebhookSubscription(subscriptionId, DUMMY_AUTH) },
            { name: "retryWebhookDelivery", call: () => ro.api.retryWebhookDelivery(NONEXISTENT_ID, DUMMY_AUTH) },
            // Key management
            { name: "POST credentials", call: () => ro.api.client.POST(CREDENTIALS_PATH, { body: { label: "nope" } }) },
            { name: "PATCH credentials", call: () => updateCredential(readOnly.pubkey, { label: "nope" }, ro) },
            { name: "DELETE credentials", call: () => deleteCredential(readOnly.pubkey, ro) },
          ];

          for (const { name, call } of mutations) {
            const result = await call();
            expect(
              result.response.status,
              `${name} must be 403 for a read_only credential, got ${result.response.status}: ${JSON.stringify(result.error)}`,
            ).toBe(403);
          }

          // The subscription the read_only key tried to delete is still there
          const stillThere = await client.api.listWebhookSubscriptions(DUMMY_AUTH);
          assertSuccessWithSchema(stillThere, "ListWebhookSubscriptionsResponse");
          expect(
            stillThere.data.subscriptions.some(
              (s) => s.subscription.id === subscriptionId,
            ),
          ).toBe(true);

          console.log(
            `✅ read_only credential rejected with 403 on ${mutations.length} non-GET route(s)`,
          );
        } finally {
          await client.api.deleteWebhookSubscription(subscriptionId, DUMMY_AUTH);
        }
      },
      getTimeout("integration"),
    );

    it(
      "should update a credential's label",
      async () => {
        expect(readOnly).not.toBeNull();

        const label = `sdk-test-renamed-${Date.now()}`;
        const sdkResponse = await updateCredential(readOnly.pubkey, { label });

        assertSuccessWithSchema(sdkResponse, "CredentialSummaryResponse");
        expect(sdkResponse.data.pubkey).toBe(readOnly.pubkey);
        expect(sdkResponse.data.label).toBe(label);
        expect(sdkResponse.data.accessScope).toBe("read_only");
        expect(sdkResponse.data.active).toBe(true);
        // The summary never re-exposes the private key
        expect(sdkResponse.data.privateKey).toBeUndefined();
      },
      getTimeout("api"),
    );

    it(
      "should leave omitted fields untouched on a partial update",
      async () => {
        // A throwaway credential, so stepping it through every field doesn't
        // disturb the shared `readOnly` one.
        const issued = await issueCredential({
          accessScope: "read_write",
          label: "sdk-test-partial",
        });
        assertSuccessWithSchema(issued, "CreateCredentialResponse");
        const { pubkey } = issued.data;

        // label only → scope and active survive
        const relabelled = await updateCredential(pubkey, {
          label: "sdk-test-partial-renamed",
        });
        assertSuccessWithSchema(relabelled, "CredentialSummaryResponse");
        expect(relabelled.data.label).toBe("sdk-test-partial-renamed");
        expect(relabelled.data.accessScope).toBe("read_write");
        expect(relabelled.data.active).toBe(true);

        // active only → label and scope survive
        const deactivated = await updateCredential(pubkey, { active: false });
        assertSuccessWithSchema(deactivated, "CredentialSummaryResponse");
        expect(deactivated.data.active).toBe(false);
        expect(deactivated.data.label).toBe("sdk-test-partial-renamed");
        expect(deactivated.data.accessScope).toBe("read_write");

        // accessScope (downgrade) → label survives, and the key loses write access
        const demoted = await updateCredential(pubkey, {
          accessScope: "read_only",
          active: true,
        });
        assertSuccessWithSchema(demoted, "CredentialSummaryResponse");
        expect(demoted.data.accessScope).toBe("read_only");
        expect(demoted.data.label).toBe("sdk-test-partial-renamed");

        const demotedClient = createSdkClient({
          privateKey: issued.data.privateKey,
        });
        const capabilities = await whoami(demotedClient);
        assertSuccessWithSchema(capabilities, "CurrentIntegratorResponse");
        expect(capabilities.data.capabilities.canWrite).toBe(false);

        const write = await issueCredential({ label: "nope" }, demotedClient);
        assertError(write);
        expect(write.response.status).toBe(403);
        console.log(
          "✅ Partial updates leave omitted fields alone; downgrade revokes write access",
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject an update that changes nothing",
      async () => {
        expect(readOnly).not.toBeNull();

        const sdkResponse = await updateCredential(readOnly.pubkey, {});
        // At least one of accessScope, active or label must be provided
        assertError(sdkResponse);
        expect(sdkResponse.response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should stop authenticating once deactivated, and resume when re-activated",
      async () => {
        expect(readOnly).not.toBeNull();

        const deactivated = await updateCredential(readOnly.pubkey, {
          active: false,
        });
        assertSuccessWithSchema(deactivated, "CredentialSummaryResponse");
        expect(deactivated.data.active).toBe(false);

        const blocked = await whoami(readOnlyClient);
        assertError(blocked);
        expect(blocked.response.status).toBe(401);

        const reactivated = await updateCredential(readOnly.pubkey, {
          active: true,
        });
        assertSuccessWithSchema(reactivated, "CredentialSummaryResponse");
        expect(reactivated.data.active).toBe(true);

        const allowed = await whoami(readOnlyClient);
        assertSuccessWithSchema(allowed, "CurrentIntegratorResponse");
        console.log("✅ Deactivation takes effect immediately and is reversible");
      },
      getTimeout("api"),
    );

    it(
      "should grant write access when promoted to read_write",
      async () => {
        expect(readOnly).not.toBeNull();

        const promoted = await updateCredential(readOnly.pubkey, {
          accessScope: "read_write",
        });
        assertSuccessWithSchema(promoted, "CredentialSummaryResponse");
        expect(promoted.data.accessScope).toBe("read_write");

        // whoami now reports the widened capability...
        const capabilities = await whoami(readOnlyClient);
        assertSuccessWithSchema(capabilities, "CurrentIntegratorResponse");
        expect(capabilities.data.capabilities.canWrite).toBe(true);

        // ...and the mutation that was 403 before now succeeds
        const child = await issueCredential(
          { label: `sdk-test-child-${Date.now()}` },
          readOnlyClient,
        );
        assertSuccessWithSchema(child, "CreateCredentialResponse");
        expect(child.response.status).toBe(201);
        expect(child.data.integratorId).toBe(readOnly.integratorId);
        console.log("✅ Promotion to read_write takes effect immediately");
      },
      getTimeout("api"),
    );

    it(
      "should never let a credential deactivate, downgrade or delete itself",
      async () => {
        // The no-lockout guarantee. Exercised with a throwaway read_write
        // credential signing for itself, so the integrator's own key is never at
        // risk even if the guarantee regressed.
        const issued = await issueCredential({
          accessScope: "read_write",
          label: "sdk-test-self",
        });
        assertSuccessWithSchema(issued, "CreateCredentialResponse");
        const self = issued.data;
        const selfClient = createSdkClient({ privateKey: self.privateKey });

        // Relabelling itself is allowed — it cannot lock anyone out
        const relabel = await updateCredential(
          self.pubkey,
          { label: "sdk-test-self-renamed" },
          selfClient,
        );
        assertSuccessWithSchema(relabel, "CredentialSummaryResponse");
        expect(relabel.data.label).toBe("sdk-test-self-renamed");

        // Deactivating or downgrading itself is not
        for (const body of [{ active: false }, { accessScope: "read_only" }]) {
          const sdkResponse = await updateCredential(self.pubkey, body, selfClient);
          assertError(sdkResponse);
          expect(sdkResponse.response.status).toBe(400);
        }

        // ...nor is deleting itself
        const selfDelete = await deleteCredential(self.pubkey, selfClient);
        assertError(selfDelete);
        expect(selfDelete.response.status).toBe(400);

        // Still fully usable, at full scope, after every refused attempt
        const capabilities = await whoami(selfClient);
        assertSuccessWithSchema(capabilities, "CurrentIntegratorResponse");
        expect(capabilities.data.accessScope).toBe("read_write");
        expect(capabilities.data.capabilities.canWrite).toBe(true);
        console.log(
          "✅ Self-deactivation, self-downgrade and self-deletion all rejected",
        );
      },
      getTimeout("api"),
    );

    it(
      "should allow key rotation through a second read_write credential",
      async () => {
        // The flip side of no-lockout: a key it does not own *can* be revoked, so
        // rotation works — issue a successor, then retire the predecessor with it.
        const predecessorResponse = await issueCredential({
          accessScope: "read_write",
          label: "sdk-test-predecessor",
        });
        const successorResponse = await issueCredential({
          accessScope: "read_write",
          label: "sdk-test-successor",
        });
        assertSuccessWithSchema(predecessorResponse, "CreateCredentialResponse");
        assertSuccessWithSchema(successorResponse, "CreateCredentialResponse");

        const predecessor = predecessorResponse.data;
        const successor = successorResponse.data;
        const successorClient = createSdkClient({
          privateKey: successor.privateKey,
        });

        const retired = await deleteCredential(
          predecessor.pubkey,
          successorClient,
        );
        expect(retired.error).toBeUndefined();
        expect(retired.response.status).toBe(204);
        created.splice(created.indexOf(predecessor.pubkey), 1);

        // The retired key is dead...
        const oldKey = await whoami(
          createSdkClient({ privateKey: predecessor.privateKey }),
        );
        assertError(oldKey);
        expect(oldKey.response.status).toBe(401);

        // ...and the successor carries on with write access
        const newKey = await whoami(successorClient);
        assertSuccessWithSchema(newKey, "CurrentIntegratorResponse");
        expect(newKey.data.capabilities.canWrite).toBe(true);
        console.log("✅ Key rotation: successor revoked the predecessor");
      },
      getTimeout("api"),
    );

    it(
      "should revoke a credential, immediately and permanently",
      async () => {
        expect(readOnly).not.toBeNull();

        const sdkResponse = await deleteCredential(readOnly.pubkey);
        // 204 No Content — assert the status, there is no body to validate
        expect(sdkResponse.error).toBeUndefined();
        expect(sdkResponse.response.status).toBe(204);

        // The key stops authenticating right away...
        const afterDelete = await whoami(readOnlyClient);
        assertError(afterDelete);
        expect(afterDelete.response.status).toBe(401);

        // ...and the credential is gone, not just deactivated
        const again = await deleteCredential(readOnly.pubkey);
        assertError(again);
        expect(again.response.status).toBe(404);

        created.splice(created.indexOf(readOnly.pubkey), 1);
        console.log(`✅ Revoked credential ${readOnly.pubkey}`);
        readOnly = null;
        readOnlyClient = null;
      },
      getTimeout("api"),
    );

    it(
      "should 404 on a credential this integrator does not own",
      async () => {
        const patched = await updateCredential(UNKNOWN_PUBKEY, { label: "nope" });
        assertError(patched);
        expect(patched.response.status).toBe(404);

        const deleted = await deleteCredential(UNKNOWN_PUBKEY);
        assertError(deleted);
        expect(deleted.response.status).toBe(404);
      },
      getTimeout("api"),
    );
  });
});
