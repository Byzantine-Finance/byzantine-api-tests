import { randomUUID } from "crypto";

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