/**
 * API Response Schemas
 * Expected data structures from Byzantine API
 *
 * These schemas are used for contract validation, not mocking.
 * They define what we EXPECT from the API responses.
 */

/**
 * Schema definitions
 * Format: { fieldName: { type: 'string'|'number'|'boolean'|'object'|'array', required: boolean, nullable: boolean } }
 */

export const schemas = {
  /**
   * RESPONSE SCHEMAS
   */

  // ============================================
  // Health Check
  // ============================================
  health: {
    status: { type: "string", required: true },
  },

  // ============================================
  // Vault Schemas
  // ============================================
  topVault: {
    vault_address: { type: "string", required: true },
    chain_id: { type: "number", required: true },
    is_active: { type: "boolean", required: true },
  },

  vaultApy: {
    vault_id: { type: "string", required: true },
    daily_apy: { type: "number", required: false, nullable: true },
    weekly_apy: { type: "number", required: false, nullable: true },
    monthly_apy: { type: "number", required: false, nullable: true },
    yearly_apy: { type: "number", required: false, nullable: true },
    daily_period_days: { type: "number", required: false, nullable: true },
    weekly_period_days: { type: "number", required: false, nullable: true },
    monthly_period_days: { type: "number", required: false, nullable: true },
    yearly_period_days: { type: "number", required: false, nullable: true },
    latest_share_price: { type: "string", required: true },
    calculated_at: { type: "string", required: true },
  },

  vaultHistoryDataPoint: {
    timestamp: { type: "string", required: true },
    share_price: { type: "number", required: true },
    total_assets: { type: "number", required: true },
    hourly_apy: { type: "number", required: true },
  },

  vaultHistory: {
    vault_id: { type: "string", required: true },
    data: { type: "array", required: true },
    total_count: { type: "number", required: true },
  },

  // ============================================
  // Transaction Schemas
  // ============================================
  transaction: {
    transactionId: { type: "string", required: true },
    accountId: { type: "string", required: true },
    chainId: { type: "number", required: true },
    vaultAddr: { type: "string", required: true },
    type: { type: "string", required: true },
    status: { type: "string", required: true },
    createdAt: { type: "string", required: true },
    updatedAt: { type: "string", required: true },
    sourceCurrency: { type: "string", required: true },
    destinationCurrency: { type: "string", required: true },
    fiatAccountId: { type: "string", required: false, nullable: true },
    transactionHash: { type: "string", required: false, nullable: true },
    optId: { type: "string", required: false, nullable: true },
    broadcastedAt: { type: "string", required: false, nullable: true },
    fiatTransactionId: { type: "string", required: false, nullable: true },
    destinationAmount: { type: "string", required: false, nullable: true },
    sourceAmount: { type: "string", required: false, nullable: true },
  },

  // ============================================
  // Account Schemas
  // ============================================
  userInfo: {
    firstName: { type: "string", required: true },
    lastName: { type: "string", required: true },
    email: { type: "string", required: true },
    nationality: { type: "string", required: true },
    residentialAddress: { type: "object", required: true },
  },

  entityInfo: {
    companyName: { type: "string", required: true },
    email: { type: "string", required: true },
    website: { type: "string", required: true },
    companyNumber: { type: "string", required: true },
    registeredAddress: { type: "object", required: true },
    physicalAddress: { type: "object", required: true },
  },

  userDetails: {
    userId: { type: "string", required: true },
    verificationStatus: { type: "string", required: true },
    accountIds: { type: "array", required: false, nullable: true },
    userInfo: { type: "object", required: true },
    createdAt: { type: "string", required: true },
  },

  entityDetails: {
    entityId: { type: "string", required: true },
    verificationStatus: { type: "string", required: true },
    accountId: { type: "string", required: true },
    entityInfo: { type: "object", required: true },
    associatedPersons: { type: "array", required: true },
    createdAt: { type: "string", required: true },
  },

  // ============================================
  // Account Creation Response Schemas
  // ============================================
  createUserResponse: {
    userId: { type: "string", required: true },
    accountId: { type: "string", required: true },
    verificationStatus: { type: "string", required: true },
    userInfo: { type: "object", required: true },
    bridgeSignedAgreementId: { type: "string", required: true },
    byzantineTermsSignedAt: { type: "number", required: true },
    isPasskeyActivated: { type: "boolean", required: true },
    isOtpActivated: { type: "boolean", required: true },
    additionalUserInfo: { type: "object", required: false, nullable: true },
    verificationDocuments: { type: "array", required: false, nullable: true },
  },

  createEntityResponse: {
    entityId: { type: "string", required: true },
    accountId: { type: "string", required: true },
    verificationStatus: { type: "string", required: true },
    entityInfo: { type: "object", required: true },
    associatedPersons: { type: "array", required: true },
    bridgeSignedAgreementId: { type: "string", required: true },
    byzantineTermsSignedAt: { type: "number", required: true },
    entityDocuments: { type: "array", required: false, nullable: true },
  },

  // ============================================
  // Bank Account Schema
  // ============================================
  offRampAddress: {
    bank_account_id: { type: "string", required: true },
    accountId: { type: "string", required: true },
    name: { type: "string", required: true },
    liquidationAddress: { type: "string", required: true },
    createdAt: { type: "string", required: true },
    currency: { type: "string", required: true },
  },

  getBankAccountsResponse: {
    offRampAddresses: { type: "array", required: true },
  },

  // ============================================
  // Transaction Response Schemas
  // ============================================
  otpRequestResponse: {
    accountId: { type: "string", required: true },
    transactionType: { type: "string", required: true },
    vaultAddr: { type: "string", required: true },
    transaction_id: { type: "string", required: true },
    amount: { type: "string", required: false, nullable: true },
  },

  parameters: {
    signWith: {
      type: "string",
      required: true,
    },
    unsignedTransaction: {
      type: "string",
      required: true,
    },
    type: {
      type: "string",
      required: true,
    },
  },

  bodyToSign: {
    type: {
      type: "string",
      required: true,
    },
    timestampMs: {
      type: "string",
      required: true,
    },
    organizationId: {
      type: "string",
      required: true,
    },
    parameters: {
      type: "object",
      required: true,
    },
  },

  passkeyTxRequestResponse: {
    bodyToSign: {
      type: "object",
      required: true,
    },
    transactionId: { type: "string", required: true },
  },

  sendTransactionResponse: {
    transactionId: { type: "string", required: true },
    status: { type: "string", required: true },
    broadcastedAt: { type: "string", required: false, nullable: true },
    transactionReceipt: { type: "object", required: false, nullable: true },
    fiatDepositInstructions: {
      type: "object",
      required: false,
      nullable: true,
    },
  },

  // ============================================
  // Error Schema
  // ============================================
  error: {
    error: { type: "string", required: true },
    status: { type: "number", required: true },
  },

  // ============================================
  // ToS Link Schema
  // ============================================
  tosLink: {
    hostedUrl: { type: "string", required: true },
  },

  /**
   * REQUEST BODY SCHEMAS
   */

  // ============================================
  // Account Creation Requests
  // ============================================
  createUserRequest: {
    userInfo: { type: "object", required: true },
    bridgeSignedAgreementId: { type: "string", required: true },
    byzantineTermsSignedAt: { type: "number", required: true },
    additionalUserInfo: { type: "object", required: false, nullable: true },
    verificationDocuments: { type: "array", required: false, nullable: true },
    authenticators: { type: "array", required: false, nullable: true },
  },

  createEntityRequest: {
    entityInfo: { type: "object", required: true },
    associatedPersons: { type: "array", required: true },
    bridgeSignedAgreementId: { type: "string", required: true },
    byzantineTermsSignedAt: { type: "number", required: true },
    entityDocuments: { type: "array", required: false, nullable: true },
  },

  getTosLinkRequest: {
    redirectUri: { type: "string", required: false, nullable: true },
  },

  // ============================================
  // Transaction Requests
  // ============================================
  approveRequest: {
    accountId: { type: "string", required: true },
    vaultAddr: { type: "string", required: true },
  },

  depositRequest: {
    accountId: { type: "string", required: true },
    vaultAddr: { type: "string", required: true },
    amount: { type: "string", required: true },
    sourceCurrency: { type: "string", required: true },
  },

  withdrawRequest: {
    accountId: { type: "string", required: true },
    vaultAddr: { type: "string", required: true },
    amount: { type: "string", required: true },
    destinationCurrency: { type: "string", required: true },
    bankAccountId: { type: "string", required: false, nullable: true },
  },

  sendOtpTransactionRequest: {
    transactionId: { type: "string", required: true },
    otpCode: { type: "string", required: true },
  },

  signedBody: {
    type: { type: "string", required: true },
    timestampMs: { type: "string", required: true },
    organizationId: { type: "string", required: true },
    parameters: { type: "object", required: true },
  },

  sendPasskeyTransactionRequest: {
    signedBody: { type: "object", required: true },
    transactionId: { type: "string", required: true },
    webAuthnStamp: { type: "string", required: true },
  },

  // ============================================
  // Bank Account Request
  // ============================================
  addBankAccountRequest: {
    accountId: { type: "string", required: true },
    currency: { type: "string", required: true },
    label: { type: "string", required: true },
    achBankAccountDetails: { type: "object", required: false, nullable: true },
    ibanBankAccountDetails: { type: "object", required: false, nullable: true },
  },
};

