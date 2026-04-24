# CI Test Report — 2026-04-23 18:03

**Suite:** `api` | **Env:** `development` | **Status:** ✅ PASSED

## Summary


| Metric    | Count  |
| --------- | ------ |
| ✅ Passed  | 46     |
| ❌ Failed  | 0      |
| ⏭ Skipped | 32     |
| **Total** | **78** |


---

## Phase 1 — Core Tests

### account-creation


| Status | Test                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| ✅      | Byzantine Account Creation API > POST /v1/submit/create-individual-account > should create user with valid data       |
| ✅      | Byzantine Account Creation API > POST /v1/submit/create-entity-account > should create entity account with valid data |


### update-account


| Status | Test                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Update Individual Account API > PATCH /v1/submit/update-individual-account > should update individual account with valid data    |
| ✅      | Update Entity Account API > PATCH /v1/submit/update-entity-account > should update entity account with entity info and documents |


### associated-persons


| Status | Test                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Associated Persons API > Step 1 — POST /v1/submit/add-associated-person > should add all associated persons to entity account   |
| ✅      | Associated Persons API > Step 2 — PATCH /v1/submit/update-associated-person > should update the UBO associated person's details |


### core (catch-all)


| Status | Test                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Account Data API > GET /v1/query/get-user-details > should get user details by user ID                                                              |
| ✅      | Account Data API > GET /v1/query/get-entity-details > should get entity details by entity ID                                                        |
| ✅      | Account Data API > GET /v1/query/get-account-details > should get user account details by account ID                                                |
| ✅      | Account Data API > GET /v1/query/get-account-details > should get user account details by account ID                                                |
| ✅      | Account Data API > GET /v1/query/get-customers > should get all customers                                                                           |
| ✅      | Account Data API > GET /v1/query/get-customers > should filter customers by type: individual                                                        |
| ✅      | Account Data API > GET /v1/query/get-customers > should filter customers by type: business                                                          |
| ✅      | Account Data API > GET /v1/query/get-bank-accounts > should get bank accounts for an account                                                        |
| ✅      | Account Data API > GET /v1/query/get-bank-accounts > should filter bank accounts by currency                                                        |
| ✅      | Account Data API > GET /v1/query/get-account-balances > should get account balances by account ID                                                   |
| ✅      | Account Data API > GET /v1/query/get-account-balances > should get account balances with optional chain_id and include_test_vaults                  |
| ✅      | Account Management API > POST /v1/submit/add-bank-account > should add EUR IBAN bank account                                                        |
| ✅      | Health API - Direct HTTP > should return 200 status                                                                                                 |
| ✅      | Health API - Direct HTTP > should return valid health status with schema validation                                                                 |
| ✅      | Health API - Direct HTTP > should have status field                                                                                                 |
| ✅      | Transaction Data API > GET /v1/query/get-transactions > should get all transactions for an account by account ID                                    |
| ✅      | Transaction Data API > GET /v1/query/get-transaction > should get deposit transaction by transaction ID                                             |
| ✅      | Transaction Data API > GET /v1/query/get-transaction > should return 404 for non-existent transaction                                               |
| ✅      | Transaction Data API > GET /v1/query/get-transaction > should get withdrawal transaction by transaction ID                                          |
| ✅      | Vaults API > GET /v1/top-vaults > should return list of vaults                                                                                      |
| ✅      | Vaults API > GET /v1/top-vaults > should return vaults matching schema                                                                              |
| ✅      | Vaults API > GET /v1/top-vaults > should have valid vault addresses                                                                                 |
| ✅      | Vaults API > GET /v1/apy/{vault_id} > should return APY for specific vault                                                                          |
| ✅      | Vaults API > GET /v1/apy/{vault_id} > should return APY for specific period                                                                         |
| ⏭      | Initiate Passkey vault upgrade API > POST /v1/query/get-vault-upgrade-payload-passkey > should get vault upgrade payload to sign (Base -> Ethereum) |
| ⏭      | OTP Authentication API > POST /v1/submit/init-otp > should initialize OTP for the invited user and send email                                       |
| ⏭      | OTP Authentication API > POST /v1/submit/otp-auth > should authenticate with valid OTP code and return session                                      |
| ⏭      | OTP Authentication API > POST /v1/submit/create-authenticators-otp > should create virtual authenticator for the invited user                       |
| ⏭      | Byzantine Role Management API > POST /v1/query/get-update-users-role-payload-passkey > should generate payload for promoting a user to root role    |
| ⏭      | Byzantine Role Management API > POST /v1/submit/update-users-role > should update user role with passkey authentication                             |
| ⏭      | Send OTP Transactions API > POST /v1/submit/send-transaction-otp > should reject invalid OTP code                                                   |


## Phase 2 — Passkey Cycles

### Activate (Base, chain 8453) — init


| Status | Test                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Base, chain 8453)  |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Ethereum, chain 1) |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-deposit-payload-passkey > should get deposit payload to sign                                       |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-withdraw-payload-passkey > should get withdraw payload to sign                                     |


