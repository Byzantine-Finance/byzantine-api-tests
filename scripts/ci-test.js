#!/usr/bin/env node

/**
 * CI/CD Test Orchestrator
 *
 * Runs the integration test suite with sequential passkey transaction cycles.
 * Each passkey transaction (activate, deposit, withdraw) runs as its own
 * init → sign → submit cycle, because each depends on the previous completing:
 *   - Deposit requires the account to be activated first
 *   - Withdraw requires a balance from a deposit
 *
 * Flow:
 *   Phase 1: Core tests (account creation, data queries, etc.)
 *   Phase 2: Passkey transaction cycles (sequential):
 *            activate → deposit → withdraw
 *            Each cycle: get payload → sign with PasskeySigner → submit
 *
 * OTP tests in Phase 3 can be automated via Mailslurp (disposable email inboxes)
 * or run manually with TEST_OTP_CODE. Set MAILSLURP_API_KEY for full automation.
 *
 * Usage:
 *   node scripts/ci-test.js
 *   npm run test:ci
 *
 * Required environment variables:
 *   DEV_INTEGRATOR_PRIVATE_KEY   - ECDSA P-256 private key for API auth
 *   ENABLE_PASSKEY_TESTS=true    - Enable passkey test flow
 *   CI_PASSKEY_CREDENTIAL_ID     - Passkey credential ID (from ci-one-time-setup.js)
 *   CI_PASSKEY_PRIVATE_KEY       - Passkey PKCS#8 private key (from ci-one-time-setup.js)
 *
 * Prerequisites:
 *   - npm install
 *   - Run ci-one-time-setup.js once and approve KYC for the created account
 */

