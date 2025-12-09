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
     * Get approve transaction body to sign
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getApproveTransaction: (chainId) =>
      `/v1/query/get-approve-transaction-passkey?chain_id=${chainId}`,

    /**
     * Get deposit transaction body to sign
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getDepositTransaction: (chainId) =>
      `/v1/query/get-deposit-transaction-passkey?chain_id=${chainId}`,

    /**
     * Get withdraw transaction body to sign
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    getWithdrawTransaction: (chainId) =>
      `/v1/query/get-withdraw-transaction-passkey?chain_id=${chainId}`,

    /**
     * Submit a signed transaction (passkey auth)
     * @param {number} chainId - 1 for Ethereum, 8453 for Base
     */
    sendTransaction: (chainId) =>
      `/v1/submit/send-transaction-passkey?chain_id=${chainId}`,
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
