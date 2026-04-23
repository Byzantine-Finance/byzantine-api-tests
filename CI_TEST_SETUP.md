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

**KYC-approved target accounts (for init-passkey)**
```
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
npm run test:ci
```

---

## Test execution order

`ci-test.js` only runs `tests/api/` files. SDK tests are NOT invoked.

### Phase 1 — Core API tests (single vitest run, `--fileParallelism=false`)

All `tests/api/**/*.test.js` except `init-passkey`, `transaction-passkey`, `user-invitation`, `entity-account-validation`, `init-otp`, `entity-update-flow`.

Files run (vitest-internal order, each completes before the next):
- `health`, `account-creation`, `associated-persons`, `update-account`, `account-management`, `account-data`, `vault-data`, `transaction-data`, `transaction-otp`, `otp-authentication`, `role-management`, `invitation-queries`, `init-vault-upgrade-passkey`, `validation/vault-upgrade-validation`

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
3. `user-invitation` -t `"should invite"`
4. `otp-authentication` -t `"should initialize OTP"`
5. Retrieve OTP (Mailslurp auto or `TEST_OTP_CODE`)
6. `otp-authentication` -t `"should authenticate"`
7. `otp-authentication` -t `"should create authenticators"`
8. `role-management` -t `"should generate payload"` (promote invited user)
9. `generate-stamps-ci.js` (sign role update)
10. `role-management` -t `"should update user role"`
