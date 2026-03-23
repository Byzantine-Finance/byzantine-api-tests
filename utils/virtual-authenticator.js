/**
 * Virtual WebAuthn Authenticator
 *
 * Uses Playwright + Chrome DevTools Protocol (CDP) to create a virtual
 * WebAuthn authenticator for automated passkey testing.
 *
 * Requires: npm install --save-dev playwright
 *
 * Usage:
 *   const auth = new VirtualAuthenticator();
 *   await auth.setup();
 *   const stamp = await auth.signPayload(bodyToSign);
 *   await auth.teardown();
 */

import { chromium } from "playwright";

export class VirtualAuthenticator {
  constructor(options = {}) {
    this.rpId = options.rpId || "localhost";
    this.rpName = options.rpName || "Byzantine Test";
    this.port = options.port || 3000;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.cdpSession = null;
    this.authenticatorId = null;
  }

  /**
   * Launch browser with virtual authenticator via CDP
   */
  async setup() {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    // Create CDP session for WebAuthn virtual authenticator
    this.cdpSession = await this.page.context().newCDPSession(this.page);

    // Enable WebAuthn environment
    await this.cdpSession.send("WebAuthn.enable", {
      enableUI: false,
    });

    // Add virtual authenticator
    const { authenticatorId } = await this.cdpSession.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      }
    );

    this.authenticatorId = authenticatorId;
    return this;
  }

  /**
   * Create a passkey credential using the virtual authenticator.
   * Navigates to the test page and triggers WebAuthn create flow.
   */
  async createPasskey(userId, userEmail, userName) {
    if (!this.page) throw new Error("Call setup() first");

    // Navigate to the test page
    await this.page.goto(`http://localhost:${this.port}/tests/web/api-testing.html`);

    // Use the page's WebAuthn API directly via evaluate
    const result = await this.page.evaluate(
      async ({ rpId, rpName, userId, userEmail, userName }) => {
        const challenge = crypto.getRandomValues(new Uint8Array(32));

        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { id: rpId, name: rpName },
            user: {
              id: new TextEncoder().encode(userId),
              name: userEmail,
              displayName: userName,
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" }, // ES256
              { alg: -257, type: "public-key" }, // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              residentKey: "preferred",
              userVerification: "preferred",
            },
            timeout: 60000,
          },
        });

        // Convert ArrayBuffers to base64url
        function bufferToBase64url(buffer) {
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        }

        return {
          credentialId: bufferToBase64url(credential.rawId),
          clientDataJson: bufferToBase64url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64url(
            credential.response.attestationObject
          ),
        };
      },
      { rpId: this.rpId, rpName: this.rpName, userId, userEmail, userName }
    );

    this.credentialId = result.credentialId;
    return result;
  }

  /**
   * Sign a payload (bodyToSign object) using the virtual authenticator.
   * Returns a WebAuthn stamp string matching the format expected by the API.
   */
  async signPayload(bodyToSign) {
    if (!this.page) throw new Error("Call setup() first");

    const payloadString = JSON.stringify(bodyToSign);

    const stamp = await this.page.evaluate(
      async ({ payloadString, rpId, credentialId }) => {
        // Hash the payload to create challenge
        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(payloadString);
        const hashBuffer = await crypto.subtle.digest("SHA-256", payloadBytes);
        const challenge = new Uint8Array(hashBuffer);

        // Build allowCredentials if we have a specific credential
        const allowCredentials = credentialId
          ? [
              {
                type: "public-key",
                id: Uint8Array.from(
                  atob(credentialId.replace(/-/g, "+").replace(/_/g, "/")),
                  (c) => c.charCodeAt(0)
                ),
              },
            ]
          : undefined;

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId,
            allowCredentials,
            userVerification: "preferred",
            timeout: 60000,
          },
        });

        function bufferToBase64url(buffer) {
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        }

        return {
          credentialId: bufferToBase64url(assertion.rawId),
          authenticatorData: bufferToBase64url(
            assertion.response.authenticatorData
          ),
          clientDataJson: bufferToBase64url(
            assertion.response.clientDataJSON
          ),
          signature: bufferToBase64url(assertion.response.signature),
        };
      },
      {
        payloadString,
        rpId: this.rpId,
        credentialId: this.credentialId,
      }
    );

    // Return as JSON string matching the API's expected webAuthnStamp format
    return JSON.stringify(stamp);
  }

  /**
   * Clean up browser and authenticator
   */
  async teardown() {
    if (this.cdpSession && this.authenticatorId) {
      try {
        await this.cdpSession.send("WebAuthn.removeVirtualAuthenticator", {
          authenticatorId: this.authenticatorId,
        });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.cdpSession = null;
    this.authenticatorId = null;
    this.credentialId = null;
  }
}