import { execSync } from "child_process";
import { readFileSync, existsSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Marker so child test processes know they were launched by this orchestrator
// (not via raw `npx vitest`). Tests can gate CI-specific env overrides on this
// without relying on CI=true (which CI runners set automatically).
process.env.CI_TEST_ORCHESTRATED = "true";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const DIVIDER = "═".repeat(60);

// Which test suite to run: "api" (direct HTTP, default) or "sdk" (Integrator SDK).
// Orchestration is identical; only the test file paths differ.
const TEST_SUITE = (process.env.TEST_SUITE || "api").toLowerCase();
if (!["api", "sdk"].includes(TEST_SUITE)) {
  throw new Error(`Invalid TEST_SUITE="${TEST_SUITE}". Must be "api" or "sdk".`);
}
const testsDir = `tests/${TEST_SUITE}`;
const testFile = (name) => `${testsDir}/${name}.test.js`;

// ── Report state ─────────────────────────────────────────────
// Collected per-run vitest JSON results, tagged with phase + label.
const reportResults = [];
let _currentPhase = "Setup";

function log(phase, description) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${phase}: ${description}`);
  console.log(DIVIDER);
}

// Derive a human-readable label from a vitest command (used when no explicit
// label is passed). Extracts the test file name and optional -t filter.
function extractTestLabel(command) {
  const fileMatch = command.match(/tests\/(?:api|sdk)\/([\w-]+)\.test\.js/);
  const filterMatch = command.match(/-t "([^"]+)"/);
  const name = fileMatch ? fileMatch[1] : "unknown";
  return filterMatch ? `${name} (-t "${filterMatch[1]}")` : name;
}

function run(command, extraEnv = {}, stepLabel = null) {
  console.log(`  $ ${command}\n`);

  const isVitest = command.trim().startsWith("npx vitest run");
  let tmpFile = null;
  let modifiedCommand = command;

  if (isVitest) {
    // Inject a JSON reporter alongside the normal verbose reporter so we can
    // capture structured results without losing terminal output.
    tmpFile = join(rootDir, `fixtures/__generated__/.vitest-report-${Date.now()}.json`);
    modifiedCommand = `${command} --reporter=verbose --reporter=json --outputFile=${tmpFile}`;
  }

  let thrownError = null;
  try {
    execSync(modifiedCommand, {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
      cwd: rootDir,
    });
  } catch (err) {
    thrownError = err;
  }

  // Collect results even on failure so the report captures partial runs.
  if (isVitest && tmpFile && existsSync(tmpFile)) {
    try {
      const raw = JSON.parse(readFileSync(tmpFile, "utf-8"));
      reportResults.push({
        phase: _currentPhase,
        label: stepLabel || extractTestLabel(command),
        data: raw,
      });
      unlinkSync(tmpFile);
    } catch (_) {
      // Ignore parse errors — this step will simply be absent from the report.
    }
  }

  if (thrownError) throw thrownError;
}

/**
 * Run a single passkey transaction cycle: init → sign → submit
 */
function runPasskeyCycle(name, { initFlag, initTest, txFlag, txTest, extraInitEnv = {}, afterInit = null }) {
  const isEnabled = process.env[txFlag] === "true";
  if (!isEnabled) {
    console.log(`  ${name}: skipped (${txFlag} not enabled)`);
    return;
  }

  console.log(`\n  ── ${name} ──`);

  // When running via ci-test.js, all three passkey init cycles operate on the
  // single CI_PASSKEY_ACCOUNT_ID (the account registered by ci-one-time-setup.js).
  // These overrides take priority over any TEST_INIT_*_TARGET_ACCOUNT_ID values
  // in .env, so direct `npx vitest` runs keep using the per-cycle .env vars.
  const ciAccountId = process.env.CI_PASSKEY_ACCOUNT_ID;
  const ciAccountOverrides = ciAccountId
    ? {
        TEST_INIT_ACTIVATE_TARGET_ACCOUNT_ID: ciAccountId,
        TEST_INIT_DEPOSIT_TARGET_ACCOUNT_ID: ciAccountId,
        TEST_INIT_WITHDRAW_TARGET_ACCOUNT_ID: ciAccountId,
      }
    : {};

  // Step 1: Get payload
  console.log(`  [init] Getting bodyToSign payload...`);
  run(
    `npx vitest run ${testFile("init-passkey")} -t "${initTest}"`,
    {
      ENABLE_PASSKEY_TESTS: "true",
      [initFlag]: "true",
      // Disable other init tests
      ENABLE_PASSKEY_INIT_ACTIVATE_TESTS: "false",
      ENABLE_PASSKEY_INIT_DEPOSIT_TESTS: "false",
      ENABLE_PASSKEY_INIT_WITHDRAW_TESTS: "false",
      // Override the specific one we want
      [initFlag]: "true",
      CI: "true",
      ...ciAccountOverrides,
      ...extraInitEnv,
    },
    `${name} — init`,
  );

  if (afterInit) afterInit();

  // Step 2: Sign
  console.log(`  [sign] Signing payload with PasskeySigner...`);
  run("node scripts/generate-stamps-ci.js");

  // Step 3: Submit
  console.log(`  [submit] Submitting signed payload...`);
  run(
    `npx vitest run ${testFile("transaction-passkey")} -t "${txTest}"`,
    {
      ENABLE_PASSKEY_TESTS: "true",
      [txFlag]: "true",
      // Disable other TX tests
      ENABLE_PASSKEY_ACTIVATE_TX_TESTS: "false",
      ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS: "false",
      ENABLE_PASSKEY_DEPOSIT_TX_TESTS: "false",
      ENABLE_PASSKEY_WITHDRAW_TX_TESTS: "false",
      // Override the specific one we want
      [txFlag]: "true",
      CI: "true",
    },
    `${name} — submit`,
  );

  console.log(`  ✅ ${name} complete`);
}

// ── Test report generation ────────────────────────────────────
function generateReport(overallSuccess) {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const displayTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const filename = `sanity-check-report-${dateStr}-${timeStr}.md`;
    const outputPath = join(rootDir, "fixtures/__generated__", filename);

    const fullName = (t) => [...(t.ancestorTitles || []), t.title].join(" > ");
    const isSkipped = (t) => ["skipped", "pending", "todo"].includes(t.status);

    // ── Two-pass analysis ─────────────────────────────────────
    // Pass 1: build the set of every test that executed (passed or failed) in
    // ANY run across the whole script, keyed by "filePath::fullName" so the
    // same test name in different files stays distinct.
    const ranKeys = new Set();
    // Also record the first time each test appeared as skipped so we can group
    // the truly-never-ran tests by file for the report.
    // key -> { t, fileName }
    const firstSkipSeen = new Map();

    for (const r of reportResults) {
      for (const suite of r.data.testResults || []) {
        const filePath = suite.testFilePath || "";
        const fileName = filePath.split("/").pop().replace(".test.js", "");
        for (const t of suite.assertionResults || []) {
          const key = `${filePath}::${fullName(t)}`;
          if (t.status === "passed" || t.status === "failed") {
            ranKeys.add(key);
          } else if (isSkipped(t) && !firstSkipSeen.has(key)) {
            firstSkipSeen.set(key, { t, fileName });
          }
        }
      }
    }

    // Pass 2: a test is "truly skipped" only when it never executed anywhere.
    // Tests that were skipped in Phase 1 but ran in Phase 2/3 are excluded.
    const trulySkippedByFile = new Map(); // fileName -> t[]
    for (const [key, { t, fileName }] of firstSkipSeen) {
      if (!ranKeys.has(key)) {
        if (!trulySkippedByFile.has(fileName)) trulySkippedByFile.set(fileName, []);
        trulySkippedByFile.get(fileName).push(t);
      }
    }
    const totalTrulySkipped = [...trulySkippedByFile.values()]
      .reduce((sum, arr) => sum + arr.length, 0);

    // Simple pass/fail totals (de-duplicated skipped count replaces vitest's)
    let totalPassed = 0, totalFailed = 0;
    for (const r of reportResults) {
      totalPassed += r.data.numPassedTests ?? 0;
      totalFailed += r.data.numFailedTests ?? 0;
    }

    const statusBadge = overallSuccess ? "✅ PASSED" : "❌ FAILED";
    const lines = [];

    lines.push(`# CI Test Report — ${dateStr} ${displayTime}`);
    lines.push(``);
    lines.push(`**Suite:** \`${TEST_SUITE}\` | **Env:** \`${process.env.TEST_ENV || "development"}\` | **Status:** ${statusBadge}`);
    lines.push(``);
    lines.push(`## Summary`);
    lines.push(``);
    lines.push(`| Metric | Count |`);
    lines.push(`|:---|---:|`);
    lines.push(`| ✅ Passed  | ${totalPassed} |`);
    lines.push(`| ❌ Failed  | ${totalFailed} |`);
    lines.push(`| ⏭ Never ran | ${totalTrulySkipped} |`);
    lines.push(`| **Total** | **${totalPassed + totalFailed + totalTrulySkipped}** |`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);

    // ── Per-phase / per-run tables (passed + failed only) ──────
    const phases = [...new Set(reportResults.map((r) => r.phase))];
    for (const phase of phases) {
      lines.push(`## ${phase}`);
      lines.push(``);

      const phaseResults = reportResults.filter((r) => r.phase === phase);
      for (const result of phaseResults) {
        lines.push(`### ${result.label}`);
        lines.push(``);

        const allTests = (result.data.testResults || []).flatMap(
          (suite) => suite.assertionResults || [],
        );

        if (allTests.length === 0) {
          lines.push(`_No tests recorded._`);
          lines.push(``);
          continue;
        }

        const failed = allTests.filter((t) => t.status === "failed");
        const passed = allTests.filter((t) => t.status === "passed");

        lines.push(`| Status | Test |`);
        lines.push(`|:---:|:---|`);
        for (const t of failed) lines.push(`| ❌ | ${fullName(t)} |`);
        for (const t of passed) lines.push(`| ✅ | ${fullName(t)} |`);
        lines.push(``);

        // Collapsible failure details (GitHub renders <details> in Markdown)
        for (const t of failed) {
          const msg = (t.failureMessages || []).join("\n");
          lines.push(`<details><summary>❌ <strong>${fullName(t)}</strong></summary>`);
          lines.push(``);
          lines.push("```");
          lines.push(msg.length > 1200 ? `${msg.substring(0, 1200)}\n… (truncated)` : msg);
          lines.push("```");
          lines.push(``);
          lines.push(`</details>`);
          lines.push(``);
        }
      }
    }

    // ── Tests that never ran anywhere in this script run ───────
    // A test counts here only if it was skipped in every phase it was reached
    // AND never executed (passed/failed) in any other phase. Tests like OTP
    // auth that are disabled in Phase 1 but run in Phase 3 do NOT appear here.
    if (trulySkippedByFile.size > 0) {
      lines.push(`---`);
      lines.push(``);
      lines.push(`## Tests That Never Ran`);
      lines.push(``);
      for (const [fileName, tests] of trulySkippedByFile) {
        lines.push(`**${fileName}**`);
        lines.push(``);
        for (const t of tests) {
          lines.push(`- ${fullName(t)}`);
        }
        lines.push(``);
      }
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`*Generated by \`scripts/ci-test.js\` · ${dateStr} at ${displayTime} · Suite: \`${TEST_SUITE}\`*`);

    writeFileSync(outputPath, lines.join("\n"), "utf-8");
    console.log(`\n  📊 Report saved → fixtures/__generated__/${filename}`);
  } catch (err) {
    console.warn(`  ⚠️  Report generation failed: ${err.message}`);
  }
}

