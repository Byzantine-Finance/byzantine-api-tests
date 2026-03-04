/**
 * API Endpoints Registry
 * Centralized endpoint paths for Byzantine API
 * API version: 0.2.0
 */

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
    top: "/v1/top-vaults",

    /**
     * Get vault APY
     * @param {string} vaultId - Vault address
     * @param {string} period - Optional: daily, weekly, monthly, yearly, all
     */
    getApy: (vaultId, period = null) => {
      const path = `/v1/apy/${vaultId}`;
      return period ? `${path}?period=${period}` : path;
    },

    /**
     * Get vault share price history
     * @param {string} vaultId - Vault address
     * @param {object} params - Query parameters (start_date, end_date, limit, offset, order)
     */
    getHistory: (vaultId, params = {}) => {
      const path = `/v1/history/${vaultId}`;
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
     * Get bank accounts for an account
     * @param {string} accountId - UUID
     * @param {string} currency - Optional: usd, eur, usdc, eurc
     */
    getBankAccounts: (accountId, currency = null) => {
      const path = `/v1/query/get-bank-accounts?account_id=${accountId}`;
      return currency ? `${path}&currency=${currency}` : path;
    },

    /**
     * Get account balances (positions and idle) for an account
     * @param {string} accountId - UUID
     * @param {object} params - Optional: chain_id (int32), include_test_vaults (boolean)
     */
    getAccountBalances: (accountId, params = {}) => {
      const queryParams = new URLSearchParams({ account_id: accountId });
      if (params.chain_id != null)
        queryParams.append("chain_id", params.chain_id);
      if (params.include_test_vaults != null)
        queryParams.append("include_test_vaults", params.include_test_vaults);
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
      `/v1/query/get-transaction?transaction_id=${transactionId}`,

    /**
     * Get all transactions for an account
     * @param {string} accountId - UUID
     */
    getByAccountId: (accountId) =>
      `/v1/query/get-transactions?account_id=${accountId}`,
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
     * Get approve payload to sign (passkey auth)
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getApprovePayloadPasskey: (chainId) =>
      `/v1/query/get-approve-payload-passkey?chain_id=${chainId}`,

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
     * Initiate approval and send OTP
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    initApprove: (chainId) => `/v1/query/init-approve-otp?chain_id=${chainId}`,

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
     * Get Bridge ToS acceptance link
     */
    getTosLink: "/v1/query/get-tos-acceptance-link",

    /**
     * Create a Byzantine user
     */
    user: "/v1/submit/create-user",

    /**
     * Create a Byzantine entity (business)
     */
    entity: "/v1/submit/create-entity",
  },

  // ============================================
  // Account Management
  // ============================================
  management: {
    /**
     * Add bank account for withdrawals
     */
    addBankAccount: "/v1/submit/add-bank-account",

    /**
     * Activate an account
     */
    activateAccount: "/v1/submit/activate-account",

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
      `/v1/query/get-invitations-by-account-id?account_id=${accountId}`,

    /**
     * Get invitations by email
     * @param {string} email - Email address
     */
    getByEmail: (email) =>
      `/v1/query/get-invitations-by-email?email=${encodeURIComponent(email)}`,
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
