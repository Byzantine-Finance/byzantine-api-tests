/**
 * Authentication Utilities
 * Generate authentication headers for Byzantine API
 */

import { createHash } from "crypto";
import elliptic from "elliptic";

const ec = new elliptic.ec("p256");

/**
 * Generate authentication headers (X-Pubkey, X-Timestamp, X-Signature)
 * Required for endpoints with integrator_auth security
 *
 * @param {string} privateKey - Integrator's ECDSA private key (hex format, with or without 0x prefix)
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} pathAndQuery - Path with query string (e.g., "/v1/submit/create-user?chain_id=8453")
 * @param {object|string} body - Request body (object will be JSON stringified)
 * @returns {object} Headers object with X-Pubkey, X-Timestamp, X-Signature
 */
export function generateAuthHeaders(
  privateKey,
  method,
  pathAndQuery,
  body = ""
) {
  // Validate that the private key is available
  if (!privateKey) {
    throw new Error("Private key is required for authenticated requests");
  }

  // Clean the private key (remove 0x prefix if present)
  const cleanPrivateKey = privateKey.replace(/^0x/, "");

  // Validate that the private key is not empty after cleaning
  if (!cleanPrivateKey) {
    throw new Error("Private key is empty or invalid");
  }

  // Create key pair from private key
  let keyPair;
  try {
    keyPair = ec.keyFromPrivate(cleanPrivateKey, "hex");
  } catch (error) {
    throw new Error(
      `Invalid private key format: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  // Get public key in compressed format
  const publicKey = `0x${keyPair.getPublic(true, "hex")}`;

  // Get timestamp in seconds since Unix epoch (UTC)
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Build the message to sign
  // Format: {timestamp}{METHOD}{path_and_query}{json_body}
  const bodyStr = typeof body === "object" ? JSON.stringify(body) : body;
  const message = `${timestamp}${method.toUpperCase()}${pathAndQuery}${bodyStr}`;

  // Hash the message with SHA-256
  const messageHash = createHash("sha256").update(message).digest();

  // Sign the hash
  const signature = keyPair.sign(messageHash);

  // Encode signature in DER format then hex
  const signatureHex = `0x${signature.toDER("hex")}`;

  return {
    "X-Pubkey": publicKey,
    "X-Timestamp": timestamp,
    "X-Signature": signatureHex,
  };
}
