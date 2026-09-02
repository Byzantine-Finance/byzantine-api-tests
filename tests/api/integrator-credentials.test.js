/**
 * Integrator Key Management API Tests, what are tested:
 * - GET    /v1/integrator/whoami                    (current credential + capabilities)
 * - GET    /v1/integrator/credentials               (list credentials, oldest first)
 * - POST   /v1/integrator/credentials               (issue a credential)
 * - PATCH  /v1/integrator/credentials/{pubkey}      (label / active / accessScope)
 * - DELETE /v1/integrator/credentials/{pubkey}      (revoke)
 *
 * whoami and the credential listing are read-only and run by default
 * (enableIntegratorTests).
 *
 * The credential lifecycle issues REAL credentials on the integrator account, so
 * it is opt-in (ENABLE_INTEGRATOR_CREDENTIAL_TESTS=true) and additionally gated
 * by enableWriteTests — which means it never runs against production. Every
 * credential it creates is deleted in afterAll.
 *
 * The credential signing a request is deliberately never deactivated, demoted or
 * deleted by these tests: the self-protection rules are exercised with a
 * throwaway read-write credential signing for itself, so an interrupted run can
 * never lock the integrator out of its own account.
 */

import { describe, it, expect, afterAll } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS, TEST_DATA } from "../../config/test.config.js";
import {
  assertSchema,
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertError,
  assertValidUuid,
  assertValidDateTime,
} from "../../utils/api-assertions.js";
import { derivePublicKey, getIntegratorPubkey } from "../../utils/auth.js";
import { isProduction } from "../../config/environments.js";
import { maybeUniqueEmail } from "../../utils/test-helpers.js";

import validUser from "../../fixtures/test-data/users/valid-user.json" assert { type: "json" };

// A syntactically valid compressed SEC1 key that belongs to no credential
const UNKNOWN_PUBKEY = `0x03${"a".repeat(64)}`;
// A well-formed UUID that should not correspond to any real record
const NONEXISTENT_ID = "00000000-0000-4000-8000-000000000000";
// A private key whose pubkey is not registered for any integrator
const UNREGISTERED_PRIVATE_KEY = `0x${"11".repeat(32)}`;

