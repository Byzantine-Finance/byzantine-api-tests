/**
 * Mailslurp Email Utility
 *
 * Creates disposable email inboxes and extracts OTP codes for automated CI testing.
 * Eliminates the need for manual OTP code entry in the invitation + OTP flow.
 *
 * Requires: MAILSLURP_API_KEY environment variable
 *
 * Usage:
 *   const mailslurp = new MailslurpClient();
 *   const { emailAddress, inboxId } = await mailslurp.createInbox();
 *   // ... trigger OTP email to emailAddress ...
 *   const otpCode = await mailslurp.waitForOtpCode(inboxId);
 */

import { MailSlurp } from "mailslurp-client";

const DEFAULT_TIMEOUT_MS = 60_000;

export class MailslurpClient {
  constructor(apiKey = process.env.MAILSLURP_API_KEY) {
    if (!apiKey) {
      throw new Error(
        "MAILSLURP_API_KEY is required. Get one at https://app.mailslurp.com",
      );
    }
    this.client = new MailSlurp({ apiKey });
  }

  /**
   * Create a disposable email inbox
   * @returns {{ inboxId: string, emailAddress: string }}
   */
  async createInbox() {
    const inbox = await this.client.createInbox();
    console.log(`📬 Created Mailslurp inbox: ${inbox.emailAddress}`);
    return {
      inboxId: inbox.id,
      emailAddress: inbox.emailAddress,
    };
  }

  /**
   * Wait for an email to arrive and extract the OTP code from it
   * @param {string} inboxId - The inbox ID to watch
   * @param {number} timeoutMs - How long to wait for the email
   * @returns {string} The extracted OTP code
   */
  async waitForOtpCode(inboxId, timeoutMs = DEFAULT_TIMEOUT_MS) {
    console.log(
      `⏳ Waiting for OTP email (timeout: ${timeoutMs / 1000}s)...`,
    );

    const email = await this.client.waitForLatestEmail(
      inboxId,
      timeoutMs,
      true,
    );

    if (!email.body) {
      throw new Error("Received email but body is empty");
    }

    console.log(`📧 Email received: "${email.subject}"`);

    const otpCode = extractOtpFromEmail(email.body);

    if (!otpCode) {
      console.error("Email body preview:", email.body.substring(0, 500));
      throw new Error(
        "Could not extract OTP code from email body. Check the regex patterns.",
      );
    }

    console.log(`🔑 Extracted OTP code: ${otpCode}`);
    return otpCode;
  }

  /**
   * Delete an inbox after use
   * @param {string} inboxId - The inbox ID to delete
   */
  async deleteInbox(inboxId) {
    try {
      await this.client.deleteInbox(inboxId);
      console.log(`🗑️  Deleted inbox: ${inboxId}`);
    } catch (error) {
      console.warn(`⚠️  Failed to delete inbox ${inboxId}:`, error.message);
    }
  }
}

/**
 * Extract a 6-digit OTP code from an email body.
 * Tries multiple patterns to handle different email formats.
 * @param {string} body - Email body (HTML or plain text)
 * @returns {string|null} The OTP code, or null if not found
 */
function extractOtpFromEmail(body) {
  // Pattern 1: "code is 123456" or "code: 123456"
  const codeIsMatch = body.match(/code[\s]*(?:is|:)\s*(\d{6})/i);
  if (codeIsMatch) return codeIsMatch[1];

  // Pattern 2: "OTP: 123456" or "OTP 123456"
  const otpMatch = body.match(/OTP[\s:]*(\d{6})/i);
  if (otpMatch) return otpMatch[1];

  // Pattern 3: "verification code: 123456"
  const verificationMatch = body.match(/verification\s+code[\s:]*(\d{6})/i);
  if (verificationMatch) return verificationMatch[1];

  // Pattern 4: Standalone 6-digit number (common in simple OTP emails)
  // Look for a 6-digit number that's not part of a longer number
  const standaloneMatch = body.match(/\b(\d{6})\b/);
  if (standaloneMatch) return standaloneMatch[1];

  return null;
}
