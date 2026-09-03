# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Integration test suite for the Byzantine Integrator SDK and API. Tests run against the Byzantine DeFi platform (dev or production) using two parallel approaches: direct HTTP API calls (via Axios) and SDK method calls (via `@byzantine/integrator-sdk`).

## Commands

### Run all tests
```bash
npm test                    # vitest run
```

### Run a single test file
```bash
npx vitest run tests/api/health.test.js
npx vitest run tests/sdk/account-creation.test.js
```

### Named test scripts (see package.json for full list)
```bash
npm run test:api:health     # API health check
npm run test:api:create     # API account creation
npm run test:sdk:health     # SDK health check
npm run test:sdk:create     # SDK account creation
```

### Schema management
```bash
npm run generate-schemas    # Fetch OpenAPI spec and generate JSON schemas
npm run validate-schemas    # Validate generated schemas compile correctly
npm run sync-schemas        # Generate + validate in sequence
```

### Watch mode
```bash
npm run test:watch
```

## Architecture

### Two parallel test suites
- **`tests/api/`** — Direct HTTP tests using Axios (`utils/api-client.js`). Response shape: `{ status, ok, data, error, headers }`.
- **`tests/sdk/`** — SDK tests using `@byzantine/integrator-sdk` (`utils/sdk-client.js`). Response shape: `{ data, error, response }`.

Each suite has its own assertion helpers (`utils/api-assertions.js`, `utils/sdk-assertions.js`) tailored to the respective response format.

### Authentication
All authenticated requests use ECDSA P-256 signatures (`utils/auth.js`). The API client injects `X-Pubkey`, `X-Timestamp`, and `X-Signature` headers. The SDK client uses middleware to do the same automatically. Private keys are loaded from `.env` (`DEV_INTEGRATOR_PRIVATE_KEY` / `PROD_INTEGRATOR_PRIVATE_KEY`).

Each credential carries an `IntegratorAccessScope` (`read_write` / `read_only`); read-only credentials get 403 on every mutation route. `GET /v1/integrator/whoami` reports the signing credential's scope, `label` and `capabilities.canWrite`; `GET /v1/integrator/credentials` lists every credential the integrator owns (oldest first, private keys never included) and is readable by a read-only credential. To sign as a different credential, pass `privateKey` to `apiClient` (`makeRequest` options) or `createSdkClient({ privateKey })`. `getIntegratorPubkey()` in `utils/auth.js` returns the pubkey the clients sign with by default.

### SDK method coverage
The bundled SDK `.tgz` is **1.14.0**, and it now wraps every endpoint this suite touches — there are no unwrapped endpoints left, and **no SDK test uses the typed escape hatch** (`client.api.client.{GET,POST,PATCH,DELETE}(path, ...)`) any more. Keep it that way: an escape-hatch call exercises `openapi-fetch` and the auth middleware but *not* the named method a customer calls, so the method could have the wrong path, mis-serialize a param, or map its arguments backwards and the suite would stay green. `tests/api/` already covers the raw HTTP contract.

If a future endpoint does land before the SDK wraps it, the escape hatch is still available — the auth middleware applies, but the path must be listed in `authenticatedPaths` in `utils/sdk-client.js`. That list is needed for named methods too: the middleware gates on URL, and every named method goes through the same client. It is *not* escape-hatch-only, so don't prune it.

**Argument order is inconsistent across the SDK** — check the signature before calling. Auth first: `listEvents(auth, query)`, `getAllInvitations(auth, query)`, `listCredentials(auth)`, `getCurrentIntegrator(auth)`, `getAllTransactions(auth, query)`. Auth last: `getAssociatedPersonDetails(beneficiaryId, auth)`, `getInvitationsByAccountId(accountId, auth)`, `createCredential(body, auth)`, `updateCredential(pubkey, body, auth)`, `deleteCredential(pubkey, auth)`, `getCancelWithdrawalPayloadPasskey(chainId, body, auth)`. Getting it wrong surfaces as a confusing 400, not a type error — these tests are plain JS.

1.13.0 added `listEvents`, the `/v1/integrator/*` credential methods, the webhook routes and `getAllTransactions`; 1.14.0 added the last three — `getAllInvitations`, `getCancelWithdrawalPayloadPasskey` and `getAssociatedPersonDetails`. All SDK tests were migrated onto the named methods on 2026-09-02. 1.13.0 also dropped the old snake_case query params, so the query methods that used to 400 (`getTransactions`, `getTransaction`, `getBankAccounts`, `getAccountBalances`, `getInvitationsByAccountId`) now work. Note the passkey payload methods still take a `chainId` argument and map it to the `chain_id` query param internally.

### Lifecycle events and webhooks
`GET /v1/query/events` (pull) and outbound webhook deliveries (push) carry the same public envelope, `WebhookLifecycleEventPayload` — the events endpoint just adds `createdAt` on top (`EventHistoryItem`). Envelope shape:

- **`type`** — the event name, e.g. `customer.active`. *Not* `eventType`; the `WebhookEvent` record that wraps a delivery does still call the same value `eventType`, so `delivery.event.eventType === delivery.event.payload.type`.
- **`related`** — nested routing block (`accountId`, `userId`, `entityId`, `beneficiaryId`, `transactionId`), only the ids relevant to the event are set, the rest are `null`. The `/v1/query/events` **filters are still flat** (`?accountId=…`), so a test reads `event.related.accountId` but sends `accountId`.
- **`data`** — the typed resource. Every `customer.*` event carries a `CustomerEventData`: `customer` (always), `beneficiary` (UBO-scoped events, else `null`), `reasonCodes` (`resubmission_requested` / `rejected`, else `null`).

