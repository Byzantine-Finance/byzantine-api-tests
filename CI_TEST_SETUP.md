# CI Test Setup — `npm run test:ci`

Quick checklist before running the full `scripts/ci-test.js` suite without skips.

## 1. One-time prerequisites

- `npm install`
- `npm run ci:one-time-setup` → approve KYC for the created account → paste the resulting `CI_PASSKEY_*` values into `.env`
- `npm run sync-schemas` (refresh `fixtures/__generated__/generated-schemas.json`)

## 2. `.env` — required values

**Auth + environment**
```
DEV_INTEGRATOR_PRIVATE_KEY=<P-256 key>
TEST_ENV=development
CHAIN=BASE
```

**Enable all phases**
```
ENABLE_WRITE_TESTS=true

# Phase 2 (passkey TX cycles)
ENABLE_PASSKEY_TESTS=true
ENABLE_PASSKEY_ACTIVATE_TX_TESTS=true
ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS=true
ENABLE_PASSKEY_DEPOSIT_TX_TESTS=true
ENABLE_PASSKEY_WITHDRAW_TX_TESTS=true

# Phase 3 (invite + OTP)
ENABLE_INVITE_OTP_FLOW=true
```

**Passkey signer (one required)**
```
CI_PASSKEY_CREDENTIAL_ID=
CI_PASSKEY_PRIVATE_KEY=
CI_PASSKEY_ACCOUNT_ID=
# or fallback:
# USE_VIRTUAL_AUTH=true
```

**KYC-approved target accounts**
```
# Phase 1 account-management (add-bank-account requires KYC/KYB-approved status).
# If unset, falls back to TEST_ACCOUNT_ID / generated testAccountId, which may not be approved.
TEST_BANK_ACCOUNT_TARGET_ID=

# Phase 2 init-passkey cycles (activate / deposit / withdraw)
TEST_INIT_ACTIVATE_TARGET_ACCOUNT_ID=
TEST_INIT_DEPOSIT_TARGET_ACCOUNT_ID=
TEST_INIT_WITHDRAW_TARGET_ACCOUNT_ID=

```

**OTP retrieval (one required for Phase 3 steps 5b–7)**
```
MAILSLURP_API_KEY=        # auto
# or
TEST_OTP_CODE=<code>      # manual
```

**Deposit / withdraw amounts + currencies (required — read only from `.env`)**
```
DEPOSIT_AMOUNT=1
SOURCE_CURRENCY=eur
WITHDRAW_AMOUNT=1.9
DESTINATION_CURRENCY=eur
```
Used by `init-passkey` and `init-otp` tests (both api and sdk suites). No fixture fallback — if these are unset the request body will fail schema validation, making the misconfiguration obvious.

**Optional**
```
DEBUG_MODE=true           # verbose request/response logs
```

## 3. Fixture files to verify

- `fixtures/test-data/users/invite-users-passkey-request.json` — each `newUsers` entry must have `firstName`, `lastName`, `userEmail` (the API rejects `userName`).
- `fixtures/__generated__/generated-schemas.json` — regenerate if API version changed.
- `fixtures/test-data/__generated__/generated-invited-user.json` — auto-created by Phase 3 step 3; no manual action.

## 4. Command

```bash
npm run test:ci          # runs tests/api/ (default)
npm run test:ci:sdk      # runs tests/sdk/
# or, inline:
TEST_SUITE=sdk node scripts/ci-test.js
```

`TEST_SUITE` (default `api`) swaps the test directory for all three phases. Orchestration, env vars, and stamp signing are identical between suites — only the test files differ. The active suite is printed in the run header.

---

## Test execution order

`ci-test.js` runs either `tests/api/` or `tests/sdk/` depending on `TEST_SUITE`. The phase breakdown below refers to the selected suite's files (e.g. `tests/${TEST_SUITE}/init-passkey.test.js`).

### Phase 1 — Core tests (single vitest run, `--fileParallelism=false`)

All `tests/${TEST_SUITE}/**/*.test.js` except `init-passkey`, `transaction-passkey`, `user-invitation`, `init-otp`, `entity-update-flow` (plus `validation/entity-account-validation` when `TEST_SUITE=api` — no validation subfolder under `tests/sdk/`).

Files run (vitest-internal order, each completes before the next):
- `health`, `account-creation`, `associated-persons`, `update-account`, `account-management`, `account-data`, `vault-data`, `transaction-data`, `transaction-otp`, `otp-authentication`, `role-management`, `init-vault-upgrade-passkey`, `validation/vault-upgrade-validation`

(Invitation queries now live inside `user-invitation.test.js` and run as part of Phase 3 Step 3, right after the invitation is sent — see below.)

### Phase 2 — Passkey cycles (strict order, each = init → sign → submit)

1. **Activate (Base, chain 8453)**
   - `init-passkey` -t `"Base, chain 8453"`
   - `generate-stamps-ci.js`
   - `transaction-passkey` -t `"ActivateAccount"`
2. **Activate (Ethereum, chain 1)**
   - `init-passkey` -t `"Ethereum, chain 1"`
   - `generate-stamps-ci.js`
   - `transaction-passkey` -t `"ActivateAccountETH"`
3. **Deposit**
   - `init-passkey` -t `"should get deposit payload"`
   - `generate-stamps-ci.js`
   - `transaction-passkey` -t `"Deposit"`
4. **⏳ 10s wait** (lets the deposit settle on-chain)
5. **Withdraw**
   - `init-passkey` -t `"should get withdraw payload"`
   - `generate-stamps-ci.js`
   - `transaction-passkey` -t `"Withdrawal"`

### Phase 3 — Invite + OTP flow

1. `user-invitation` -t `"should generate payload"`
2. `generate-stamps-ci.js` (sign invite)
3. `user-invitation` (full file with `INVITE_PAYLOAD=false`, `INVITE_USERS=true`) — runs the invite submission and then the `Invitation queries` describe (`getInvitationsByAccountId` + `getInvitationsByEmail`) against the freshly-created invitation.
4. `otp-authentication` -t `"should initialize OTP"`
5. Retrieve OTP (Mailslurp auto or `TEST_OTP_CODE`)
6. `otp-authentication` -t `"should authenticate"`
7. `otp-authentication` -t `"should create authenticators"`
8. `role-management` -t `"should generate payload"` (promote invited user)
9. `generate-stamps-ci.js` (sign role update)
10. `role-management` -t `"should update user role"`