/**
 * Validate that an object matches a schema
 * @param {object} obj - The object to validate
 * @param {string} schemaName - Name of the schema to validate against
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validateSchema(obj, schemaName) {
  const schema = schemas[schemaName];

  if (!schema) {
    return {
      valid: false,
      errors: [`Unknown schema: ${schemaName}`],
    };
  }

  const errors = [];

  // Check each field in the schema
  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    const value = obj[fieldName];
    const exists = fieldName in obj;

    // Check if required field is missing
    if (fieldDef.required && !exists) {
      errors.push(`Missing required field: ${fieldName}`);
      continue;
    }

    // Skip validation if field doesn't exist and isn't required
    if (!exists) {
      continue;
    }

    // Check if value is null when it shouldn't be
    if (value === null && !fieldDef.nullable) {
      errors.push(`Field ${fieldName} cannot be null`);
      continue;
    }

    // Skip type check if value is null and nullable
    if (value === null && fieldDef.nullable) {
      continue;
    }

    // Validate type
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== fieldDef.type) {
      errors.push(
        `Field ${fieldName} has wrong type: expected ${fieldDef.type}, got ${actualType}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an array of objects against a schema
 * @param {array} arr - Array of objects to validate
 * @param {string} schemaName - Name of the schema
 * @returns {object} - { valid: boolean, errors: object[] }
 */
export function validateArraySchema(arr, schemaName) {
  if (!Array.isArray(arr)) {
    return {
      valid: false,
      errors: [{ index: -1, message: "Expected an array" }],
    };
  }

  const allErrors = [];

  arr.forEach((item, index) => {
    const result = validateSchema(item, schemaName);
    if (!result.valid) {
      allErrors.push({
        index,
        errors: result.errors,
      });
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Get a list of all available schema names
 */
export function listSchemas() {
  return Object.keys(schemas);
}

/**
 * Get schema definition for a given schema name
 */
export function getSchema(schemaName) {
  return schemas[schemaName] || null;
}
