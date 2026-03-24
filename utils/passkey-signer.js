/**
 * Pure Node.js WebAuthn Stamp Generator
 *
 * Constructs valid WebAuthn assertion responses using a stored PKCS#8
 * private key. No browser, no Playwright, no virtual authenticator.
 *
 * Usage:
 *   const signer = new PasskeySigner({
 *     credentialId: process.env.CI_PASSKEY_CREDENTIAL_ID,
 *     privateKey: process.env.CI_PASSKEY_PRIVATE_KEY,
 *     rpId: "localhost",
 *     origin: "http://localhost:3000",
 *   });
 *   const stamp = signer.signPayload(bodyToSign);
 */

import { createHash, createPrivateKey, sign } from "crypto";

/**
 * Convert a Buffer to base64url string
 */
function toBase64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export class PasskeySigner {
  /**
   * @param {object} config
   * @param {string} config.credentialId  - base64url-encoded credential ID
   * @param {string} config.privateKey    - PKCS#8 DER private key, base64-encoded
   * @param {string} config.rpId          - Relying party ID (default: "localhost")
   * @param {string} config.origin        - Origin URL (default: "http://localhost:3000")
   */
  constructor({ credentialId, privateKey, rpId = "localhost", origin = "http://localhost:3000" }) {
    if (!credentialId) throw new Error("credentialId is required");
    if (!privateKey) throw new Error("privateKey is required");

    this.credentialId = credentialId;
    this.rpId = rpId;
    this.origin = origin;
    this.signCount = 0;

    // Import PKCS#8 DER key into a Node.js KeyObject
    this.privateKeyObject = createPrivateKey({
      key: Buffer.from(privateKey, "base64"),
      format: "der",
      type: "pkcs8",
    });
  }

  /**
   * Sign a bodyToSign payload and return a WebAuthn stamp string.
   * Produces output identical in format to VirtualAuthenticator.signPayload().
   *
   * @param {object} bodyToSign - The bodyToSign object from the API
   * @returns {string} JSON-encoded WebAuthn stamp
   */
  signPayload(bodyToSign) {
    this.signCount++;

    // 1. Challenge computation — must match the SDK's getChallengeFromPayload():
    //    a) SHA-256(JSON.stringify(bodyToSign)) → raw hash bytes
    //    b) Convert to hex string (lowercase)
    //    c) UTF-8 encode the hex string → challenge bytes
    //    d) base64url encode for clientDataJSON
    const payloadString = JSON.stringify(bodyToSign);
    const hashHex = createHash("sha256").update(payloadString).digest("hex");
    const challengeBytes = Buffer.from(hashHex, "utf-8");
    const challengeBase64url = toBase64url(challengeBytes);

    // 2. Construct clientDataJSON
    const clientDataJSON = JSON.stringify({
      type: "webauthn.get",
      challenge: challengeBase64url,
      origin: this.origin,
      crossOrigin: false,
    });
    const clientDataBytes = Buffer.from(clientDataJSON, "utf-8");
    const clientDataHash = createHash("sha256").update(clientDataBytes).digest();

    // 3. Construct authenticatorData (37 bytes)
    //    rpIdHash (32) + flags (1) + counter (4)
    const rpIdHash = createHash("sha256").update(this.rpId).digest();
    const flags = Buffer.from([0x05]); // UP (bit 0) + UV (bit 2)
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.signCount);
    const authenticatorData = Buffer.concat([rpIdHash, flags, counter]);

    // 4. Sign: ECDSA-SHA256(authenticatorData || SHA256(clientDataJSON))
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);
    const signature = sign("sha256", signedData, this.privateKeyObject);

    // 5. Return stamp in the API's expected format
    return JSON.stringify({
      credentialId: this.credentialId,
      authenticatorData: toBase64url(authenticatorData),
      clientDataJson: toBase64url(clientDataBytes),
      signature: toBase64url(signature),
    });
  }
}
