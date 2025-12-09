/**
 * API Configuration
 * Centralized settings for API client
 */

export const API_CONFIG = {
  // Timeouts (in milliseconds)
  defaultTimeout: 30000,

  // Default headers
  defaultHeaders: {
    "Content-Type": "application/json",
  },

  // Authentication header names
  authHeaders: {
    pubkey: "X-Pubkey",
    timestamp: "X-Timestamp",
    signature: "X-Signature",
  },
};
