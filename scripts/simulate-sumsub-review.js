/**
 * Simulate a Sumsub "applicantReviewed" inbound webhook against the LOCAL API,
 * to drive a customer lifecycle event (e.g. customer.active) without Sumsub
 * being able to reach localhost.
 *
 * IMPORTANT: the API does NOT trust the status in this payload. On receipt it
 * re-fetches the applicant's LIVE status from Sumsub (get_applicant_data_by_
 * external_id) and emits the event for THAT status. So for customer.active to
 * fire, the applicant must already be approved (GREEN) in your Sumsub sandbox.
 * This script only fires the "go re-check this applicant" trigger.
 *
 * Prerequisites:
 *   - Local API running (DEV_API_URL, e.g. http://127.0.0.1:4000)
 *   - SUMSUB_WEBHOOK_SECRET in .env (same value the local API uses)
 *   - The applicant (externalUserId = the created user's UUID) approved in the
 *     Sumsub sandbox if you want customer.active
 *   - A webhook subscription + receiver running to observe the outbound event
 *
 * Usage:
 *   node scripts/simulate-sumsub-review.js <externalUserId>
 *   SUMSUB_EXTERNAL_USER_ID=<uuid> node scripts/simulate-sumsub-review.js
 *
 * Optional overrides (env): SUMSUB_APPLICANT_ID, SUMSUB_LEVEL_NAME,
 * SUMSUB_REVIEW_ANSWER (default GREEN).
 */

import "dotenv/config";
import crypto from "node:crypto";
import axios from "axios";
import { getEnvironmentBaseURL } from "../config/environments.js";
import { endpoints } from "../config/endpoints.js";

const externalUserId = process.argv[2] || process.env.SUMSUB_EXTERNAL_USER_ID;

if (!externalUserId) {
  console.error(
    "Missing externalUserId (the created user's UUID).\n" +
      "Usage: node scripts/simulate-sumsub-review.js <externalUserId>\n" +
      "  (or set SUMSUB_EXTERNAL_USER_ID)",
  );
  process.exit(1);
}

const secret = process.env.SUMSUB_WEBHOOK_SECRET;
if (!secret) {
  console.error(
    "Missing SUMSUB_WEBHOOK_SECRET in .env — required to sign the webhook " +
      "(must match the local API's secret).",
  );
  process.exit(1);
}

const baseURL = getEnvironmentBaseURL();
const url = `${baseURL}${endpoints.providers.sumsubWebhook}`;
const nowMs = Date.now().toString();
const reviewAnswer = process.env.SUMSUB_REVIEW_ANSWER || "GREEN";

// Build the SumsubWebhook payload (camelCase). Note: applicantMemberOf is
// intentionally omitted so the API treats this as a primary applicant (not a
// beneficiary). reviewStatus/reviewResult are metadata only — the emitted
// event is decided by the applicant's LIVE status on the Sumsub side.
const payload = {
  applicantId: process.env.SUMSUB_APPLICANT_ID || `sandbox-applicant-${externalUserId}`,
  inspectionId: `sandbox-inspection-${externalUserId}`,
  correlationId: `sandbox-correlation-${nowMs}`,
  levelName: process.env.SUMSUB_LEVEL_NAME || "basic-kyc-level",
  externalUserId,
  type: "applicantReviewed",
  reviewStatus: "completed",
  reviewResult: { reviewAnswer },
  createdAtMs: nowMs,
};

// Sign the EXACT bytes we send (serialize once, sign that string, send it).
const body = JSON.stringify(payload);
const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

console.log(`→ POST ${url}`);
console.log("  externalUserId:", externalUserId);
console.log("  body:", body);

const res = await axios.post(url, body, {
  headers: {
    "content-type": "application/json",
    "x-payload-digest": signature,
  },
  validateStatus: () => true,
});

console.log(`← ${res.status}`, typeof res.data === "object" ? JSON.stringify(res.data) : res.data);

if (res.status === 200) {
  console.log(
    "\n✅ Webhook accepted. The API re-fetched the applicant's live status and\n" +
      "   emitted the matching customer.* event. Watch your receiver / check:\n" +
      "   DEBUG_MODE=true npx vitest run tests/api/webhook/webhook-deliveries.test.js -t \"should list\"\n" +
      "   If you expected customer.active but saw customer.under_review,\n" +
      "   the applicant isn't GREEN in Sumsub yet.",
  );
} else if (res.status === 401) {
  console.log(
    "\n⚠️  401 Invalid webhook signature — SUMSUB_WEBHOOK_SECRET doesn't match the API's secret.",
  );
} else {
  console.log("\n⚠️  Unexpected response — see status/body above.");
}
