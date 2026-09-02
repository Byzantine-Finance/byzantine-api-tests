/**
 * Transaction Data SDK Tests, what are tested:
 * - getTransaction
 * - getTransactions
 * - getAllTransactions   (integrator-wide, offset-paginated)
 *
 * Tests using the Byzantine Integrator SDK instead of direct HTTP calls
 */

import { describe, it, expect } from "vitest";
import { getSdkClient, DUMMY_AUTH } from "../../utils/sdk-client.js";
import {
  getTimeout,
  FEATURE_FLAGS,
} from "../../config/test.config.js";
import {
  assertSuccessWithSchema,
  assertArrayWithSchema,
  assertError,
  assertSchema,
} from "../../utils/sdk-assertions.js";
import passkeyData from "../../fixtures/test-data/passkey-data.json";
import { getSchema } from "../../utils/schemas.js";

// Deposit/withdrawal variants of TransactionTypeView. An account may only ever
// have on/off-ramp flavours, so the by-ID tests match on the whole family
// (mirrors tests/api/transaction-data.test.js).
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
 * `status` must always be a known TransactionStatusView (the response enum,
 * renamed from TransactionStatus, which also dropped the internal-only `created`
 * and `claimed` states the API never returns), and queued
 * FXH withdrawals carry an optional `withdrawalRequest` (WithdrawalRequestView)
 * — assert its shape only when the API populates it.
 */
function assertTransactionStatusFields(transactions) {
  let withWithdrawalRequest = 0;

  for (const tx of transactions) {
    expect(TRANSACTION_STATUSES.has(tx.status)).toBe(true);

    if (tx.withdrawalRequest != null) {
      assertSchema(tx.withdrawalRequest, "WithdrawalRequestView");
      expect(WITHDRAWAL_REQUEST_STATUSES.has(tx.withdrawalRequest.status)).toBe(
        true,
      );
      withWithdrawalRequest++;
    }
  }

  console.log(
    `ℹ️  ${withWithdrawalRequest}/${transactions.length} transaction(s) carry a withdrawalRequest`,
  );
}

// Server-side paging window for getAllTransactions(). Unlike GET /v1/query/events
// (which rejects an out-of-range limit with 400), this endpoint clamps into
// [MIN_LIMIT, MAX_LIMIT] and still answers 200.
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Envelope checks shared by every getAllTransactions() page: schema, the echoed
 * paging window, per-item shape and `updatedAt` ordering. `order` defaults to
 * "desc" because that is what the endpoint does when the param is omitted.
 * Returns the page for further assertions.
 */