// Common env overrides to disable OTP and other non-relevant tests
const DISABLED_OTP_ENV = {
  ENABLE_OTP_TESTS: "false",
  ENABLE_OTP_INIT_DEPOSIT_TESTS: "false",
  ENABLE_OTP_INIT_WITHDRAW_TESTS: "false",
  ENABLE_OTP_DEPOSIT_TX_TESTS: "false",
  ENABLE_OTP_WITHDRAW_TX_TESTS: "false",
  ENABLE_OTP_INIT_AUTH_TESTS: "false",
  ENABLE_OTP_AUTHENTICATE_TESTS: "false",
  ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "false",
};

try {
  const isPasskeyEnabled = process.env.ENABLE_PASSKEY_TESTS === "true";
  const hasCiPasskeySecrets =
    process.env.CI_PASSKEY_CREDENTIAL_ID && process.env.CI_PASSKEY_PRIVATE_KEY;
  const useVirtualAuth = process.env.USE_VIRTUAL_AUTH === "true";
  const canSign = hasCiPasskeySecrets || useVirtualAuth;

  const signerMode = hasCiPasskeySecrets
    ? "pure (PasskeySigner)"
    : useVirtualAuth
      ? "virtual-auth (Playwright)"
      : "none";

  console.log(`\n${DIVIDER}`);
  console.log("  Byzantine Integrator SDK - CI Test Runner");
  console.log(DIVIDER);
  console.log(`  Test suite:         ${TEST_SUITE} (${testsDir}/)`);
  console.log(`  Passkey tests:      ${isPasskeyEnabled}`);
  console.log(`  Signer mode:        ${signerMode}`);
  console.log(`  Activate TX:        ${process.env.ENABLE_PASSKEY_ACTIVATE_TX_TESTS === "true"}`);
  console.log(`  Activate ETH TX:    ${process.env.ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS === "true"}`);
  console.log(`  Deposit TX:         ${process.env.ENABLE_PASSKEY_DEPOSIT_TX_TESTS === "true"}`);
  console.log(`  Withdraw TX:        ${process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true"}`);
  console.log(`  Invite+OTP flow:    ${process.env.ENABLE_INVITE_OTP_FLOW === "true"}`);
  console.log(`  OTP retrieval:      ${process.env.MAILSLURP_API_KEY ? "Mailslurp (auto)" : process.env.TEST_OTP_CODE ? "manual" : "disabled"}`);

  // ── Pre-flight: fast smoke tests run before any write operations ──
  log("Pre-flight", "Health & Vault Data");
  _currentPhase = "Pre-flight";
  for (const name of ["health", "vault-data"]) {
    console.log(`\n  ── pre-flight: ${name} ──`);
    run(`npx vitest run ${testFile(name)}`, { CI: "true" }, name);
  }

  // ──────────────────────────────────────────────────────────
  // Phase 1: Core tests (no passkey TX submission)
  // ──────────────────────────────────────────────────────────
  log("Phase 1", `Core ${TEST_SUITE.toUpperCase()} Tests`);
  _currentPhase = "Phase 1 — Core Tests";

  // Env applied to every Phase 1 child. Kept as one object so priority-ordered
  // files and the catch-all run below share identical gating.
  const phase1Env = {
    // Disable all passkey TX tests (handled in Phase 2)
    ENABLE_PASSKEY_ACTIVATE_TX_TESTS: "false",
    ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS: "false",
    ENABLE_PASSKEY_DEPOSIT_TX_TESTS: "false",
    ENABLE_PASSKEY_WITHDRAW_TX_TESTS: "false",
    ENABLE_PASSKEY_INIT_ACTIVATE_TESTS: "false",
    ENABLE_PASSKEY_INIT_DEPOSIT_TESTS: "false",
    ENABLE_PASSKEY_INIT_WITHDRAW_TESTS: "false",
    UPDATE_ROLE: "false",
    ADD_US_BANK_ACCOUNT: "false",
    // Force both associated-persons steps on every run so add-associated-person
    // and update-associated-person endpoints are always exercised under CI.
    // Step 1 (add) is declared before Step 2 (update) in the test file, so
    // vitest's in-file source order guarantees add-before-update.
    ADD_ASSOCIATED_PERSONS: "true",
    UPDATE_BENEFICIARY: "true",
    ...DISABLED_OTP_ENV,
    CI: "true",
  };

  // Priority files: must run in this exact order (later files depend on state
  // produced by earlier ones — e.g. update-account mutates the user/entity
  // account-creation just made). Vitest's default sequencer sorts alphabetically
  // within a single invocation, so each priority file gets its own vitest run
  // to guarantee ordering.
  const priorityFiles = ["account-creation", "update-account", "associated-persons", "account-management"];
  for (const name of priorityFiles) {
    console.log(`\n  ── priority: ${name} ──`);
    run(`npx vitest run ${testFile(name)}`, phase1Env, name);
  }

  // Catch-all: everything else in tests/<suite>/ in alphabetical order.
  const phase1Excludes = [
    ...priorityFiles,    // already run above
    "health",            // run in pre-flight
    "vault-data",        // run in pre-flight
    "transaction-data",  // run in Phase 2 after Deposit (needs transactions to exist)
    "init-passkey",
    "transaction-passkey",
    "user-invitation",
    "init-otp",
    "entity-update-flow",
  ].map((name) => `--exclude ${testFile(name)}`);
  // All tests/api/validation/** files are always excluded from the CI run.
  // (No validation/ subfolder exists under tests/sdk/.)
  if (TEST_SUITE === "api") {
    phase1Excludes.push("--exclude tests/api/validation/**/*.test.js");
  }
  run(
    `npx vitest run ${testsDir}/ --fileParallelism=false ${phase1Excludes.join(" ")}`,
    phase1Env,
    "core (catch-all)",
  );

  // ──────────────────────────────────────────────────────────
  // Phase 2: Passkey transaction cycles (sequential)
  //   Each cycle: init → sign → submit
  //   Order matters: activate → deposit → withdraw
  // ──────────────────────────────────────────────────────────
  if (isPasskeyEnabled && canSign) {
    log("Phase 2", "Passkey Transaction Cycles (activate → deposit → withdraw)");
    _currentPhase = "Phase 2 — Passkey Cycles";

    if (!process.env.CI_PASSKEY_ACCOUNT_ID) {
      throw new Error(
        "CI_PASSKEY_ACCOUNT_ID is not set. Phase 2 requires it — this is the single account ID used for activate/deposit/withdraw cycles (populated by ci-one-time-setup.js)."
      );
    }

    // Activate on Base
    runPasskeyCycle("Activate (Base, chain 8453)", {
      initFlag: "ENABLE_PASSKEY_INIT_ACTIVATE_TESTS",
      initTest: "Base, chain 8453",
      txFlag: "ENABLE_PASSKEY_ACTIVATE_TX_TESTS",
      txTest: "ActivateAccount",
    });

    // Activate on Ethereum
    runPasskeyCycle("Activate (Ethereum, chain 1)", {
      initFlag: "ENABLE_PASSKEY_INIT_ACTIVATE_TESTS",
      initTest: "Ethereum, chain 1",
      txFlag: "ENABLE_PASSKEY_ACTIVATE_ETH_TX_TESTS",
      txTest: "ActivateAccountETH",
    });

    // Deposit
    runPasskeyCycle("Deposit", {
      initFlag: "ENABLE_PASSKEY_INIT_DEPOSIT_TESTS",
      initTest: "should get deposit payload",
      txFlag: "ENABLE_PASSKEY_DEPOSIT_TX_TESTS",
      txTest: "Deposit",
      afterInit: () => {
        console.log("\n  ── Transaction data: get-transactions + deposit (post-deposit-init) ──");
        const txFilter = TEST_SUITE === "sdk"
          ? "getTransactions|should get deposit transaction"
          : "GET /v1/query/get-transactions|should get deposit transaction";
        run(
          `npx vitest run ${testFile("transaction-data")} -t "${txFilter}"`,
          { CI: "true" },
          "transaction-data — get-transactions + deposit (post-deposit-init)",
        );
      },
    });

    // Let the deposit settle before initializing the withdraw payload
    if (process.env.ENABLE_PASSKEY_WITHDRAW_TX_TESTS === "true") {
      console.log("\n  ⏳ Waiting 10s for deposit to settle before withdraw...");
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }

    // Withdraw
    runPasskeyCycle("Withdraw", {
      initFlag: "ENABLE_PASSKEY_INIT_WITHDRAW_TESTS",
      initTest: "should get withdraw payload",
      txFlag: "ENABLE_PASSKEY_WITHDRAW_TX_TESTS",
      txTest: "Withdrawal",
    });
  } else if (isPasskeyEnabled) {
    log("Phase 2", "Skipped (no signer available)");
    console.log(
      "  Set CI_PASSKEY_CREDENTIAL_ID + CI_PASSKEY_PRIVATE_KEY for pure signing,\n" +
      "  or USE_VIRTUAL_AUTH=true for Playwright fallback.\n"
    );
  } else {
    log("Phase 2", "Skipped (passkey tests not enabled)");
  }

  // ── Phase 3: Invitation + OTP flow ───────────────────────
  const inviteEnabled = process.env.ENABLE_INVITE_OTP_FLOW === "true";
  if (inviteEnabled && isPasskeyEnabled && canSign) {
    log("Phase 3", "User Invitation + OTP Authentication Flow");
    _currentPhase = "Phase 3 — Invite + OTP";

    // Determine OTP retrieval method
    const hasMailslurp = !!process.env.MAILSLURP_API_KEY;
    const hasManualOtp = !!process.env.TEST_OTP_CODE;
    const otpMode = hasMailslurp ? "mailslurp" : hasManualOtp ? "manual" : "none";
    console.log(`  OTP mode: ${otpMode}`);

    // Step 0: Create Mailslurp inbox (if available)
    let mailslurpInbox = null;
    let inviteEmailEnv = {};
    if (hasMailslurp) {
      console.log("\n  ── Step 0: Create disposable email inbox ──");
      const { MailslurpClient } = await import("../utils/mailslurp.js");
      const mailslurp = new MailslurpClient();
      mailslurpInbox = { client: mailslurp, ...(await mailslurp.createInbox()) };
      inviteEmailEnv = { CI_INVITE_EMAIL: mailslurpInbox.emailAddress };
      console.log(`  📬 Inbox ready: ${mailslurpInbox.emailAddress}\n`);
    }

    try {
      // Step 1: Get invite payload
      console.log("\n  ── Step 1: Get invite payload ──");
      run(
        `npx vitest run ${testFile("user-invitation")} -t "should generate payload"`,
        { ENABLE_WRITE_TESTS: "true", INVITE_PAYLOAD: "true", INVITE_USERS: "false", CI: "true", ...inviteEmailEnv },
        "user-invitation — get payload",
      );

      // Step 2: Sign invite payload with entity credential
      console.log("  ── Step 2: Sign invite payload ──");
      run("node scripts/generate-stamps-ci.js");

      // Step 3: Submit invitation (+ query the newly-created invitation)
      // Runs the full user-invitation.test.js with INVITE_PAYLOAD=false: the
      // payload describe is skipped by its flag, the invite describe runs,
      // and the invitation-queries describe runs right after it (same file).
      console.log("  ── Step 3: Submit invitation + query ──");
      run(
        `npx vitest run ${testFile("user-invitation")}`,
        { ENABLE_WRITE_TESTS: "true", INVITE_PAYLOAD: "false", INVITE_USERS: "true", CI: "true", ...inviteEmailEnv },
        "user-invitation — submit + queries",
      );
      console.log("  ✅ User invited + queried\n");

      // Wait for the invitation email to arrive, then snapshot the count.
      // This ensures we don't accidentally read the invitation email as the OTP.
      let emailCountBeforeOtp = 0;
      if (hasMailslurp) {
        emailCountBeforeOtp = await mailslurpInbox.client.waitForEmailCount(mailslurpInbox.inboxId, 1);
        console.log(`  📬 Emails in inbox before OTP: ${emailCountBeforeOtp}`);
      }

      // Step 4: Init OTP for invited user
      console.log("  ── Step 4: Initialize OTP ──");
      run(
        `npx vitest run ${testFile("otp-authentication")} -t "should initialize OTP"`,
        {
          ENABLE_OTP_INIT_AUTH_TESTS: "true",
          ENABLE_OTP_AUTHENTICATE_TESTS: "false",
          ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "false",
          CI: "true",
        },
        "otp-authentication — init",
      );
      console.log("  ✅ OTP sent to invited user's email\n");

      // Step 5: Get OTP code (Mailslurp auto-retrieval or manual)
      let otpCode = process.env.TEST_OTP_CODE;

      if (hasMailslurp) {
        console.log("  ── Step 5a: Retrieve OTP code from Mailslurp ──");
        otpCode = await mailslurpInbox.client.waitForOtpCode(
          mailslurpInbox.inboxId,
          60_000,
          emailCountBeforeOtp,
        );
        console.log(`  🔑 OTP code retrieved: ${otpCode}\n`);
      }

      if (otpCode) {
        // Step 5b: Authenticate with OTP
        console.log("  ── Step 5b: Authenticate with OTP ──");
        run(
          `npx vitest run ${testFile("otp-authentication")} -t "should authenticate"`,
          {
            ENABLE_OTP_INIT_AUTH_TESTS: "false",
            ENABLE_OTP_AUTHENTICATE_TESTS: "true",
            ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "false",
            TEST_OTP_CODE: otpCode,
            CI: "true",
          },
          "otp-authentication — authenticate",
        );
        console.log("  ✅ OTP authenticated\n");

        // Step 6: Create authenticator for invited user
        console.log("  ── Step 6: Create authenticator for invited user ──");
        run(
          `npx vitest run ${testFile("otp-authentication")} -t "should create authenticators"`,
          {
            ENABLE_OTP_INIT_AUTH_TESTS: "false",
            ENABLE_OTP_AUTHENTICATE_TESTS: "false",
            ENABLE_OTP_CREATE_AUTHENTICATORS_TESTS: "true",
            CI: "true",
          },
          "otp-authentication — create authenticators",
        );
        console.log("  ✅ Authenticator created for invited user\n");

        // Step 7: Promote invited user to root (role management)
        const invitedUserFile = join(rootDir, "fixtures/test-data/__generated__/generated-invited-user.json");
        if (existsSync(invitedUserFile)) {
          const invitedUser = JSON.parse(readFileSync(invitedUserFile, "utf-8"));
          if (invitedUser.userId) {
            console.log("  ── Step 7: Promote invited user to root ──");
            console.log(`  Target user: ${invitedUser.userId}`);

            // Get role update payload
            console.log("  [payload] Getting role update payload...");
            run(
              `npx vitest run ${testFile("role-management")} -t "should generate payload"`,
              {
                ENABLE_WRITE_TESTS: "true",
                UPDATE_ROLE_PAYLOAD: "true",
                UPDATE_ROLE: "false",
                TEST_ROLE_TARGET_USER_ID: invitedUser.userId,
                CI: "true",
              },
              "role-management — get payload",
            );

            // Sign with entity credential
            console.log("  [sign] Signing role update payload...");
            run("node scripts/generate-stamps-ci.js");

            // Submit
            console.log("  [submit] Submitting role update...");
            run(
              `npx vitest run ${testFile("role-management")} -t "should update user role"`,
              {
                ENABLE_WRITE_TESTS: "true",
                UPDATE_ROLE_PAYLOAD: "false",
                UPDATE_ROLE: "true",
                TEST_ROLE_TARGET_USER_ID: invitedUser.userId,
                CI: "true",
              },
              "role-management — submit",
            );
            console.log("  ✅ Invited user promoted to root");
          }
        }
      } else {
        console.log("  ⚠️  No OTP code available. Steps 5b-7 skipped.");
        console.log("  📧 Check the invited user's email for the OTP code.");
        console.log("  💡 Options to automate:");
        console.log("     - Set MAILSLURP_API_KEY for automatic OTP retrieval");
        console.log("     - Set TEST_OTP_CODE=<code> for manual OTP entry");
      }
    } finally {
      // Clean up Mailslurp inbox
      if (mailslurpInbox) {
        await mailslurpInbox.client.deleteInbox(mailslurpInbox.inboxId);
      }
    }
  } else if (inviteEnabled) {
    log("Phase 3", "Skipped (passkey signer or tests not enabled)");
  }

  generateReport(true);

  console.log(`\n${DIVIDER}`);
  console.log("  ✅ All CI tests completed successfully");
  console.log(`${DIVIDER}\n`);
} catch (err) {
  generateReport(false);
  console.error(`\n${DIVIDER}`);
  console.error("  ❌ CI tests failed");
  console.error(`${DIVIDER}\n`);
  process.exit(err.status || 1);
}
