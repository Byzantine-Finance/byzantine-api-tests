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

  // Set up the auto authentication headers
  setupAutoAuth(client);

  // Set up debugging middleware if DEBUG_MODE flag is enabled
  setupDebugging(client);

  return client;
}

/**
 * Set up automatic authentication for authenticated API methods
 * Uses middleware to dynamically generate auth headers for each request
 * @param {ByzantineClient} client - SDK client instance
 */
function setupAutoAuth(client) {
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
        "/v1/query/get-activate-account-payload-passkey",
        "/v1/submit/sign-payload-passkey",
      ];

      // Check if this path requires authentication
      const needsAuth = authenticatedPaths.some((authPath) =>
        path.includes(authPath)
      );

      if (needsAuth) {
        // Extract method and path from the request
        const method = request.method;
        const pathAndQuery = url.pathname + url.search;

        // Get request body if present
        let body = "";
        if (request.body) {
          // Clone the request to read the body
          const clonedRequest = request.clone();
          body = await clonedRequest.text();
        }

        // Generate a fresh stamp for this request
        const stamp = await client.apiKey.getStamp(method, pathAndQuery, body);

        // Add auth headers
        request.headers.set("X-Pubkey", stamp["X-Pubkey"]);
        request.headers.set("X-Timestamp", stamp["X-Timestamp"]);
        request.headers.set("X-Signature", stamp["X-Signature"]);

        // Log auth headers if debugging is enabled
        if (process.env.DEBUG_MODE === "true") {
          console.log("🔑 Auth headers set:");
          console.log(`   X-Pubkey: ${stamp["X-Pubkey"]}`);
          console.log(`   X-Timestamp: ${stamp["X-Timestamp"]}`);
          console.log(`   X-Signature: ${stamp["X-Signature"]}`);
        }
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
 * Set up debugging middleware for SDK requests/responses
 * Logs requests and responses when DEBUG_MODE=true
 * @param {ByzantineClient} client - SDK client instance
 */
function setupDebugging(client) {
  if (process.env.DEBUG_MODE !== "true") {
    return; // Skip if debugging is not enabled
  }

  client.api.client.use({
    async onRequest({ request }) {
      const url = new URL(request.url);
      console.log(
        `→ SDK ${request.method?.toUpperCase()} ${url.origin}${url.pathname}${
          url.search
        }`
      );

      if (request.body) {
        try {
          const clonedRequest = request.clone();
          const body = await clonedRequest.text();
          if (body) {
            console.log("  Body:", body);
          }
        } catch (e) {
          console.log("  Body: [unable to read]");
        }
      }

      return request;
    },
    async onResponse({ response }) {
      const url = new URL(response.url);
      console.log(`← SDK ${response.status} ${url.pathname}${url.search}`);

      try {
        const clonedResponse = response.clone();
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await clonedResponse.json();
          console.log("  Response:", JSON.stringify(data, null, 2));
        } else {
          const text = await clonedResponse.text();
          if (text) {
            console.log("  Response:", text);
          }
        }
      } catch (e) {
        console.log("  Response: [unable to read]");
      }

      return response;
    },
  });
}

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
