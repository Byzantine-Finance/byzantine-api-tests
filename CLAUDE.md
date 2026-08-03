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

Each credential carries an `IntegratorAccessScope` (`read_write` / `read_only`); read-only credentials get 403 on every mutation route. `GET /v1/integrator/whoami` reports the signing credential's scope and `capabilities.canWrite`. To sign as a different credential, pass `privateKey` to `apiClient` (`makeRequest` options) or `createSdkClient({ privateKey })`.

### SDK method coverage
The bundled SDK `.tgz` lags the OpenAPI spec. When an endpoint has no named SDK method yet, SDK tests use the typed escape hatch `client.api.client.{GET,POST,PATCH,DELETE}(path, ...)` — the auth middleware still applies, but the path must be listed in `authenticatedPaths` in `utils/sdk-client.js`. Currently unwrapped: `/v1/query/events`, `/v1/integrator/*`.

### Schema validation
Schemas are auto-generated from the Byzantine OpenAPI spec (`scripts/generate-schemas-from-openapi.js`) into `fixtures/__generated__/generated-schemas.json`. Tests validate responses against these schemas using Ajv (`utils/schemas.js`, `utils/ajv.js`).

### Feature flags and conditional tests
Most test suites are gated by environment variables defined in `.env` (see `.env.example`). The `config/test.config.js` module exports `FEATURE_FLAGS`, `conditionalDescribe()`, and `conditionalIt()` to skip tests when their flag is disabled. Write tests are blocked in production. Some flags default to enabled (`!== "false"` check), others default to disabled (`=== "true"` check) — check the flag definition before changing.

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
