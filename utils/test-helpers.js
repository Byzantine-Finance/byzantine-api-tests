import { randomUUID } from "crypto";

/**
 * Generate a unique email by adding a timestamp suffix
 * @param {string} email - Original email address
 * @returns {string} Unique email with timestamp (e.g., "user+apitests-1234567890@domain.com")
 */
export function generateUniqueEmail(email) {
  const timestamp = Math.floor(Date.now() / 1000);
  const [emailLocal, emailDomain] = email.split("@");
  return `${emailLocal}+apitests-${timestamp}@${emailDomain}`;
}

/**
 * Generate a UUID for bridgeSignedAgreementId
 * @returns {string} A UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function genFakeBridgeAgreementId() {
  return randomUUID();
}
