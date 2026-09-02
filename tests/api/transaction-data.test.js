/**
 * Transaction Data API Tests, what are tested:
 * - query/get-transaction
 * - query/get-transactions
 * - query/get-all-transactions   (integrator-wide, offset-paginated)
 */

import { describe, it, expect } from "vitest";
import { apiClient } from "../../utils/api-client.js";
import { endpoints } from "../../config/endpoints.js";
import { getTimeout, FEATURE_FLAGS } from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertSuccessWithArraySchema,
  assertSchema,
  assertError,
} from "../../utils/api-assertions.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";
import { getSchema } from "../../utils/schemas.js";

// Deposit/withdrawal variants of TransactionTypeView. An account may only ever
// have on/off-ramp flavours, so the by-ID tests match on the whole family.
const DEPOSIT_TYPES = new Set(["deposit", "onramp_deposit", "onramp"]);
const WITHDRAW_TYPES = new Set(["withdraw", "withdraw_offramp", "offramp"]);

// Sourced from the generated enums so they stay in lockstep with the spec.
const TRANSACTION_STATUSES = new Set(
  getSchema("TransactionStatusView")?.enum ?? [],
);
const WITHDRAWAL_REQUEST_STATUSES = new Set(
  getSchema("FxhWithdrawalStatus")?.enum ?? [],
);

/**
 * TransactionView gained `destinationAddress`, an embedded `account`
 * (AccountMinimalView) and, for queued FXH withdrawals, a `withdrawalRequest`
 * (WithdrawalRequestView). All are optional/nullable, so only assert the shape
 * when the API actually populates them.
 */
function assertNewTransactionViewFields(transactions) {
  let withAccount = 0;
  let withDestination = 0;
  let withWithdrawalRequest = 0;

  for (const tx of transactions) {
    // `status` must always be a known TransactionStatusView — the response
    // enum, renamed from TransactionStatus, which also dropped the internal-only
    // `created` and `claimed` states the API never returns.
    expect(TRANSACTION_STATUSES.has(tx.status)).toBe(true);

    if (tx.destinationAddress != null) {
      expect(typeof tx.destinationAddress).toBe("string");
      withDestination++;
    }
    if (tx.account != null) {
      assertSchema(tx.account, "AccountMinimalView");
      expect(typeof tx.account.accountName).toBe("string");
      withAccount++;
    }
    if (tx.withdrawalRequest != null) {
      assertSchema(tx.withdrawalRequest, "WithdrawalRequestView");
      expect(
        WITHDRAWAL_REQUEST_STATUSES.has(tx.withdrawalRequest.status),
      ).toBe(true);
      withWithdrawalRequest++;
      // A withdrawal request only exists once the withdrawal has been initiated
      expect(tx.status).not.toBe("created");
    }
  }

  console.log(
    `ℹ️  ${withAccount}/${transactions.length} transaction(s) carry an embedded account, ` +
      `${withDestination} carry a destinationAddress, ` +
      `${withWithdrawalRequest} carry a withdrawalRequest`,
  );
}

// Server-side paging window for GET /v1/query/get-all-transactions. Unlike
// GET /v1/query/events (which rejects an out-of-range limit with 400), this
// endpoint clamps into [MIN_LIMIT, MAX_LIMIT] and still answers 200.
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Envelope checks shared by every get-all-transactions page: schema, the echoed
 * paging window, per-item shape and `updatedAt` ordering. `order` defaults to
 * "desc" because that is what the endpoint does when the param is omitted.
 * Returns the page for further assertions.
 */
function assertTransactionPage(response, { limit, offset, order = "desc" } = {}) {
  assertSuccessWithSchema(response, "GetAllTransactionsResponse");
  const page = response.data;

  expect(page.transactions).toBeInstanceOf(Array);
  expect(page.transactions.length).toBeLessThanOrEqual(page.limit);
  expect(page.total).toBeGreaterThanOrEqual(page.transactions.length);
  if (limit != null) expect(page.limit).toBe(limit);
  if (offset != null) expect(page.offset).toBe(offset);

  assertNewTransactionViewFields(page.transactions);

  const updatedAts = page.transactions.map((tx) => Date.parse(tx.updatedAt));
  for (let i = 1; i < updatedAts.length; i++) {
    if (order === "asc") {
      expect(updatedAts[i]).toBeGreaterThanOrEqual(updatedAts[i - 1]);
    } else {
      expect(updatedAts[i]).toBeLessThanOrEqual(updatedAts[i - 1]);
    }
  }

  return page;
}

