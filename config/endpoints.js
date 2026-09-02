/**
 * API Endpoints Registry
 * Centralized endpoint paths for Byzantine API
 * API version: 0.2.0
 */

/**
 * Append the shared offset-pagination params (limit/offset/order) to a path,
 * skipping any the caller left out so the server applies its own defaults.
 * Used by the integrator-wide `get-all-*` listings.
 *
 * @param {string} path - Base path, no query string
 * @param {object} params - Optional: limit, offset, order ("asc" | "desc")
 */
function buildPagedQuery(path, params = {}) {
  const queryParams = new URLSearchParams();
  for (const key of ["limit", "offset", "order"]) {
    if (params[key] != null) queryParams.append(key, params[key]);
  }
  const query = queryParams.toString();
  return query ? `${path}?${query}` : path;
}

export const endpoints = {
  // ============================================
  // API Health
  // ============================================
  health: "/v1/health",

  // ============================================
  // Vault Data
  // ============================================
  vaults: {
    /**
     * Get all Byzantine vaults
     */
    top: "/v1/query/top-vaults",

    /**
     * Get supported assets
     */
    assets: "/v1/query/assets",

    /**
     * Get vault APY
     * @param {string} vaultId - Vault address
     * @param {string} period - Optional: daily, weekly, monthly, yearly, all
     */
    getApy: (vaultId, period = null) => {
      const path = `/v1/query/apy/${vaultId}`;
      return period ? `${path}?period=${period}` : path;
    },

    /**
     * Get vault share price history
     * @param {string} vaultId - Vault address
     * @param {object} params - Query parameters (start_date, end_date, limit, offset, order)
     */
    getHistory: (vaultId, params = {}) => {
      const path = `/v1/query/history/${vaultId}`;
      const queryParams = new URLSearchParams();

      if (params.start_date)
        queryParams.append("start_date", params.start_date);
      if (params.end_date) queryParams.append("end_date", params.end_date);
      if (params.limit) queryParams.append("limit", params.limit);
      if (params.offset) queryParams.append("offset", params.offset);
      if (params.order) queryParams.append("order", params.order);

      const query = queryParams.toString();
      return query ? `${path}?${query}` : path;
    },
  },

  // ============================================
  // Account Data (Query)
  // ============================================
  accounts: {
    /**
     * Get user details by user ID
     * @param {string} userId - UUID
     */
    getUserDetails: (userId) => `/v1/query/get-user-details?userId=${userId}`,

    /**
     * Get entity details by entity ID
     * @param {string} entityId - UUID
     */
    getEntityDetails: (entityId) =>
      `/v1/query/get-entity-details?entityId=${entityId}`,

    /**
     * Get the full record of one associated person (beneficiary or
     * representative) of an entity — personal info, beneficiary details,
     * verification status and outstanding documents.
     * Returns GetAssociatedPersonResponse.
     * A person owned by another integrator 404s exactly like a missing one.
     * @param {string} beneficiaryId - UUID, as returned by get-entity-details
     *   and by the add/update associated person endpoints
     */
    getAssociatedPersonDetails: (beneficiaryId) =>
      `/v1/query/get-associated-person-details?beneficiaryId=${beneficiaryId}`,

    /**
     * Get bank accounts for an account
     * @param {string} accountId - UUID
     * @param {string} currency - Optional: usd, eur, usdc, eurc
     */
    getBankAccounts: (accountId, currency = null) => {
      const path = `/v1/query/get-bank-accounts?accountId=${accountId}`;
      return currency ? `${path}&currency=${currency}` : path;
    },

    /**
     * Get account details by account ID
     * @param {string} accountId - UUID
     */
    getAccountDetails: (accountId) =>
      `/v1/query/get-account-details?accountId=${accountId}`,

    /**
     * Get customers (business and/or individual)
     * @param {string} customerType - Optional: business, individual, all
     */
    getCustomers: (customerType = null) => {
      const path = "/v1/query/get-customers";
      return customerType ? `${path}?customerType=${customerType}` : path;
    },

    /**
     * Get account balances (positions and idle) for an account
     * @param {string} accountId - UUID
     * @param {object} params - Optional: chainId (int32), includeTestVaults (boolean)
     */
    getAccountBalances: (accountId, params = {}) => {
      const queryParams = new URLSearchParams({ accountId });
      if (params.chainId != null) queryParams.append("chainId", params.chainId);
      if (params.includeTestVaults != null)
        queryParams.append("includeTestVaults", params.includeTestVaults);
      return `/v1/query/get-account-balances?${queryParams.toString()}`;
    },
  },

  // ============================================
  // Transactions (Query)
  // ============================================
  transactions: {
    /**
     * Get a single transaction
     * @param {string} transactionId - UUID
     */
    getById: (transactionId) =>
      `/v1/query/get-transaction?transactionId=${transactionId}`,

    /**
     * Get all transactions for an account
     * @param {string} accountId - UUID
     */
    getByAccountId: (accountId) =>
      `/v1/query/get-transactions?accountId=${accountId}`,

    /**
     * Every transaction the integrator can see, across all accounts
     * (GetAllTransactionsResponse: { transactions, total, limit, offset }).
     * Offset-paginated — `limit` is clamped to 1..100 (default 20) and `order`
     * sorts on `updatedAt`, newest first by default.
     * @param {object} params - Optional: limit, offset, order ("asc" | "desc")
     */
    getAll: (params = {}) => buildPagedQuery("/v1/query/get-all-transactions", params),
  },

  // ============================================
  // Transactions with Passkey
  // ============================================
  passkey: {
    /**
     * Get payload to sign to activate an account
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getActivateAccountPayloadPasskey: (chainId) =>
      `/v1/query/get-activate-account-payload-passkey?chain_id=${chainId}`,

    /**
     * Get deposit payload to sign (passkey auth)
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getDepositPayloadPasskey: (chainId) =>
      `/v1/query/get-deposit-payload-passkey?chain_id=${chainId}`,

    /**
     * Get withdraw payload to sign (passkey auth)
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getWithdrawPayloadPasskey: (chainId) =>
      `/v1/query/get-withdraw-payload-passkey?chain_id=${chainId}`,

    /**
     * Get transfer payload to sign (passkey auth)
     * Body is a TransferRequestBody: { accountId, currency (CryptoCurrency:
     * usdc | eurc), amount, destinationAddress }
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getTransferPayloadPasskey: (chainId) =>
      `/v1/query/get-transfer-payload-passkey?chain_id=${chainId}`,

    /**
     * Get vault upgrade payload to sign (passkey auth)
     * Returns two raw payloads (withdraw from Base, deposit on Ethereum) to sign in one prompt
     */
    getVaultUpgradePayloadPasskey: "/v1/query/get-vault-upgrade-payload-passkey",

    /**
     * Get the payload to sign to cancel a queued withdrawal (passkey auth).
     * Body is a CancelWithdrawalRequestBody: { transactionId } — the id of the
     * withdrawal to cancel, i.e. the transactionId the withdraw payload returned.
     * Answers 400 when the transaction is unknown, on another chain, or no longer
     * cancellable (only a queued withdrawal can be cancelled).
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getCancelWithdrawalPayloadPasskey: (chainId) =>
      `/v1/query/get-cancel-withdrawal-payload-passkey?chain_id=${chainId}`,

    /**
     * Submit signed raw payload (passkey auth)
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    signPayloadPasskey: (chainId) =>
      `/v1/submit/sign-payload-passkey?chain_id=${chainId}`,
  },
  
  // ============================================
  // Transactions with OTP
  // ============================================
  otp: {
    /**
     * Initiate deposit and send OTP
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    initDeposit: (chainId) => `/v1/query/init-deposit-otp?chain_id=${chainId}`,

    /**
     * Initiate withdraw and send OTP
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    initWithdraw: (chainId) =>
      `/v1/query/init-withdraw-otp?chain_id=${chainId}`,

    /**
     * Submit transaction with OTP code
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    sendTransaction: (chainId) =>
      `/v1/submit/send-transaction-otp?chain_id=${chainId}`,
  },

  // ============================================
  // Account Creation
  // ============================================
  create: {
    /**
     * Create a Byzantine individual account (user)
     */
    user: "/v1/submit/create-individual-account",

    /**
     * Create a Byzantine entity account (business)
     */
    entity: "/v1/submit/create-entity-account",
  },

  // ============================================
  // Account Management
  // ============================================
  management: {
    /**
     * Update an individual account's user details
     * Only provided fields will be updated
     */
    updateIndividualAccount: "/v1/submit/update-individual-account",

    /**
     * Update an entity account's company details
     * Only provided fields will be updated
     */
    updateEntityAccount: "/v1/submit/update-entity-account",

    /**
     * Add an associated person to an entity account
     */
    addAssociatedPerson: "/v1/submit/add-associated-person",

    /**
     * Update an associated person's details
     */
    updateAssociatedPerson: "/v1/submit/update-associated-person",

    /**
     * Add bank account for withdrawals
     */
    addBankAccount: "/v1/submit/add-bank-account",

    /**
     * Get payload to invite users to account (request body to sign)
     * Returns bodyToSign (CreateUsersRequest) for passkey authentication
     */
    getInviteUsersPayload: "/v1/query/get-invite-users-payload-passkey",

    /**
     * Invite users to a Byzantine account (simple flow)
     * Sends invite email to users
     */
    inviteUsers: "/v1/submit/invite-users",
  },

  // ============================================
  // OTP Authentication
  // ============================================
  auth: {
    /**
     * Initialize OTP (email) for a user
     * Sends OTP code to user's email
     */
    initOtp: "/v1/submit/init-otp",

    /**
     * Authenticate with OTP code
     * Returns session ID that can be used for authenticated actions
     */
    authenticateOtp: "/v1/submit/otp-auth",

    /**
     * Create authenticators (passkeys) using OTP session
     */
    createAuthenticatorsOtp: "/v1/submit/create-authenticators-otp",
  },

  // ============================================
  // Invitations
  // ============================================
  invitations: {
    /**
     * Get invitations by account ID
     * @param {string} accountId - UUID
     */
    getByAccountId: (accountId) =>
      `/v1/query/get-invitations-by-account-id?accountId=${accountId}`,

    /**
     * Get invitations by email
     * @param {string} email - Email address
     */
    getByEmail: (email) =>
      `/v1/query/get-invitations-by-email?email=${encodeURIComponent(email)}`,

    /**
     * Every invitation the integrator has issued, across all accounts
     * (GetAllInvitationsResponse: { invitations, total, limit, offset }).
     * Offset-paginated — `limit` is clamped to 1..100 (default 20) and `order`
     * sorts on `updated_at`, newest first by default.
     * @param {object} params - Optional: limit, offset, order ("asc" | "desc")
     */
    getAll: (params = {}) => buildPagedQuery("/v1/query/get-all-invitations", params),
  },

  // ============================================
  // Webhooks
  // ============================================
  webhooks: {
    /**
     * Webhook subscriptions collection
     * POST to create a subscription (CreateWebhookSubscriptionRequest),
     * GET to list all subscriptions (ListWebhookSubscriptionsResponse)
     */
    subscriptions: "/v1/webhooks/subscriptions",

    /**
     * A single webhook subscription by ID
     * PATCH to update (UpdateWebhookSubscriptionRequest),
     * DELETE to remove
     * @param {string} subscriptionId - UUID
     */
    subscription: (subscriptionId) =>
      `/v1/webhooks/subscriptions/${subscriptionId}`,

    /**
     * Send a signed test webhook for a subscription
     * Returns TestWebhookDeliveryResponse
     * @param {string} subscriptionId - UUID
     */
    testSubscription: (subscriptionId) =>
      `/v1/webhooks/subscriptions/${subscriptionId}/test`,

    /**
     * Webhook delivery history
     * GET to list deliveries (ListWebhookDeliveriesResponse)
     */
    deliveries: "/v1/webhooks/deliveries",

    /**
     * Webhook delivery history, filtered/paginated.
     * The response is a page: { deliveries, limit, offset, hasMore, attemptsIncluded }.
     * `limit` defaults to 100 server-side and is capped at 250, so callers looking
     * for a specific delivery should filter rather than scan page one.
     * @param {object} params - Optional: limit, offset, includeAttempts,
     *   subscriptionId, eventId, eventType, status, sourceType, sourceId,
     *   accountId
     */
    deliveriesQuery: (params = {}) => {
      const allowed = [
        "limit",
        "offset",
        "includeAttempts",
        "subscriptionId",
        "eventId",
        "eventType",
        "status",
        "sourceType",
        "sourceId",
        "accountId",
      ];
      const queryParams = new URLSearchParams();
      for (const key of allowed) {
        if (params[key] != null) queryParams.append(key, params[key]);
      }
      const query = queryParams.toString();
      return query
        ? `/v1/webhooks/deliveries?${query}`
        : "/v1/webhooks/deliveries";
    },

    /**
     * Retry a webhook delivery
     * Returns TestWebhookDeliveryResponse
     * @param {string} deliveryId - UUID
     */
    retryDelivery: (deliveryId) =>
      `/v1/webhooks/deliveries/${deliveryId}/retry`,
  },

  // ============================================
  // Event history
  // Persisted lifecycle events owned by the integrator, newest first. Same
  // payload shape as an outbound webhook (WebhookLifecycleEventPayload) plus a
  // `createdAt` — so it works as a pull-based alternative to webhooks.
  // ============================================
  events: {
    /**
     * List persisted lifecycle events (ListEventsResponse: { events, nextCursor }).
     * Cursor-paginated — pass the previous page's `nextCursor` and keep filters
     * unchanged while paging.
     * @param {object} params - Optional: accountId, userId, transactionId,
     *   eventType, createdAfter, createdBefore, cursor, limit (1..250, default 100)
     */
    list: (params = {}) => {
      const allowed = [
        "accountId",
        "userId",
        "transactionId",
        "eventType",
        "createdAfter",
        "createdBefore",
        "cursor",
        "limit",
      ];
      const queryParams = new URLSearchParams();
      for (const key of allowed) {
        if (params[key] != null) queryParams.append(key, params[key]);
      }
      const query = queryParams.toString();
      return query ? `/v1/query/events?${query}` : "/v1/query/events";
    },
  },

  // ============================================
  // Integrator key management
  // Credentials are the (pubkey, accessScope) pairs that authenticate integrator
  // requests. A `read_only` credential may only call query routes; issuing,
  // editing and deleting credentials requires a `read_write` one.
  // ============================================
  integrator: {
    /**
     * Current credential's identity and capabilities (CurrentIntegratorResponse:
     * { integratorId, accessScope, label, capabilities: { canWrite } })
     */
    whoami: "/v1/integrator/whoami",

    /**
     * Credentials collection.
     * POST issues a new credential — body is a CreateCredentialPayload
     * ({ accessScope?, label? }), responds 201 with CreateCredentialResponse,
     * the only time `privateKey` is ever returned.
     * GET lists every credential owned by the authenticated integrator, oldest
     * first (ListCredentialsResponse: { credentials: CredentialSummaryResponse[] }).
     * Listing is a read: a read_only credential may call it, and private keys
     * never appear in it.
     */
    credentials: "/v1/integrator/credentials",

    /**
     * A single credential, addressed by its public key.
     * PATCH to update (UpdateCredentialPayload → CredentialSummaryResponse),
     * DELETE to remove (204). A credential can neither deactivate/demote nor
     * delete itself, so the integrator always keeps one working read-write key.
     * @param {string} pubkey - Compressed SEC1 public key, 0x-prefixed
     */
    credential: (pubkey) =>
      `/v1/integrator/credentials/${encodeURIComponent(pubkey)}`,
  },

  // ============================================
  // User Role Management
  // ============================================
  roles: {
    /**
     * Get payload to update users' roles (request body to sign)
     * Returns bodyToSign (UpdateRootQuorumRequest) for passkey authentication
     */
    getUpdateUsersRolePayload: "/v1/query/get-update-users-role-payload-passkey",

    /**
     * Update users' roles within a Byzantine account
     * Requires passkey signature
     */
    updateUsersRole: "/v1/submit/update-users-role",
  },

  // ============================================
  // Inbound provider webhooks (external receivers — no integrator auth)
  // These are the endpoints KYC/payment providers call to notify the API.
  // The API re-fetches the applicant's LIVE status, so the emitted
  // customer.*/transaction.* event reflects the real provider status, not the
  // payload body. Used in local testing to trigger lifecycle events.
  // ============================================
  providers: {
    /**
     * Sumsub inbound KYC webhook.
     * Signed with HMAC-SHA256(rawBody, SUMSUB_WEBHOOK_SECRET) in the
     * `x-payload-digest` header. Triggers a live applicant re-fetch which,
     * if the applicant is approved (GREEN), emits `customer.active`.
     */
    sumsubWebhook: "/v1/sumsub/webhook",

    /**
     * Bridge inbound webhook (analogous, for payment/customer events).
     */
    bridgeWebhook: "/v1/bridge/webhook",
  },
};

/**
 * Helper to get endpoint path (useful for logging/debugging)
 */
export function getEndpointInfo(endpoint) {
  return {
    path: typeof endpoint === "function" ? endpoint.toString() : endpoint,
    isDynamic: typeof endpoint === "function",
  };
}
