import axios from "axios";
import dotenv from "dotenv";
import { API_CONFIG } from "../config/api-config.js";
import { getEnvironmentBaseURL, isProduction } from "../config/environments.js";
import { generateAuthHeaders } from "./auth.js";

dotenv.config();

/**
 * Create a configured axios instance for Byzantine API testing
 * Handles authentication, headers, and response formatting
 */
export function createApiClient(options = {}) {
  const baseURL = options.baseURL || getEnvironmentBaseURL();

  const client = axios.create({
    baseURL,
    headers: {
      ...API_CONFIG.defaultHeaders,
      ...options.headers,
    },
    timeout: options.timeout || API_CONFIG.defaultTimeout,

    // Don't throw on any HTTP status - let tests handle errors
    validateStatus: () => true,
  });

  // Request interceptor - for logging and debugging
  client.interceptors.request.use(
    (config) => {
      if (process.env.DEBUG_MODE === "true") {
        console.log(
          `→ ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
        );
        if (config.data) {
          console.log("  Body:", JSON.stringify(config.data, null, 2));
        }
      }
      return config;
    },
    (error) => {
      if (process.env.DEBUG_MODE === "true") {
        console.error("Request Error:", error);
      }
      return Promise.reject(error);
    }
  );

  // Response interceptor - for logging and debugging
  client.interceptors.response.use(
    (response) => {
      if (process.env.DEBUG_MODE === "true") {
        console.log(`← ${response.status} ${response.config.url}`);
        if (response.data) {
          console.log("  Response:", JSON.stringify(response.data, null, 2));
        }
      }
      return response;
    },
    (error) => {
      if (process.env.DEBUG_MODE === "true") {
        console.error("Response Error:", error);
      }
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Generate authentication headers for a request
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path (e.g., "/v1/submit/create-user")
 * @param {object} params - Query parameters
 * @param {object|string} body - Request body
 * @returns {object} Authentication headers
 */
function generateRequestAuthHeaders(method, path, params, body) {
  const key = isProduction()
    ? process.env.PROD_INTEGRATOR_PRIVATE_KEY
    : process.env.DEV_INTEGRATOR_PRIVATE_KEY || null;

  if (!key) {
    throw new Error(
      "INTEGRATOR_PRIVATE_KEY is required for authenticated requests. " +
        "Set it in your .env file."
    );
  }

  // Build path with query string
  let pathAndQuery = path;
  if (params && Object.keys(params).length > 0) {
    const queryString = new URLSearchParams(params).toString();
    pathAndQuery = `${path}?${queryString}`;
  }

  // Generate auth headers using the SDK's signature algorithm
  const authHeaders = generateAuthHeaders(key, method, pathAndQuery, body);

  return authHeaders;
}

/**
 * Singleton instance for general use
 */
let apiClientInstance;

export function getApiClient() {
  if (!apiClientInstance) {
    apiClientInstance = createApiClient();
  }
  return apiClientInstance;
}

/**
 * Helper function to format API responses consistently
 * Matches the pattern: { status, ok, data?, error? }
 */
export function formatResponse(response) {
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    data:
      response.status >= 200 && response.status < 300
        ? response.data
        : undefined,
    error: response.status >= 400 ? response.data : undefined,
    headers: response.headers,
  };
}

/**
 * Make a request and return formatted response
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {object} options - Request options
 * @param {object} options.body - Request body
 * @param {object} options.query - Query parameters
 * @param {object} options.headers - Additional headers
 * @param {boolean} options.authenticated - Whether to add auth headers
 * @param {string} options.privateKey - Optional private key override
 * @returns {Promise<object>} Formatted response
 */
export async function makeRequest(method, path, options = {}) {
  const client = getApiClient();

  // Build request config
  const config = {
    method,
    url: path,
    data: options.body,
    params: options.query,
    headers: {
      ...options.headers,
    },
  };

  // Add authentication headers if required
  if (options.authenticated) {
    try {
      const authHeaders = generateRequestAuthHeaders(
        method,
        path,
        options.query,
        options.body || ""
      );
      config.headers = {
        ...config.headers,
        ...authHeaders,
      };
    } catch (error) {
      if (process.env.DEBUG_MODE === "true") {
        console.error("Failed to generate auth headers:", error.message);
      }
      throw error;
    }
  }

  try {
    const response = await client.request(config);
    return formatResponse(response);
  } catch (error) {
    // Network or other errors
    if (process.env.DEBUG_MODE === "true") {
      console.error("Request failed:", error.message);
    }
    throw error;
  }
}

// Convenience methods
export const apiClient = {
  get: (path, options) => makeRequest("GET", path, options),
  post: (path, body, options) =>
    makeRequest("POST", path, { ...options, body }),
  put: (path, body, options) => makeRequest("PUT", path, { ...options, body }),
  patch: (path, body, options) =>
    makeRequest("PATCH", path, { ...options, body }),
  delete: (path, options) => makeRequest("DELETE", path, options),
};