/**
 * The same full CreateIndividualAccountRequest the account-creation suite posts,
 * with owner/root emails uniquified the same way (see
 * tests/api/account-creation.test.js) so that if the scope check ever regressed,
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

const ACCESS_SCOPES = ["read_write", "read_only"];

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

describeIntegrator("Integrator Key Management API", () => {
  describe("GET /v1/integrator/whoami", () => {
    it(
      "should report the signing credential's identity and capabilities",
      async () => {
        const response = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
        });

        assertSuccessWithSchema(response, "CurrentIntegratorResponse");
        const { integratorId, accessScope, label, capabilities } = response.data;

        assertValidUuid(integratorId);
        expect(ACCESS_SCOPES).toContain(accessScope);
        // canWrite is derived from the scope — it is the flag a frontend gates UI on
        expect(capabilities.canWrite).toBe(accessScope === "read_write");
        // The label of the *signing* credential, so a dashboard can name the key a
        // request came in under. Optional, and null for an unlabelled credential.
        expect(label === null || label === undefined || typeof label === "string").toBe(
          true,
        );
        console.log(
          `✅ whoami: integrator ${integratorId}, scope ${accessScope}, label ${JSON.stringify(label ?? null)}, canWrite=${capabilities.canWrite}`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject a credential that is not registered",
      async () => {
        const response = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: UNREGISTERED_PRIVATE_KEY,
        });
        assertError(response, 401);
        expect(response.status).toBe(401);
      },
      getTimeout("api"),
    );

    it(
      "should require integrator authentication",
      async () => {
        const response = await apiClient.get(endpoints.integrator.whoami);
        // Missing X-Pubkey is a malformed request, not an auth failure
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/integrator/credentials", () => {
    it(
      "should list every credential the integrator owns, oldest first",
      async () => {
        const response = await apiClient.get(endpoints.integrator.credentials, {
          authenticated: true,
        });

        assertSuccessWithSchema(response, "ListCredentialsResponse");
        const { credentials } = response.data;
        expect(Array.isArray(credentials)).toBe(true);
        // The credential signing this request is itself a credential, so an empty
        // listing is impossible
        expect(credentials.length).toBeGreaterThan(0);

        const whoami = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
        });
        assertSuccessWithSchema(whoami, "CurrentIntegratorResponse");

        const createdAts = [];
        for (const credential of credentials) {
          assertSchema(credential, "CredentialSummaryResponse");
          // Scoped to the caller — another integrator's keys must never show up
          expect(credential.integratorId).toBe(whoami.data.integratorId);
          expect(credential.pubkey).toMatch(/^0x0[23][0-9a-f]{64}$/);
          expect(typeof credential.active).toBe("boolean");
          expect(ACCESS_SCOPES).toContain(credential.accessScope);
          assertValidDateTime(credential.createdAt);
          // Listing is a read: private keys exist only in the creation response
          expect(credential.privateKey).toBeUndefined();
          createdAts.push(Date.parse(credential.createdAt));
        }

        // "oldest first" is the documented order, and an unpaginated listing is
        // only usable if it holds
        expect(createdAts).toEqual([...createdAts].sort((a, b) => a - b));

        // The pubkey is the identity and the {pubkey} path segment — a duplicate
        // would make a credential unaddressable
        expect(new Set(credentials.map((c) => c.pubkey)).size).toBe(
          credentials.length,
        );

        // The signing credential appears in its own listing, active, and described
        // exactly as whoami describes it
        const signing = credentials.find((c) => c.pubkey === getIntegratorPubkey());
        expect(
          signing,
          "the signing credential should appear in its own listing",
        ).toBeDefined();
        expect(signing.active).toBe(true);
        expect(signing.accessScope).toBe(whoami.data.accessScope);
        expect(signing.label ?? null).toBe(whoami.data.label ?? null);

        console.log(
          `✅ Listed ${credentials.length} credential(s); signing key ${signing.pubkey} (${signing.accessScope}, created ${signing.createdAt})`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject a credential that is not registered",
      async () => {
        const response = await apiClient.get(endpoints.integrator.credentials, {
          authenticated: true,
          privateKey: UNREGISTERED_PRIVATE_KEY,
        });
        assertError(response, 401);
        expect(response.status).toBe(401);
      },
      getTimeout("api"),
    );

    it(
      "should require integrator authentication",
      async () => {
        const response = await apiClient.get(endpoints.integrator.credentials);
        // Missing X-Pubkey is a malformed request, not an auth failure
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );
  });

  describeCredentials("Credential lifecycle", () => {
    // Every pubkey created here, removed in afterAll
    const created = [];

    /** Issue a credential and register it for cleanup. */
    async function issueCredential(body) {
      const response = await apiClient.post(
        endpoints.integrator.credentials,
        body,
        { authenticated: true },
      );
      if (response.ok) created.push(response.data.pubkey);
      return response;
    }

    /** The integrator's credential listing, validated, as an array. */
    async function listCredentials(options = { authenticated: true }) {
      const response = await apiClient.get(
        endpoints.integrator.credentials,
        options,
      );
      assertSuccessWithSchema(response, "ListCredentialsResponse");
      return response.data.credentials;
    }

    afterAll(async () => {
      for (const pubkey of created) {
        try {
          await apiClient.delete(endpoints.integrator.credential(pubkey), {
            authenticated: true,
          });
        } catch {
          // ignore cleanup errors
        }
      }
    });

    // The read_only credential the first tests create and the rest reuse
    let readOnly = null;

    it(
      "should issue a read_only credential by default",
      async () => {
        const label = `integration-test-${Date.now()}`;
        const response = await issueCredential({ label });

        assertSuccessWithSchema(response, "CreateCredentialResponse", 201);
        expect(response.status).toBe(201);

        const credential = response.data;
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
        console.log(`✅ Issued read_only credential ${credential.pubkey}`);
      },
      getTimeout("api"),
    );

    it(
      "should issue a read_write credential when asked",
      async () => {
        const label = `integration-test-rw-${Date.now()}`;
        const response = await issueCredential({
          accessScope: "read_write",
          label,
        });

        assertSuccessWithSchema(response, "CreateCredentialResponse", 201);
        expect(response.status).toBe(201);
        expect(response.data.accessScope).toBe("read_write");
        expect(response.data.active).toBe(true);
        expect(response.data.label).toBe(label);
        expect(derivePublicKey(response.data.privateKey)).toBe(
          response.data.pubkey,
        );
      },
      getTimeout("api"),
    );

    it(
      "should show a newly issued credential in the listing",
      async () => {
        expect(readOnly).not.toBeNull();
        const issuedAt = Date.now();

        const credentials = await listCredentials();
        const listed = credentials.find((c) => c.pubkey === readOnly.pubkey);

        expect(
          listed,
          `credential ${readOnly.pubkey} should appear in the listing`,
        ).toBeDefined();
        expect(listed.integratorId).toBe(readOnly.integratorId);
        expect(listed.accessScope).toBe("read_only");
        expect(listed.active).toBe(true);
        expect(listed.label).toBe(readOnly.label);
        // createdAt is the only field the creation response does not return, so
        // this is where it gets checked: a real timestamp, from this test run.
        assertValidDateTime(listed.createdAt);
        const createdAt = Date.parse(listed.createdAt);
        // Generous window — the credential was issued a few tests ago, and server
        // and runner clocks are not the same clock
        expect(Math.abs(createdAt - issuedAt)).toBeLessThan(10 * 60 * 1000);
        // The listing never re-exposes the private key that creation returned
        expect(listed.privateKey).toBeUndefined();

        // The read_write credential issued right after it is there too, with its
        // own scope — the listing is a full inventory, not just the newest key
        const readWrite = credentials.filter(
          (c) => c.accessScope === "read_write" && c.active,
        );
        expect(readWrite.length).toBeGreaterThan(0);
        console.log(
          `✅ Issued credential listed with createdAt ${listed.createdAt}`,
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
          label: `integration-test-multi-a-${Date.now()}`,
        });
        const second = await issueCredential({
          accessScope: "read_write",
          label: `integration-test-multi-b-${Date.now()}`,
        });
        assertSuccessWithSchema(first, "CreateCredentialResponse", 201);
        assertSuccessWithSchema(second, "CreateCredentialResponse", 201);

        const keys = [
          { name: "read_only", credential: first.data, canWrite: false },
          { name: "read_write", credential: second.data, canWrite: true },
        ];

        // Same integrator, distinct pubkeys, each reporting its own scope
        expect(first.data.pubkey).not.toBe(second.data.pubkey);
        for (const { name, credential, canWrite } of keys) {
          const whoami = await apiClient.get(endpoints.integrator.whoami, {
            authenticated: true,
            privateKey: credential.privateKey,
          });
          assertSuccessWithSchema(whoami, "CurrentIntegratorResponse");
          expect(whoami.data.integratorId).toBe(credential.integratorId);
          expect(whoami.data.accessScope).toBe(name);
          expect(whoami.data.capabilities.canWrite).toBe(canWrite);
        }

        // Deactivating one leaves the other — and the env credential — untouched
        const deactivated = await apiClient.patch(
          endpoints.integrator.credential(first.data.pubkey),
          { active: false },
          { authenticated: true },
        );
        assertSuccessWithSchema(deactivated, "CredentialSummaryResponse");

        const blocked = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: first.data.privateKey,
        });
        assertError(blocked, 401);
        expect(blocked.status).toBe(401);

        const sibling = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: second.data.privateKey,
        });
        assertSuccessWithSchema(sibling, "CurrentIntegratorResponse");
        expect(sibling.data.accessScope).toBe("read_write");

        const envKey = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
        });
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
        const asReadOnly = {
          authenticated: true,
          privateKey: readOnly.privateKey,
        };

        const response = await apiClient.get(
          endpoints.integrator.whoami,
          asReadOnly,
        );

        assertSuccessWithSchema(response, "CurrentIntegratorResponse");
        expect(response.data.integratorId).toBe(readOnly.integratorId);
        expect(response.data.accessScope).toBe("read_only");
        expect(response.data.capabilities.canWrite).toBe(false);

        // One authenticated GET per domain the integrator can read: `read_only`
        // is a *write* restriction, so all of these must behave exactly as they
        // do for the read_write credential. `array: true` validates each item
        // instead of the envelope.
        const queries = [
          { name: "top-vaults", path: endpoints.vaults.top, schema: "TopVault", array: true },
          { name: "assets", path: endpoints.vaults.assets, schema: "get_assets_200" },
          { name: "get-customers", path: endpoints.accounts.getCustomers(), schema: "GetCustomersResponse" },
          { name: "events", path: endpoints.events.list({ limit: 1 }), schema: "ListEventsResponse" },
          // Integrator-wide listings: read-only must see the same collections
          {
            name: "get-all-invitations",
            path: endpoints.invitations.getAll({ limit: 1 }),
            schema: "GetAllInvitationsResponse",
          },
          {
            name: "get-all-transactions",
            path: endpoints.transactions.getAll({ limit: 1 }),
            schema: "GetAllTransactionsResponse",
          },
          { name: "webhook subscriptions", path: endpoints.webhooks.subscriptions, schema: "ListWebhookSubscriptionsResponse" },
          {
            name: "webhook deliveries",
            path: endpoints.webhooks.deliveriesQuery({ limit: 1, includeAttempts: false }),
            schema: "ListWebhookDeliveriesResponse",
          },
          // Listing credentials is a read, so read_only may do it — only issuing,
          // editing and revoking them need write access
          {
            name: "credentials",
            path: endpoints.integrator.credentials,
            schema: "ListCredentialsResponse",
          },
        ];

        // An account-scoped read too, when the suite has an account to point at —
        // collection listings alone wouldn't prove per-account reads work.
        const { testAccountId } = TEST_DATA.accounts;
        if (testAccountId) {
          queries.push({
            name: "get-account-details",
            path: endpoints.accounts.getAccountDetails(testAccountId),
            schema: "GetAccountDetailsResponse",
          });
        }

        for (const { name, path, schema, array } of queries) {
          const result = await apiClient.get(path, asReadOnly);

          // Fail with the endpoint name attached — a bare schema error here would
          // not say which of the reads regressed.
          expect(
            result.status,
            `${name} should be readable by a read_only credential, got ${result.status}: ${JSON.stringify(result.error)}`,
          ).toBe(200);

          if (array) {
            assertSuccessWithArraySchema(result, schema);
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
        const asReadOnly = { authenticated: true, privateKey: readOnly.privateKey };

        // Issuing credentials...
        const issue = await apiClient.post(
          endpoints.integrator.credentials,
          { label: "read-only-credential" },
          asReadOnly,
        );
        assertError(issue, 403);
        expect(issue.status).toBe(403);
        if (issue.ok) created.push(issue.data.pubkey); // surface rather than leak

        // ...editing them...
        const edit = await apiClient.patch(
          endpoints.integrator.credential(readOnly.pubkey),
          { label: "should-not-apply" },
          asReadOnly,
        );
        assertError(edit, 403);
        expect(edit.status).toBe(403);

        // ...and any other mutation route. The scope check runs before body
        // validation, so an intentionally invalid body still answers 403.
        const write = await apiClient.post(
          endpoints.create.user,
          { firstName: "scope-check" },
          asReadOnly,
        );
        assertError(write, 403);
        expect(write.status).toBe(403);

        // The same route with a genuinely valid CreateIndividualAccountRequest —
        // the one the account-creation suite uses to create real accounts. This is
        // the assertion that matters: the scope, not a malformed body, is what
        // blocks it, so no account is created.
        const validRequest = buildIndividualAccountRequest();
        assertSchema(validRequest, "CreateIndividualAccountRequest");

        const realWrite = await apiClient.post(
          endpoints.create.user,
          validRequest,
          { ...asReadOnly, timeout: getTimeout("integration") },
        );
        assertError(realWrite, 403);
        expect(realWrite.status).toBe(403);
        // A 201 here would mean a real account was created by a read-only key
        expect(realWrite.status).not.toBe(201);

        console.log(
          "✅ read_only credential rejected with 403 on all mutations, including a valid create-individual-account",
        );
      },
      getTimeout("api"),
    );

    it(
      "should fail closed for a read_only credential on every non-GET route",
      async () => {
        expect(readOnly).not.toBeNull();
        const asReadOnly = { authenticated: true, privateKey: readOnly.privateKey };

        // Enforcement lives in the auth middleware, not per-route, so the check is
        // that it fires across every family of mutation route. A real subscription
        // is created with the env credential first, so the webhook cases can't pass
        // for the wrong reason (404 before the scope check).
        const subscription = await apiClient.post(
          endpoints.webhooks.subscriptions,
          {
            url: `https://example.com/byzantine-webhook/scope-check-${Date.now()}`,
            enabled: true,
            eventTypes: ["customer.created"],
          },
          { authenticated: true },
        );
        assertSuccessWithSchema(subscription, "WebhookSubscriptionResponse", 201);
        const subscriptionId = subscription.data.subscription.id;

        try {
          const mutations = [
            // /v1/submit/*
            { name: "POST create-individual-account", call: () => apiClient.post(endpoints.create.user, { firstName: "x" }, asReadOnly) },
            { name: "PATCH update-individual-account", call: () => apiClient.patch(endpoints.management.updateIndividualAccount, { userId: NONEXISTENT_ID }, asReadOnly) },
            { name: "POST add-bank-account", call: () => apiClient.post(endpoints.management.addBankAccount, {}, asReadOnly) },
            { name: "POST invite-users", call: () => apiClient.post(endpoints.management.inviteUsers, {}, asReadOnly) },
            { name: "POST init-otp", call: () => apiClient.post(endpoints.auth.initOtp, {}, asReadOnly) },
            // Payload preparation — POST routes that live under /v1/query
            { name: "POST get-deposit-payload-passkey", call: () => apiClient.post(endpoints.passkey.getDepositPayloadPasskey(8453), {}, asReadOnly) },
            { name: "POST get-withdraw-payload-passkey", call: () => apiClient.post(endpoints.passkey.getWithdrawPayloadPasskey(8453), {}, asReadOnly) },
            { name: "POST get-cancel-withdrawal-payload-passkey", call: () => apiClient.post(endpoints.passkey.getCancelWithdrawalPayloadPasskey(8453), { transactionId: NONEXISTENT_ID }, asReadOnly) },
            { name: "POST get-invite-users-payload-passkey", call: () => apiClient.post(endpoints.management.getInviteUsersPayload, {}, asReadOnly) },
            // Webhook control
            { name: "POST webhook subscription", call: () => apiClient.post(endpoints.webhooks.subscriptions, { url: "https://example.com/nope", enabled: true, eventTypes: [] }, asReadOnly) },
            { name: "PATCH webhook subscription", call: () => apiClient.patch(endpoints.webhooks.subscription(subscriptionId), { enabled: false }, asReadOnly) },
            { name: "POST webhook subscription test", call: () => apiClient.post(endpoints.webhooks.testSubscription(subscriptionId), undefined, asReadOnly) },
            { name: "DELETE webhook subscription", call: () => apiClient.delete(endpoints.webhooks.subscription(subscriptionId), asReadOnly) },
            { name: "POST webhook delivery retry", call: () => apiClient.post(endpoints.webhooks.retryDelivery(NONEXISTENT_ID), undefined, asReadOnly) },
            // Key management
            { name: "POST credentials", call: () => apiClient.post(endpoints.integrator.credentials, { label: "nope" }, asReadOnly) },
            { name: "PATCH credentials", call: () => apiClient.patch(endpoints.integrator.credential(readOnly.pubkey), { label: "nope" }, asReadOnly) },
            { name: "DELETE credentials", call: () => apiClient.delete(endpoints.integrator.credential(readOnly.pubkey), asReadOnly) },
          ];

          for (const { name, call } of mutations) {
            const result = await call();
            expect(
              result.status,
              `${name} must be 403 for a read_only credential, got ${result.status}: ${JSON.stringify(result.error)}`,
            ).toBe(403);
          }

          // The subscription the read_only key tried to delete is still there
          const stillThere = await apiClient.get(
            endpoints.webhooks.subscriptions,
            { authenticated: true },
          );
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
          await apiClient.delete(endpoints.webhooks.subscription(subscriptionId), {
            authenticated: true,
          });
        }
      },
      getTimeout("integration"),
    );

    it(
      "should update a credential's label",
      async () => {
        expect(readOnly).not.toBeNull();

        const label = `integration-test-renamed-${Date.now()}`;
        const response = await apiClient.patch(
          endpoints.integrator.credential(readOnly.pubkey),
          { label },
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "CredentialSummaryResponse");
        expect(response.data.pubkey).toBe(readOnly.pubkey);
        expect(response.data.label).toBe(label);
        expect(response.data.accessScope).toBe("read_only");
        expect(response.data.active).toBe(true);
        // The summary never re-exposes the private key
        expect(response.data.privateKey).toBeUndefined();
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
          label: "integration-test-partial",
        });
        assertSuccessWithSchema(issued, "CreateCredentialResponse", 201);
        const { pubkey } = issued.data;

        // label only → scope and active survive
        const relabelled = await apiClient.patch(
          endpoints.integrator.credential(pubkey),
          { label: "integration-test-partial-renamed" },
          { authenticated: true },
        );
        assertSuccessWithSchema(relabelled, "CredentialSummaryResponse");
        expect(relabelled.data.label).toBe("integration-test-partial-renamed");
        expect(relabelled.data.accessScope).toBe("read_write");
        expect(relabelled.data.active).toBe(true);
        // createdAt is the credential's issuance time — an update is not a re-issue,
        // so every later response must repeat this exact value
        assertValidDateTime(relabelled.data.createdAt);
        const createdAt = relabelled.data.createdAt;

        // active only → label and scope survive
        const deactivated = await apiClient.patch(
          endpoints.integrator.credential(pubkey),
          { active: false },
          { authenticated: true },
        );
        assertSuccessWithSchema(deactivated, "CredentialSummaryResponse");
        expect(deactivated.data.active).toBe(false);
        expect(deactivated.data.label).toBe("integration-test-partial-renamed");
        expect(deactivated.data.accessScope).toBe("read_write");
        expect(deactivated.data.createdAt).toBe(createdAt);

        // accessScope (downgrade) → label survives, and the key loses write access
        const demoted = await apiClient.patch(
          endpoints.integrator.credential(pubkey),
          { accessScope: "read_only", active: true },
          { authenticated: true },
        );
        assertSuccessWithSchema(demoted, "CredentialSummaryResponse");
        expect(demoted.data.accessScope).toBe("read_only");
        expect(demoted.data.label).toBe("integration-test-partial-renamed");
        expect(demoted.data.createdAt).toBe(createdAt);

        const whoami = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: issued.data.privateKey,
        });
        assertSuccessWithSchema(whoami, "CurrentIntegratorResponse");
        expect(whoami.data.capabilities.canWrite).toBe(false);

        const write = await apiClient.post(
          endpoints.integrator.credentials,
          { label: "nope" },
          { authenticated: true, privateKey: issued.data.privateKey },
        );
        assertError(write, 403);
        expect(write.status).toBe(403);
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

        const response = await apiClient.patch(
          endpoints.integrator.credential(readOnly.pubkey),
          {},
          { authenticated: true },
        );
        // At least one of accessScope, active or label must be provided
        assertError(response, 400);
        expect(response.status).toBe(400);
      },
      getTimeout("api"),
    );

    it(
      "should stop authenticating once deactivated, and resume when re-activated",
      async () => {
        expect(readOnly).not.toBeNull();

        const deactivated = await apiClient.patch(
          endpoints.integrator.credential(readOnly.pubkey),
          { active: false },
          { authenticated: true },
        );
        assertSuccessWithSchema(deactivated, "CredentialSummaryResponse");
        expect(deactivated.data.active).toBe(false);

        const blocked = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: readOnly.privateKey,
        });
        assertError(blocked, 401);
        expect(blocked.status).toBe(401);

        // Deactivated is not deleted: the credential is still listed, as inactive
        const listedWhileOff = (await listCredentials()).find(
          (c) => c.pubkey === readOnly.pubkey,
        );
        expect(listedWhileOff).toBeDefined();
        expect(listedWhileOff.active).toBe(false);

        const reactivated = await apiClient.patch(
          endpoints.integrator.credential(readOnly.pubkey),
          { active: true },
          { authenticated: true },
        );
        assertSuccessWithSchema(reactivated, "CredentialSummaryResponse");
        expect(reactivated.data.active).toBe(true);

        const allowed = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: readOnly.privateKey,
        });
        assertSuccessWithSchema(allowed, "CurrentIntegratorResponse");
        console.log("✅ Deactivation takes effect immediately and is reversible");
      },
      getTimeout("api"),
    );

    it(
      "should grant write access when promoted to read_write",
      async () => {
        expect(readOnly).not.toBeNull();

        const promoted = await apiClient.patch(
          endpoints.integrator.credential(readOnly.pubkey),
          { accessScope: "read_write" },
          { authenticated: true },
        );
        assertSuccessWithSchema(promoted, "CredentialSummaryResponse");
        expect(promoted.data.accessScope).toBe("read_write");

        // whoami now reports the widened capability...
        const whoami = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: readOnly.privateKey,
        });
        assertSuccessWithSchema(whoami, "CurrentIntegratorResponse");
        expect(whoami.data.capabilities.canWrite).toBe(true);

        // ...and the mutation that was 403 before now succeeds
        const child = await apiClient.post(
          endpoints.integrator.credentials,
          { label: `integration-test-child-${Date.now()}` },
          { authenticated: true, privateKey: readOnly.privateKey },
        );
        assertSuccessWithSchema(child, "CreateCredentialResponse", 201);
        created.push(child.data.pubkey);
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
          label: "integration-test-self",
        });
        assertSuccessWithSchema(issued, "CreateCredentialResponse", 201);
        const self = issued.data;
        const asSelf = { authenticated: true, privateKey: self.privateKey };

        // Relabelling itself is allowed — it cannot lock anyone out
        const relabel = await apiClient.patch(
          endpoints.integrator.credential(self.pubkey),
          { label: "integration-test-self-renamed" },
          asSelf,
        );
        assertSuccessWithSchema(relabel, "CredentialSummaryResponse");
        expect(relabel.data.label).toBe("integration-test-self-renamed");

        // Deactivating or downgrading itself is not
        for (const body of [{ active: false }, { accessScope: "read_only" }]) {
          const response = await apiClient.patch(
            endpoints.integrator.credential(self.pubkey),
            body,
            asSelf,
          );
          assertError(response, 400);
          expect(response.status).toBe(400);
        }

        // ...nor is deleting itself
        const selfDelete = await apiClient.delete(
          endpoints.integrator.credential(self.pubkey),
          asSelf,
        );
        assertError(selfDelete, 400);
        expect(selfDelete.status).toBe(400);

        // Still fully usable, at full scope, after every refused attempt
        const whoami = await apiClient.get(endpoints.integrator.whoami, asSelf);
        assertSuccessWithSchema(whoami, "CurrentIntegratorResponse");
        expect(whoami.data.accessScope).toBe("read_write");
        expect(whoami.data.capabilities.canWrite).toBe(true);
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
          label: "integration-test-predecessor",
        });
        const successorResponse = await issueCredential({
          accessScope: "read_write",
          label: "integration-test-successor",
        });
        assertSuccessWithSchema(predecessorResponse, "CreateCredentialResponse", 201);
        assertSuccessWithSchema(successorResponse, "CreateCredentialResponse", 201);

        const predecessor = predecessorResponse.data;
        const successor = successorResponse.data;
        const asSuccessor = { authenticated: true, privateKey: successor.privateKey };

        const retired = await apiClient.delete(
          endpoints.integrator.credential(predecessor.pubkey),
          asSuccessor,
        );
        expect(retired.status).toBe(204);
        created.splice(created.indexOf(predecessor.pubkey), 1);

        // The retired key is dead...
        const oldKey = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: predecessor.privateKey,
        });
        assertError(oldKey, 401);
        expect(oldKey.status).toBe(401);

        // ...and the successor carries on with write access
        const newKey = await apiClient.get(endpoints.integrator.whoami, asSuccessor);
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

        const response = await apiClient.delete(
          endpoints.integrator.credential(readOnly.pubkey),
          { authenticated: true },
        );
        // 204 No Content
        expect(response.status).toBe(204);
        expect(response.ok).toBe(true);

        // The key stops authenticating right away...
        const afterDelete = await apiClient.get(endpoints.integrator.whoami, {
          authenticated: true,
          privateKey: readOnly.privateKey,
        });
        assertError(afterDelete, 401);
        expect(afterDelete.status).toBe(401);

        // ...and the credential is gone, not just deactivated
        const again = await apiClient.delete(
          endpoints.integrator.credential(readOnly.pubkey),
          { authenticated: true },
        );
        assertError(again, 404);
        expect(again.status).toBe(404);

        // Gone from the inventory too — a revoked credential leaves no inactive
        // row behind, which is what makes the listing safe to show as "your keys"
        const remaining = await listCredentials();
        expect(remaining.some((c) => c.pubkey === readOnly.pubkey)).toBe(false);

        created.splice(created.indexOf(readOnly.pubkey), 1);
        console.log(`✅ Revoked credential ${readOnly.pubkey}`);
        readOnly = null;
      },
      getTimeout("api"),
    );

    it(
      "should 404 on a credential this integrator does not own",
      async () => {
        const patched = await apiClient.patch(
          endpoints.integrator.credential(UNKNOWN_PUBKEY),
          { label: "nope" },
          { authenticated: true },
        );
        assertError(patched, 404);
        expect(patched.status).toBe(404);

        const deleted = await apiClient.delete(
          endpoints.integrator.credential(UNKNOWN_PUBKEY),
          { authenticated: true },
        );
        assertError(deleted, 404);
        expect(deleted.status).toBe(404);
      },
      getTimeout("api"),
    );
  });
});
