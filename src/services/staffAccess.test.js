import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { staffApi } from "../../functions/lib/staffApi.mjs";

function fixture() {
  const documents = new Map([
    ["pmsAccess/manager", { role: "manager", active: true }],
    [
      "staffProfiles/worker",
      { name: "Housekeeper", active: true, rates: { checkout: 100000 } },
    ],
    ["staffProfiles/other", { name: "Other housekeeper", active: true }],
    [
      "staffDays/worker_2026-11-03",
      { uid: "worker", date: "2026-11-03", week: "2026-11-02", tasks: [] },
    ],
    [
      "staffDays/other_2026-11-03",
      {
        uid: "other",
        date: "2026-11-03",
        week: "2026-11-02",
        amountVnd: 999999,
      },
    ],
    ["staffReceipts/own", { uid: "worker", data: "own-receipt" }],
    ["staffReceipts/private", { uid: "other", data: "private-receipt" }],
  ]);
  const reads = [];
  const snap = (path) => ({
    exists: documents.has(path),
    id: path.split("/")[1],
    data: () => documents.get(path),
  });
  const query = (collection, filters = []) => ({
    where: (field, op, value) => {
      assert.equal(op, "==");
      return query(collection, [...filters, [field, value]]);
    },
    get: async () => {
      reads.push(collection);
      return {
        docs: [...documents]
          .filter(
            ([path, value]) =>
              path.startsWith(`${collection}/`) &&
              filters.every(([field, expected]) => value[field] === expected),
          )
          .map(([path]) => snap(path)),
      };
    },
  });
  const db = {
    doc: (path) => ({
      get: async () => {
        reads.push(path);
        return snap(path);
      },
    }),
    collection: (name) => query(name),
  };
  const call = (uid, action, input = {}, verified = true) =>
    staffApi({
      db,
      authAdmin: {},
      request: {
        auth: uid ? { uid, token: { email_verified: verified } } : null,
        data: { action, ...input },
      },
    });
  return { call, reads, documents };
}

test("API rejects anonymous and unverified requests before reading any PMS data", async () => {
  const f = fixture();
  await assert.rejects(
    f.call(null, "session"),
    (e) => e.code === "unauthenticated",
  );
  await assert.rejects(
    f.call("worker", "board", { date: "2026-11-03" }, false),
    (e) => e.code === "unauthenticated",
  );
  assert.deepEqual(f.reads, []);
});
test("sign-in alone never grants manager access; disabled workers lose API access", async () => {
  const f = fixture();
  assert.equal(
    (await f.call("unknown", "session", { role: "manager" })).role,
    "pending",
  );
  await assert.rejects(
    f.call("unknown", "board", { date: "2026-11-03" }),
    (e) => e.code === "permission-denied",
  );
  assert.equal((await f.call("manager", "session")).role, "manager");
  assert.equal((await f.call("worker", "session")).role, "staff");
  f.documents.set("staffProfiles/worker", { active: false });
  await assert.rejects(
    f.call("worker", "board", { date: "2026-11-03" }),
    (e) => e.code === "permission-denied",
  );
});
test("staff can only fetch their own work and receipts; supplied roles and IDs cannot elevate access", async () => {
  const f = fixture();
  const board = await f.call("worker", "board", { date: "2026-11-03" });
  assert.equal(board.days.length, 1);
  assert.equal(board.days[0].uid, "worker");
  assert.equal(
    (await f.call("worker", "receipt", { purchaseId: "own" })).data,
    "own-receipt",
  );
  await assert.rejects(
    f.call("worker", "receipt", { purchaseId: "private" }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    f.call("worker", "board", {
      uid: "other",
      date: "2026-11-03",
      manager: true,
    }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    f.call("worker", "team", { role: "manager" }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    f.call("worker", "saveProfile", { uid: "worker", active: true }),
    (e) => e.code === "permission-denied",
  );
  assert.equal(f.reads.includes("bookings"), false);
  assert.equal(f.reads.includes("guests"), false);
  assert.equal(f.reads.includes("financeEntries"), false);
});
test("manager access is checked from the allowlist for each request", async () => {
  const f = fixture();
  assert.equal(
    (await f.call("manager", "board", { uid: "other", date: "2026-11-03" }))
      .days[0].amountVnd,
    999999,
  );
  assert.equal((await f.call("manager", "team")).profiles.length, 2);
  f.documents.set("pmsAccess/manager", { role: "manager", active: false });
  await assert.rejects(
    f.call("manager", "team"),
    (e) => e.code === "permission-denied",
  );
});


test("API errors retain the CommonJS callable HTTP error type", async () => {
  const requireFromFunctions = createRequire(new URL('../../functions/staffPortal.js', import.meta.url));
  const { HttpsError } = requireFromFunctions('firebase-functions/v2/https');
  const f = fixture();
  await assert.rejects(f.call(null, 'session'), (error) => error instanceof HttpsError && error.httpErrorCode.status === 401);
  await assert.rejects(f.call('worker', 'team'), (error) => error instanceof HttpsError && error.httpErrorCode.status === 403);
});