### Activate (Base, chain 8453) — submit


| Status | Test                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Send Passkey Transactions API > POST /v1/submit/sign-payload-passkey > should sign 'ActivateAccount' payload with Passkey |


### Activate (Ethereum, chain 1) — init


| Status | Test                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Ethereum, chain 1) |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Base, chain 8453)  |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-deposit-payload-passkey > should get deposit payload to sign                                       |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-withdraw-payload-passkey > should get withdraw payload to sign                                     |


### Activate (Ethereum, chain 1) — submit


| Status | Test                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Send Passkey Transactions API > POST /v1/submit/sign-payload-passkey > should sign 'ActivateAccountETH' payload with Passkey |


### Deposit — init


| Status | Test                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Initiate Passkey transactions API > POST /v1/query/get-deposit-payload-passkey > should get deposit payload to sign                                       |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Base, chain 8453)  |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Ethereum, chain 1) |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-withdraw-payload-passkey > should get withdraw payload to sign                                     |


### Deposit — submit


| Status | Test                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| ✅      | Send Passkey Transactions API > POST /v1/submit/sign-payload-passkey > should sign 'Deposit' payload with Passkey |


### Withdraw — init


| Status | Test                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Initiate Passkey transactions API > POST /v1/query/get-withdraw-payload-passkey > should get withdraw payload to sign                                     |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Base, chain 8453)  |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-activate-account-payload-passkey > should get activate account payload to sign (Ethereum, chain 1) |
| ⏭      | Initiate Passkey transactions API > POST /v1/query/get-deposit-payload-passkey > should get deposit payload to sign                                       |


### Withdraw — submit


| Status | Test                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| ✅      | Send Passkey Transactions API > POST /v1/submit/sign-payload-passkey > should sign 'Withdrawal' payload with Passkey |


## Phase 3 — Invite + OTP

### user-invitation — get payload


| Status | Test                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Byzantine User Invitation API > POST /v1/query/get-invite-users-payload-passkey > should generate payload for multiple users and save it      |
| ⏭      | Byzantine User Invitation API > POST /v1/submit/invite-users > should invite multiple users at once with passkey authentication               |
| ⏭      | Byzantine User Invitation API > Invitation queries > GET /v1/query/get-invitations-by-account-id > should get invitations for entity account  |
| ⏭      | Byzantine User Invitation API > Invitation queries > GET /v1/query/get-invitations-by-email > should get all invitations for an email address |


### user-invitation — submit + queries


| Status | Test                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅      | Byzantine User Invitation API > POST /v1/submit/invite-users > should invite multiple users at once with passkey authentication               |
| ✅      | Byzantine User Invitation API > Invitation queries > GET /v1/query/get-invitations-by-account-id > should get invitations for entity account  |
| ✅      | Byzantine User Invitation API > Invitation queries > GET /v1/query/get-invitations-by-email > should get all invitations for an email address |
| ⏭      | Byzantine User Invitation API > POST /v1/query/get-invite-users-payload-passkey > should generate payload for multiple users and save it      |


### otp-authentication — init


| Status | Test                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| ✅      | OTP Authentication API > POST /v1/submit/init-otp > should initialize OTP for the invited user and send email                 |
| ⏭      | OTP Authentication API > POST /v1/submit/otp-auth > should authenticate with valid OTP code and return session                |
| ⏭      | OTP Authentication API > POST /v1/submit/create-authenticators-otp > should create virtual authenticator for the invited user |


### otp-authentication — authenticate


| Status | Test                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| ✅      | OTP Authentication API > POST /v1/submit/otp-auth > should authenticate with valid OTP code and return session                |
| ⏭      | OTP Authentication API > POST /v1/submit/init-otp > should initialize OTP for the invited user and send email                 |
| ⏭      | OTP Authentication API > POST /v1/submit/create-authenticators-otp > should create virtual authenticator for the invited user |


### otp-authentication — create authenticators


| Status | Test                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| ⏭      | OTP Authentication API > POST /v1/submit/init-otp > should initialize OTP for the invited user and send email                 |
| ⏭      | OTP Authentication API > POST /v1/submit/otp-auth > should authenticate with valid OTP code and return session                |
| ⏭      | OTP Authentication API > POST /v1/submit/create-authenticators-otp > should create virtual authenticator for the invited user |


### role-management — get payload


| Status | Test                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅      | Byzantine Role Management API > POST /v1/query/get-update-users-role-payload-passkey > should generate payload for promoting a user to root role |
| ⏭      | Byzantine Role Management API > POST /v1/submit/update-users-role > should update user role with passkey authentication                          |


### role-management — submit


| Status | Test                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅      | Byzantine Role Management API > POST /v1/submit/update-users-role > should update user role with passkey authentication                          |
| ⏭      | Byzantine Role Management API > POST /v1/query/get-update-users-role-payload-passkey > should generate payload for promoting a user to root role |


---

*Generated by `scripts/ci-test.js` · 2026-04-23 at 18:03 · Suite: `api`*