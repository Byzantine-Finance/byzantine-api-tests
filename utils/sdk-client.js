/**
 * SDK Client Utility
 * Helper for initializing and using the Byzantine Integrator SDK
 */

import { ByzantineClient } from "@byzantine/integrator-sdk";
import dotenv from "dotenv";
import { getEnvironmentBaseURL, isProduction } from "../config/environments.js";
import { confirmProductionRequest } from "./production-confirm.js";

dotenv.config();

/**
 * Dummy auth headers placeholder for SDK methods that require authHeaders.
 * The middleware will overwrite these with real stamps before the request is sent.
 */
export const DUMMY_AUTH = { pubkey: "", timestamp: "", signature: "" };

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

  // Set up production confirmation middleware (before auth, so user sees body before signing)
  if (isProduction()) {
    setupProductionConfirm(client);
  }

  // Set up the auto authentication headers
  setupAutoAuth(client);

  // Set up debugging middleware if DEBUG_MODE flag is enabled
  setupDebugging(client);

  return client;
}

/**
 * Set up production confirmation middleware for write requests
 * Previews request body and asks for y/n confirmation before sending
 * @param {ByzantineClient} client - SDK client instance
 */
function setupProductionConfirm(client) {
  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];

  client.api.client.use({
    async onRequest({ request }) {
      if (!writeMethods.includes(request.method.toUpperCase())) {
        return request;
      }

      const url = new URL(request.url);
      const path = url.pathname + url.search;

      let body = undefined;
      if (request.body) {
        const clonedRequest = request.clone();
        const text = await clonedRequest.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
        }
      }

      const confirmed = await confirmProductionRequest(
        request.method,
        path,
        body
      );
      if (!confirmed) {
        throw new Error(
          "Request cancelled by user (production confirmation)."
        );
      }

      return request;
    },
  });
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
        // Account creation & management
        "/v1/submit/create-individual-account",
        "/v1/submit/update-individual-account",
        "/v1/submit/create-entity-account",
        "/v1/submit/update-entity-account",
        "/v1/submit/add-bank-account",
        "/v1/submit/add-associated-person",
        "/v1/submit/update-associated-person",
        // Passkey transactions
        "/v1/query/get-activate-account-payload-passkey",
        "/v1/query/get-deposit-payload-passkey",
        "/v1/query/get-withdraw-payload-passkey",
        "/v1/query/get-transfer-payload-passkey",
        "/v1/query/get-vault-upgrade-payload-passkey",
        "/v1/submit/sign-payload-passkey",
        // OTP transactions
        "/v1/query/init-deposit-otp",
        "/v1/query/init-withdraw-otp",
        "/v1/submit/send-transaction-otp",
        // User invitations & roles
        "/v1/query/get-invite-users-payload-passkey",
        "/v1/submit/invite-users",
        "/v1/query/get-update-users-role-payload-passkey",
        "/v1/submit/update-users-role",
        // Invitation queries
        "/v1/query/get-invitations-by-account-id",
        "/v1/query/get-invitations-by-email",
        // OTP authentication
        "/v1/submit/init-otp",
        "/v1/submit/otp-auth",
        "/v1/submit/create-authenticators-otp",
        // Account data
        "/v1/query/get-account-balances",
        "/v1/query/get-account-details",
        "/v1/query/get-customers",
        "/v1/query/get-user-details",
        "/v1/query/get-entity-details",
        "/v1/query/get-bank-accounts",
        // Transaction data
        "/v1/query/get-transaction",
        "/v1/query/get-transactions",
        // Webhooks (covers subscriptions, /{id}, /{id}/test, deliveries, /{id}/retry)
        "/v1/webhooks/subscriptions",
        "/v1/webhooks/deliveries",
        // Event history
        "/v1/query/events",
        // Integrator key management (whoami, credentials, credentials/{pubkey})
        "/v1/integrator/",
        // Vault data
        "/v1/query/top-vaults",
        "/v1/query/apy/",
        "/v1/query/assets",
        "/v1/query/history/",
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
