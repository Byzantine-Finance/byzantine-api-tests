/**
 * SDK Client Utility
 * Helper for initializing and using the Byzantine Integrator SDK
 */

import { ByzantineClient } from "@byzantine/integrator-sdk";
import dotenv from "dotenv";
import { getEnvironmentBaseURL, isProduction } from "../config/environments.js";

dotenv.config();

/**
 * Create a configured SDK client instance with automatic authentication
 * @param {object} options - Configuration options
 * @param {string} options.baseURL - Optional base URL override
 * @param {string} options.privateKey - Optional private key override
 * @returns {ByzantineClient} Configured SDK client with authentication middleware
 */
export function createSdkClient(options = {}) {
  const baseURL = options.baseURL || getEnvironmentBaseURL();
  const privateKey =
    options.privateKey ||
    (isProduction()
      ? process.env.PROD_INTEGRATOR_PRIVATE_KEY
      : process.env.DEV_INTEGRATOR_PRIVATE_KEY);

  if (!privateKey) {
    throw new Error(
      "Integrator private key is required. Set DEV_INTEGRATOR_PRIVATE_KEY or PROD_INTEGRATOR_PRIVATE_KEY in your .env file."
    );
  }

  const client = new ByzantineClient({
    integratorPrivateKey: privateKey,
    api: {
      baseUrl: baseURL,
    },
  });

  // Set up automatic authentication middleware for authenticated endpoints
  // The SDK requires manually setting auth headers, so we wrap the API methods
  // to automatically apply authentication for methods that need it
  setupAutoAuth(client, privateKey);

  return client;
}

/**
 * Set up automatic authentication for authenticated API methods
 * Uses middleware to dynamically generate auth headers for each request
 * @param {ByzantineClient} client - SDK client instance
 * @param {string} privateKey - Integrator private key
 */
function setupAutoAuth(client, privateKey) {
  // Set up middleware that automatically generates auth headers for authenticated endpoints
  client.api.client.use({
    async onRequest({ request }) {
      const url = new URL(request.url);
      const path = url.pathname;

      // List of paths that require authentication
      const authenticatedPaths = [
        "/v1/submit/create-user",
        "/v1/submit/create-entity",
        "/v1/submit/add-bank-account",
        "/v1/submit/send-transaction-otp",
        "/v1/submit/send-transaction-passkey",
      ];

      // Check if this path requires authentication
      const needsAuth = authenticatedPaths.some((authPath) =>
        path.includes(authPath)
      );

      if (needsAuth) {
        // Build path with query string for stamp generation
        const pathAndQuery = url.pathname + (url.search || "");
        const method = request.method;

        // Get request body if present
        // Note: openapi-fetch may have already serialized the body
        let body = "";
        if (request.body) {
          if (typeof request.body === "string") {
            body = request.body;
          } else if (
            request.body instanceof FormData ||
            request.body instanceof URLSearchParams
          ) {
            // For FormData/URLSearchParams, we can't easily stringify for signing
            // These endpoints use JSON, so this shouldn't happen
            body = "";
          } else {
            // Try to stringify the body
            try {
              body = JSON.stringify(request.body);
            } catch (e) {
              // If stringification fails, use empty string
              body = "";
            }
          }
        }

        // Generate stamp for this request
        const stamp = await client.apiKey.getStamp(method, pathAndQuery, body);

        // Set auth headers
        request.headers.set("X-Pubkey", stamp["X-Pubkey"]);
        request.headers.set("X-Timestamp", stamp["X-Timestamp"]);
        request.headers.set("X-Signature", stamp["X-Signature"]);
      }

      return request;
    },
  });
}

/**
 * Singleton instance for general use
 */
let sdkClientInstance;

/**
 * Get or create the singleton SDK client instance
 * @returns {ByzantineClient} SDK client instance
 */
export function getSdkClient() {
  if (!sdkClientInstance) {
    sdkClientInstance = createSdkClient();
  }
  return sdkClientInstance;
}

/**
 * Format SDK response to match API client response format
 * SDK uses openapi-fetch which returns { data, error, response }
 * We convert it to { status, ok, data?, error? } format
 *
 * @param {object} sdkResponse - Response from SDK method
 * @returns {object} Formatted response matching api-client format
 */
export function formatSdkResponse(sdkResponse) {
  if (sdkResponse.error) {
    return {
      status: sdkResponse.response?.status || 500,
      ok: false,
      data: undefined,
      error: sdkResponse.error,
      headers: sdkResponse.response?.headers || {},
    };
  }

  return {
    status: sdkResponse.response?.status || 200,
    ok: true,
    data: sdkResponse.data,
    error: undefined,
    headers: sdkResponse.response?.headers || {},
  };
}
