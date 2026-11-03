import test from "node:test";
import assert from "node:assert/strict";
import { staffAction } from "../../functions/lib/staffActions.mjs";
import {
  dayEarnings,
  normalizeProfile,
  normalizePurchase,
  weekStart,
  weeklySummary,
} from "../../functions/lib/staffDomain.mjs";

function database() {
  const records = new Map(),
    versions = new Map();
  const seed = (path, data) => {
    records.set(path, structuredClone(data));
    versions.set(path, (versions.get(path) || 0) + 1);
  };
  const db = {
    doc: (path) => path,
    runTransaction: async (callback) => {
      for (let retry = 0; retry < 30; retry++) {
        const reads = new Map(),
          writes = [];
        const result = await callback({
          get: async (path) => {
            assert.equal(
              writes.length,
              0,
              "Firestore requires every read before writes",
            );
            reads.set(path, versions.get(path));
            return {
              exists: records.has(path),
              data: () => structuredClone(records.get(path)),
            };
          },
          set: (path, data, options) =>
            writes.push([
              path,
              options?.merge ? { ...records.get(path), ...data } : data,
            ]),
          update: (path, data) => {
            assert.ok(records.has(path));
            writes.push([path, { ...records.get(path), ...data }]);
          },
          delete: (path) => writes.push([path, null]),
        });
        if (
          [...reads].some(([path, version]) => versions.get(path) !== version)
        )
          continue;
        for (const [path, data] of writes) {
          if (data == null) records.delete(path);
          else records.set(path, structuredClone(data));
          versions.set(path, (versions.get(path) || 0) + 1);
        }
        return result;
      }
      throw new Error("Too many transaction retries");
    },
  };
  const profile = normalizeProfile({
    name: "Test housekeeper",
    email: "staff@example.test",
    propertyIds: ["prop_1", "prop_2"],
    rates: { checkout: 100000, weekly: 100000, check_room: 0 },
  });
  seed("staffProfiles/staff", profile);
  seed("staffProfiles/other", profile);
  let counter = 0;
  const perform = (
    action,
    input = {},
    actor = { uid: "manager", manager: true },
  ) =>
    staffAction({
      db,
      actor,
      action,
      input: {
        uid: "staff",
        date: "2026-11-03",
        actionId: `action_${counter++}`,
        ...input,
      },
      today: "2026-11-03",
      now: "2026-11-03T12:00:00.000Z",
    });
  const own = (action, input) => perform(action, input, { uid: "staff" });
  const day = () => records.get("staffDays/staff_2026-11-03");
  return { records, seed, perform, own, day };
}
const tasks = [
  {
    id: "hk_checkout_2026-11-03",
    type: "checkout",
    propertyId: "prop_1",
    label: "T1",
    roomId: "T1",
  },
  {
    id: "hk_check_2026-11-03",
    type: "check_room",
    propertyId: "prop_1",
    label: "T2",
    roomId: "T2",
  },
];
async function submittedDay(db) {
  await db.perform("publish", { tasks });
  for (const task of tasks)
    await db.own("task", { taskId: task.id, status: "done" });
  await db.own("submitDay", { note: "Finished" });
}
const purchase = {
  purchaseId: "purchase1",
  date: "2026-11-03",
  propertyId: "prop_1",
  description: "Soap",
  amountVnd: 50000,
  paidWith: "personal",
  receiptMissingReason: "Shop did not issue one.",
};