// Skip if transaction data tests are disabled
const describeTransactionData = FEATURE_FLAGS.enableTransactionDataTests
  ? describe
  : describe.skip;

describeTransactionData("Transaction Data API", () => {
  const testAccountId = process.env.GET_TRANSACTIONS_ACCOUNT_ID || passkeyData.accountId;
  let depositTransaction;
  let withdrawTransaction;

  describe("GET /v1/query/get-transactions", () => {
    it(
      "should get all transactions for an account by account ID",
      async () => {
        const response = await apiClient.get(
          endpoints.transactions.getByAccountId(testAccountId),
          { authenticated: true },
        );

        assertSuccessWithArraySchema(response, "TransactionView");
        assertNewTransactionViewFields(response.data);

        // `type` is a TransactionTypeView, which splits deposits/withdrawals into
        // several on/off-ramp variants — match any of them, not just the bare name.
        depositTransaction = response.data.find((tx) =>
          DEPOSIT_TYPES.has(tx.type),
        );

        withdrawTransaction = response.data.find((tx) =>
          WITHDRAW_TYPES.has(tx.type),
        );
      },
      getTimeout("api"),
    );
  });

  describe("GET /v1/query/get-transaction", () => {
    it(
      "should get deposit transaction by transaction ID",
      async () => {
        if (!depositTransaction) {
          console.log(
            "ℹ️  No deposit-type transaction on this account — skipping",
          );
          return;
        }

        const response = await apiClient.get(
          endpoints.transactions.getById(depositTransaction.transactionId),
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "TransactionView");
        assertSuccessWithSchema(response, "GetTransactionResponse");
        assertNewTransactionViewFields([response.data]);
      },
      getTimeout("api"),
    );

    describe("GET /v1/query/get-transaction", () => {
      it(
        "should get withdrawal transaction by transaction ID",
        async () => {
          if (!withdrawTransaction) {
            console.log(
              "ℹ️  No withdraw-type transaction on this account — skipping",
            );
            return;
          }

          const response = await apiClient.get(
            endpoints.transactions.getById(withdrawTransaction.transactionId),
            { authenticated: true },
          );

          assertSuccessWithSchema(response, "TransactionView");
          assertSuccessWithSchema(response, "GetTransactionResponse");
          assertNewTransactionViewFields([response.data]);
        },
        getTimeout("api"),
      );
    });
  });

  // Integrator-wide listing: every transaction across all accounts the
  // integrator can see, newest `updatedAt` first. Shares its paging contract
  // with GET /v1/query/get-all-invitations.
  describe("GET /v1/query/get-all-transactions", () => {
    it(
      "should list transactions across every account with default paging",
      async () => {
        const response = await apiClient.get(endpoints.transactions.getAll(), {
          authenticated: true,
        });

        const page = assertTransactionPage(response, {
          limit: DEFAULT_LIMIT,
          offset: 0,
        });

        console.log(
          `✅ ${page.transactions.length} of ${page.total} transaction(s) on the first page ` +
            `(limit ${page.limit}, offset ${page.offset})`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should clamp an out-of-range limit instead of rejecting it",
      async () => {
        const tooLarge = await apiClient.get(
          endpoints.transactions.getAll({ limit: MAX_LIMIT + 1 }),
          { authenticated: true },
        );
        assertTransactionPage(tooLarge, { limit: MAX_LIMIT, offset: 0 });

        for (const limit of [0, -1]) {
          const tooSmall = await apiClient.get(
            endpoints.transactions.getAll({ limit }),
            { authenticated: true },
          );
          assertTransactionPage(tooSmall, { limit: MIN_LIMIT, offset: 0 });
        }

        const negativeOffset = await apiClient.get(
          endpoints.transactions.getAll({ offset: -1 }),
          { authenticated: true },
        );
        assertTransactionPage(negativeOffset, { offset: 0 });

        console.log(
          `✅ limit clamped into [${MIN_LIMIT}, ${MAX_LIMIT}] and negative offset clamped to 0`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should walk pages by offset without changing the total",
      async () => {
        const first = await apiClient.get(
          endpoints.transactions.getAll({ limit: 1 }),
          { authenticated: true },
        );
        const firstPage = assertTransactionPage(first, { limit: 1, offset: 0 });

        if (firstPage.total < 2) {
          console.log(
            `ℹ️  Only ${firstPage.total} transaction(s) for this integrator — skipping paging`,
          );
          return;
        }

        const second = await apiClient.get(
          endpoints.transactions.getAll({ limit: 1, offset: 1 }),
          { authenticated: true },
        );
        const secondPage = assertTransactionPage(second, {
          limit: 1,
          offset: 1,
        });

        expect(secondPage.total).toBe(firstPage.total);
        expect(secondPage.transactions[0].transactionId).not.toBe(
          firstPage.transactions[0].transactionId,
        );

        // Past the end: an empty page, still reporting the full total
        const beyond = await apiClient.get(
          endpoints.transactions.getAll({ offset: firstPage.total }),
          { authenticated: true },
        );
        const emptyPage = assertTransactionPage(beyond, {
          offset: firstPage.total,
        });
        expect(emptyPage.transactions).toHaveLength(0);
        expect(emptyPage.total).toBe(firstPage.total);

        console.log(
          `✅ Paged through ${firstPage.total} transaction(s); offset ${firstPage.total} returns an empty page`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should sort on updatedAt in the requested direction",
      async () => {
        const limit = 5;

        const descending = await apiClient.get(
          endpoints.transactions.getAll({ limit, order: "desc" }),
          { authenticated: true },
        );
        const descPage = assertTransactionPage(descending, {
          limit,
          order: "desc",
        });

        const ascending = await apiClient.get(
          endpoints.transactions.getAll({ limit, order: "asc" }),
          { authenticated: true },
        );
        const ascPage = assertTransactionPage(ascending, {
          limit,
          order: "asc",
        });

        if (descPage.total > limit && descPage.transactions.length > 0) {
          expect(ascPage.transactions[0].transactionId).not.toBe(
            descPage.transactions[0].transactionId,
          );
        }

        console.log(
          `✅ order=desc/asc both honoured over updatedAt (${descPage.total} transaction(s) total)`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should agree with get-transaction on a listed transaction",
      async () => {
        const listed = await apiClient.get(
          endpoints.transactions.getAll({ limit: 1 }),
          { authenticated: true },
        );
        const page = assertTransactionPage(listed, { limit: 1 });

        if (page.transactions.length === 0) {
          console.log("ℹ️  No transactions for this integrator — skipping");
          return;
        }

        // The listing and the by-ID read must describe the same transaction
        const fromList = page.transactions[0];
        const response = await apiClient.get(
          endpoints.transactions.getById(fromList.transactionId),
          { authenticated: true },
        );

        assertSuccessWithSchema(response, "TransactionView");
        expect(response.data.transactionId).toBe(fromList.transactionId);
        expect(response.data.accountId).toBe(fromList.accountId);
        expect(response.data.status).toBe(fromList.status);
        expect(response.data.type).toBe(fromList.type);

        console.log(
          `✅ get-all-transactions and get-transaction agree on ${fromList.transactionId}`,
        );
      },
      getTimeout("api"),
    );

    it(
      "should reject malformed paging params",
      async () => {
        const badOrder = await apiClient.get(
          endpoints.transactions.getAll({ order: "sideways" }),
          { authenticated: true },
        );
        assertError(badOrder, 400);
        expect(badOrder.status).toBe(400);

        const badLimit = await apiClient.get(
          endpoints.transactions.getAll({ limit: "abc" }),
          { authenticated: true },
        );
        assertError(badLimit, 400);
        expect(badLimit.status).toBe(400);

        console.log("✅ Malformed order and limit both rejected with 400");
      },
      getTimeout("api"),
    );
  });
});