function assertTransactionPage(sdkResponse, { limit, offset, order = "desc" } = {}) {
  assertSuccessWithSchema(sdkResponse, "GetAllTransactionsResponse");
  const page = sdkResponse.data;

  expect(page.transactions).toBeInstanceOf(Array);
  expect(page.transactions.length).toBeLessThanOrEqual(page.limit);
  expect(page.total).toBeGreaterThanOrEqual(page.transactions.length);
  if (limit != null) expect(page.limit).toBe(limit);
  if (offset != null) expect(page.offset).toBe(offset);

  assertTransactionStatusFields(page.transactions);

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

describeTransactionData("Transaction Data SDK - Using Integrator SDK", () => {
  const client = getSdkClient();
  const testAccountId = process.env.GET_TRANSACTIONS_ACCOUNT_ID || passkeyData.accountId;
  let depositTransaction;
  let withdrawTransaction;

  describe("getTransactions()", () => {
    it(
      "should return array of transactions with expected structure",
      async () => {
        const sdkResponse = await client.api.getTransactions(testAccountId, DUMMY_AUTH);

        // Assert SDK behavior: array with expected data shape
        assertArrayWithSchema(sdkResponse, "TransactionView");
        assertTransactionStatusFields(sdkResponse.data);

        // `type` is a TransactionTypeView, which splits deposits/withdrawals into
        // several on/off-ramp variants — match any of them, not just the bare name.
        depositTransaction = sdkResponse.data.find((tx) =>
          DEPOSIT_TYPES.has(tx.type),
        );

        withdrawTransaction = sdkResponse.data.find((tx) =>
          WITHDRAW_TYPES.has(tx.type),
        );
      },
      getTimeout("api")
    );
  });

  describe("getTransaction()", () => {
    it(
      "should get deposit transaction by transaction ID",
      async () => {
        if (!depositTransaction) {
          console.log(
            "ℹ️  No deposit-type transaction on this account — skipping",
          );
          return;
        }

        const sdkResponse = await client.api.getTransaction(
          depositTransaction.transactionId,
          DUMMY_AUTH,
        );

        // Assert SDK behavior: success with expected data shape
        assertSuccessWithSchema(sdkResponse, "TransactionView");
        assertSuccessWithSchema(sdkResponse, "GetTransactionResponse");
        assertTransactionStatusFields([sdkResponse.data]);
      },
      getTimeout("api")
    );

    describe("getTransaction()", () => {
      it(
        "should get withdrawal transaction by transaction ID",
        async () => {
          if (!withdrawTransaction) {
            console.log(
              "ℹ️  No withdrawal-type transaction on this account — skipping",
            );
            return;
          }

          const sdkResponse = await client.api.getTransaction(
            withdrawTransaction.transactionId,
            DUMMY_AUTH,
          );

          // Assert SDK behavior: success with expected data shape
          assertSuccessWithSchema(sdkResponse, "TransactionView");
          assertSuccessWithSchema(sdkResponse, "GetTransactionResponse");
          assertTransactionStatusFields([sdkResponse.data]);
        },
        getTimeout("api")
      );
    });
  });

  // Integrator-wide listing: every transaction across all accounts the
  // integrator can see, newest `updatedAt` first. Shares its paging contract
  // with GET /v1/query/get-all-invitations.
  describe("getAllTransactions()", () => {
    const getAllTransactions = (queryParams = {}) =>
      client.api.getAllTransactions(DUMMY_AUTH, queryParams);

    it(
      "should list transactions across every account with default paging",
      async () => {
        const sdkResponse = await getAllTransactions();

        const page = assertTransactionPage(sdkResponse, {
          limit: DEFAULT_LIMIT,
          offset: 0,
        });

        console.log(
          `✅ ${page.transactions.length} of ${page.total} transaction(s) on the first page ` +
            `(limit ${page.limit}, offset ${page.offset})`,
        );
      },
      getTimeout("api")
    );

    it(
      "should clamp an out-of-range limit instead of rejecting it",
      async () => {
        const tooLarge = await getAllTransactions({ limit: MAX_LIMIT + 1 });
        assertTransactionPage(tooLarge, { limit: MAX_LIMIT, offset: 0 });

        for (const limit of [0, -1]) {
          const tooSmall = await getAllTransactions({ limit });
          assertTransactionPage(tooSmall, { limit: MIN_LIMIT, offset: 0 });
        }

        const negativeOffset = await getAllTransactions({ offset: -1 });
        assertTransactionPage(negativeOffset, { offset: 0 });

        console.log(
          `✅ limit clamped into [${MIN_LIMIT}, ${MAX_LIMIT}] and negative offset clamped to 0`,
        );
      },
      getTimeout("api")
    );

    it(
      "should walk pages by offset without changing the total",
      async () => {
        const first = await getAllTransactions({ limit: 1 });
        const firstPage = assertTransactionPage(first, { limit: 1, offset: 0 });

        if (firstPage.total < 2) {
          console.log(
            `ℹ️  Only ${firstPage.total} transaction(s) for this integrator — skipping paging`,
          );
          return;
        }

        const second = await getAllTransactions({ limit: 1, offset: 1 });
        const secondPage = assertTransactionPage(second, {
          limit: 1,
          offset: 1,
        });

        expect(secondPage.total).toBe(firstPage.total);
        expect(secondPage.transactions[0].transactionId).not.toBe(
          firstPage.transactions[0].transactionId,
        );

        // Past the end: an empty page, still reporting the full total
        const beyond = await getAllTransactions({ offset: firstPage.total });
        const emptyPage = assertTransactionPage(beyond, {
          offset: firstPage.total,
        });
        expect(emptyPage.transactions).toHaveLength(0);
        expect(emptyPage.total).toBe(firstPage.total);

        console.log(
          `✅ Paged through ${firstPage.total} transaction(s); offset ${firstPage.total} returns an empty page`,
        );
      },
      getTimeout("api")
    );

    it(
      "should sort on updatedAt in the requested direction",
      async () => {
        const limit = 5;

        const descending = await getAllTransactions({ limit, order: "desc" });
        const descPage = assertTransactionPage(descending, {
          limit,
          order: "desc",
        });

        const ascending = await getAllTransactions({ limit, order: "asc" });
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
      getTimeout("api")
    );

    it(
      "should agree with getTransaction() on a listed transaction",
      async () => {
        const listed = await getAllTransactions({ limit: 1 });
        const page = assertTransactionPage(listed, { limit: 1 });

        if (page.transactions.length === 0) {
          console.log("ℹ️  No transactions for this integrator — skipping");
          return;
        }

        // The listing and the by-ID read must describe the same transaction
        const fromList = page.transactions[0];
        const sdkResponse = await client.api.getTransaction(
          fromList.transactionId,
          DUMMY_AUTH,
        );

        assertSuccessWithSchema(sdkResponse, "TransactionView");
        expect(sdkResponse.data.transactionId).toBe(fromList.transactionId);
        expect(sdkResponse.data.accountId).toBe(fromList.accountId);
        expect(sdkResponse.data.status).toBe(fromList.status);
        expect(sdkResponse.data.type).toBe(fromList.type);

        console.log(
          `✅ getAllTransactions() and getTransaction() agree on ${fromList.transactionId}`,
        );
      },
      getTimeout("api")
    );

    it(
      "should reject malformed paging params",
      async () => {
        const badOrder = await getAllTransactions({ order: "sideways" });
        assertError(badOrder);
        expect(badOrder.response.status).toBe(400);

        const badLimit = await getAllTransactions({ limit: "abc" });
        assertError(badLimit);
        expect(badLimit.response.status).toBe(400);

        console.log("✅ Malformed order and limit both rejected with 400");
      },
      getTimeout("api")
    );
  });
});
