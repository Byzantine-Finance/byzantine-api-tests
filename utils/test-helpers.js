import { randomUUID } from "crypto";
import { FEATURE_FLAGS } from "../config/test.config.js";

/**
 * Generate a unique email by adding a timestamp suffix
 * @param {string} email - Original email address
 * @returns {string} Unique email with timestamp (e.g., "user+api-1234567890@domain.com")
 */
export function generateUniqueEmail(email = "test@byzantine.fi") {
  const timestamp = Math.floor(Date.now() / 1000);
  const [emailLocal, emailDomain] = email.split("@");
  return `${emailLocal}+api-${timestamp}@${emailDomain}`;
}

/**
 * Return a unique email or the original, based on the UNIQUE_EMAILS flag.
 * - UNIQUE_EMAILS=true  → append a timestamp suffix (avoids "already exists"
 *   conflicts on repeated runs).
 * - UNIQUE_EMAILS unset/false (default) → use the email as-is (lets you invite
 *   a known inbox to receive OTP, reuse a fixed beneficiary address, etc.).
 * @param {string} email - Original email address
 * @returns {string} Unique or original email depending on the flag
 */
export function maybeUniqueEmail(email = "test@byzantine.fi") {
  return FEATURE_FLAGS.uniqueEmails ? generateUniqueEmail(email) : email;
}