test("pay week is Monday–Sunday across year boundaries, regardless of device timezone", () => {
  assert.equal(weekStart("2026-11-01"), "2026-10-26");
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.throws(() => weekStart("2026-02-30"), /valid date/);
});
test("normal cleans earn 100,000; room checks are unpaid; unfinished tasks do not earn", () => {
  assert.deepEqual(
    dayEarnings([
      { status: "done", rateVnd: 100000 },
      { status: "done", rateVnd: 0 },
      { status: "blocked", rateVnd: 100000 },
    ]),
    { completed: 2, total: 3, missingRates: false, amountVnd: 100000 },
  );
  assert.equal(
    dayEarnings([{ status: "done", rateVnd: null }]).amountVnd,
    null,
  );
});
test("staff cannot change other staff records, approve wages, or self-assign work", async () => {
  const db = database();
  await assert.rejects(db.own("publish", { tasks }), /Manager access/);
  await assert.rejects(db.own("approveDay"), /Manager access/);
  await assert.rejects(
    db.own("purchase", { ...purchase, uid: "other" }),
    /own records/,
  );
  db.seed("staffProfiles/staff", {
    ...db.records.get("staffProfiles/staff"),
    active: false,
  });
  await assert.rejects(db.own("purchase", purchase), /not active/);
});
test("global task claims prevent two staff being paid for the same assigned task under concurrency", async () => {
  const db = database();
  const results = await Promise.allSettled([
    db.perform("publish", { tasks }),
    db.perform("publish", { uid: "other", tasks }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    [...db.records.keys()].filter((key) => key.startsWith("staffDays/")).length,
    1,
  );
});
test("pending tasks can be reassigned; completed tasks cannot silently be removed", async () => {
  const db = database();
  await db.perform("publish", { tasks });
  await db.perform("removeTask", { taskId: tasks[0].id });
  await db.perform("publish", { uid: "other", tasks: [tasks[0]] });
  await db.own("task", { taskId: tasks[1].id, status: "done" });
  await assert.rejects(
    db.perform("removeTask", { taskId: tasks[1].id }),
    /Only pending/,
  );
});
test("a day must account for all tasks, locks after submission, and saves rate snapshots", async () => {
  const db = database();
  await db.perform("publish", { tasks });
  await assert.rejects(db.own("submitDay"), /each task/);
  await db.own("task", {
    taskId: tasks[0].id,
    status: "done",
    rateVnd: 9999999,
  });
  await assert.rejects(
    db.own("task", { taskId: tasks[1].id, status: "blocked" }),
    /Explain/,
  );
  await db.own("task", {
    taskId: tasks[1].id,
    status: "blocked",
    reason: "Guest declined",
  });
  db.seed("staffProfiles/staff", {
    ...db.records.get("staffProfiles/staff"),
    rates: { checkout: 200000, check_room: 0 },
  });
  await db.own("submitDay");
  assert.equal(db.day().amountVnd, 100000);
  await assert.rejects(
    db.own("task", { taskId: tasks[0].id, status: "pending" }),
    /locked/,
  );
  assert.equal(
    db.records.get(`housekeepingOverrides/${tasks[0].id}`).status,
    "clean",
  );
});
test("stale edits and future completions are rejected without overwriting newer data", async () => {
  const db = database();
  await db.perform("publish", { tasks });
  await assert.rejects(
    db.own("task", { taskId: tasks[0].id, status: "done", revision: 0 }),
    /changed/,
  );
  await assert.rejects(
    db.own("task", { date: "2026-11-04", taskId: tasks[0].id, status: "done" }),
    /Future/,
  );
  assert.equal(db.day().tasks[0].status, "pending");
});
test("missing rates block approval, corrections retain original submission, approved days stay locked", async () => {
  const db = database();
  await db.perform("publish", { tasks: [{ ...tasks[0], type: "shared" }] });
  await db.own("task", { taskId: tasks[0].id, status: "done" });
  await db.own("submitDay");
  await assert.rejects(db.perform("approveDay"), /missing rates/);
  await db.perform("reopenDay", { reason: "Set shared rate" });
  assert.ok(
    [...db.records.values()].some(
      (r) => r.action === "reopenDay" && r.previousDay.status === "submitted",
    ),
  );
  db.seed("staffProfiles/staff", {
    ...db.records.get("staffProfiles/staff"),
    rates: { shared: 50000 },
  });
  await db.perform("setRates");
  await db.own("submitDay");
  await db.perform("approveDay");
  assert.equal(db.day().amountVnd, 50000);
  await assert.rejects(
    db.perform("reopenDay", { reason: "Too late" }),
    /Only submitted/,
  );
});
test("repeated and concurrent approvals create exactly one wage expense", async () => {
  const db = database();
  await submittedDay(db);
  const results = await Promise.all([
    db.perform("approveDay", { actionId: "same" }),
    db.perform("approveDay", { actionId: "same" }),
  ]);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  const expenses = [...db.records.values()].filter(
    (r) => r.sourceType === "staff_day",
  );
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].amountVnd, 100000);
  await assert.rejects(db.perform("approveDay"), /Only submitted/);
});
test("purchases require a receipt or explanation, valid property, amount, and past/present date", () => {
  const profile = normalizeProfile({
    name: "Staff",
    email: "staff@example.test",
    propertyIds: ["prop_1"],
  });
  for (const patch of [
    { amountVnd: -1 },
    { date: "2026-11-04" },
    { propertyId: "prop_3" },
    { receiptMissingReason: "" },
  ])
    assert.throws(() =>
      normalizePurchase({ ...purchase, ...patch }, profile, "2026-11-03"),
    );
});
test("receipt validation rejects disguised executable content and oversized uploads", async () => {
  const db = database();
  await assert.rejects(
    db.own("purchase", {
      ...purchase,
      receiptData: "data:image/jpeg;base64,PHNjcmlwdD4=",
    }),
    /Invalid receipt/,
  );
  await assert.rejects(
    db.own("purchase", {
      ...purchase,
      receiptData: "data:image/svg+xml;base64,aaaa",
    }),
    /JPEG or PNG/,
  );
  await assert.rejects(
    db.own("purchase", {
      ...purchase,
      receiptData: "data:image/jpeg;base64," + "A".repeat(700001),
    }),
    /JPEG or PNG/,
  );
  assert.equal(db.records.has("staffPurchases/purchase1"), false);
});
test("personal purchases create one payable expense, house purchases are already paid and not reimbursable", async () => {
  const db = database();
  await db.own("purchase", purchase);
  await db.perform("reviewPurchase", {
    purchaseId: "purchase1",
    status: "approved",
  });
  await db.own("purchase", {
    ...purchase,
    purchaseId: "house",
    paidWith: "house",
  });
  await db.perform("reviewPurchase", {
    purchaseId: "house",
    status: "approved",
  });
  assert.equal(
    db.records.get("financeEntries/staff_purchase_purchase1").paymentDate,
    "",
  );
  assert.equal(
    db.records.get("financeEntries/staff_purchase_house").paymentDate,
    "2026-11-03",
  );
  await assert.rejects(
    db.perform("pay", {
      paymentDate: "2026-11-03",
      method: "Cash",
      records: [{ kind: "purchase", id: "house" }],
    }),
    /no longer payable/,
  );
  assert.equal(
    weeklySummary(
      [],
      [
        db.records.get("staffPurchases/purchase1"),
        db.records.get("staffPurchases/house"),
      ],
    ).approvedReimbursementsVnd,
    50000,
  );
});
test("retries and concurrent settlements preserve expense dates and never pay or book twice", async () => {
  const db = database();
  await submittedDay(db);
  await db.perform("approveDay");
  await db.own("purchase", purchase);
  await db.perform("reviewPurchase", {
    purchaseId: "purchase1",
    status: "approved",
  });
  const input = {
    paymentDate: "2026-11-03",
    method: "Cash",
    records: [
      { kind: "day", id: "staff_2026-11-03" },
      { kind: "purchase", id: "purchase1" },
    ],
  };
  const results = await Promise.allSettled([
    db.perform("pay", input),
    db.perform("pay", input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(db.day().status, "paid");
  assert.equal(db.records.get("staffPurchases/purchase1").status, "paid");
  assert.equal(
    [...db.records.values()].filter((r) => r.kind === "expense").length,
    2,
  );
  assert.equal(
    weeklySummary([db.day()], [db.records.get("staffPurchases/purchase1")])
      .paidVnd,
    150000,
  );
  assert.equal(
    db.records.get("financeEntries/staff_day_staff_2026-11-03").date,
    "2026-11-03",
  );
});
test("payment rejects future dates, duplicate records and another worker’s records atomically", async () => {
  const db = database();
  await submittedDay(db);
  await db.perform("approveDay");
  const row = { kind: "day", id: "staff_2026-11-03" };
  await assert.rejects(
    db.perform("pay", {
      paymentDate: "2026-11-04",
      method: "Cash",
      records: [row],
    }),
    /actual payment date/,
  );
  await assert.rejects(
    db.perform("pay", {
      paymentDate: "2026-11-03",
      method: "Cash",
      records: [row, row],
    }),
    /Invalid payment selection/,
  );
  await assert.rejects(
    db.perform("pay", {
      uid: "other",
      paymentDate: "2026-11-03",
      method: "Cash",
      records: [row],
    }),
    /no longer payable/,
  );
  assert.equal(db.day().status, "approved");
});