Event names are `domain.action` on the wire. **The OpenAPI spec is wrong about this**: it emits `WebhookEventType` as the API's internal Rust variant names (`CustomerCreated`, `WebhookTest`), while every response, subscription and delivery actually uses `customer.created` / `webhook.test`, and subscribing with the PascalCase form is a 400. There is **no workaround in this repo** — a normalization in `utils/schemas.js` was removed on 2026-09-02 on the understanding the API team ships the spec fix shortly. Until it lands, every schema that `$ref`s `WebhookEventType` (`WebhookLifecycleEventPayload`, `EventHistoryItem`) rejects valid responses, so ~12 tests in the events and webhook suites are expected to fail. They go green when the fixed spec is regenerated — no test changes needed. Don't re-add a local workaround; chase the spec fix.

Subscribable event types = every `WebhookEventType` **except `webhook.test`** (manual delivery probe only, rejected on subscribe with "Unsupported webhook event type"; an unknown name gives "Unknown webhook event type"). `customer.deleted` used to be rejected on subscribe and no longer is. `POST`/`PATCH` with `eventTypes: []` expands to that full subscribable set; omitting `eventTypes` on `PATCH` leaves the set untouched. Deleting a subscription cascades its deliveries away, so the delivery-retry test tolerates a 404 on a delivery that vanished mid-run.

### Integrator-wide paginated listings
`GET /v1/query/get-all-invitations` and `GET /v1/query/get-all-transactions` list everything the integrator owns across all accounts, and share one offset-pagination contract: `limit` (default 20, **clamped** into 1..100), `offset` (negatives clamped to 0, past-the-end returns an empty page with `total` unchanged), and `order` (`asc`/`desc` over `updatedAt`/`updated_at`, newest first by default). Note the contrast with `GET /v1/query/events`, which *rejects* an out-of-range `limit` with 400 rather than clamping. Malformed values (`order=sideways`, `limit=abc`) are 400s from query-string deserialization in all three. Build the query with the `getAll()` builders in `config/endpoints.js`.

### Schema validation
Schemas are auto-generated from the Byzantine OpenAPI spec (`scripts/generate-schemas-from-openapi.js`) into `fixtures/__generated__/generated-schemas.json`. Tests validate responses against these schemas using Ajv (`utils/schemas.js`, `utils/ajv.js`).

Names that moved recently, worth knowing when a test says "schema not found": transaction `status` is a **`TransactionStatusView`** (renamed from `TransactionStatus`, and it dropped the internal-only `created` / `claimed` states the API never returns). `getSchema()` returns `null` for an unknown name and the tests that source enums from it use `?? []`, so a rename shows up as an empty allow-set and a bare `expected false to be true`, not as a missing-schema error.

### Feature flags and conditional tests
Most test suites are gated by environment variables defined in `.env` (see `.env.example`). The `config/test.config.js` module exports `FEATURE_FLAGS`, `conditionalDescribe()`, and `conditionalIt()` to skip tests when their flag is disabled. Write tests are blocked in production. `ENABLE_WRITE_TESTS` now **defaults to enabled** outside production (`!== "false"`), so a plain `npm test` on dev runs the mutating suites whose own inner flags are also default-on — account creation, account management, update-account, user invitation and the webhook subscription lifecycle. Set `ENABLE_WRITE_TESTS=false` for a read-only run. `ENABLE_PASSKEY_TESTS` also **defaults to enabled** (`!== "false"`), but it is only the parent gate for the passkey suites — every individual cycle (`ENABLE_PASSKEY_INIT_*_TESTS`, `ENABLE_PASSKEY_*_TX_TESTS`) is still opt-in, so on its own it runs no passkey test. Some flags default to enabled (`!== "false"` check), others default to disabled (`=== "true"` check) — check the flag definition before changing.

### Test data persistence
Account creation tests save generated IDs (user, account, entity) to `fixtures/test-data/__generated__/generated-accounts.json` via `utils/test-data-persistence.js`. Subsequent tests load these IDs so they don't need to recreate accounts each run. In production mode, IDs come from environment variables instead.

### Configuration hierarchy
- **`config/environments.js`** — Dev/prod URL selection, environment detection
- **`config/test.config.js`** — Timeouts, feature flags, test data, vault selection
- **`config/api-config.js`** — Axios client defaults (timeouts, headers)
- **`config/endpoints.js`** — Centralized API endpoint registry with path builder functions

### Timeouts
Vitest test timeouts scale by type: default(10s), api(15s), integration(30s), e2e(60s), passkey(90s). CI environments get a 2x multiplier. Use `getTimeout("api")` from `config/test.config.js`.

## Key Conventions

- ES Modules throughout (`"type": "module"` in package.json)
- Endpoint paths are defined in `config/endpoints.js` — add new endpoints there, not inline in tests
- Test data fixtures live in `fixtures/test-data/`; generated/runtime data goes in `fixtures/test-data/__generated__/`
- The `@byzantine/integrator-sdk` dependency is loaded from a local `.tgz` file, not from npm
