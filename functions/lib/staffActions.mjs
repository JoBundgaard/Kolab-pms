import { nextRoomCleaningDue, readRoomRecurring, roomRecurringChecklist } from "./staffRecurring.mjs";
import { Buffer } from "node:buffer";
import {
  amount,
  dayEarnings,
  normalizePurchase,
  normalizeTask,
  requireDay,
  safeId,
  staffToday,
  textValue,
  weekStart,
} from "./staffDomain.mjs";

// All mutations run on the trusted server. Reads precede writes in every transaction.
export async function staffAction({
  db,
  actor,
  action,
  input,
  now = new Date().toISOString(),
  today = staffToday(),
}) {
  if (!actor?.uid) throw new Error("Sign in first.");
  const manager = actor.manager === true;
  const uid = safeId(manager ? input.uid || actor.uid : actor.uid);
  if (!manager && input.uid && input.uid !== uid)
    throw new Error("You can only access your own records.");
  const managerActions = [
    "publish",
    "removeTask",
    "setRates",
    "approveDay",
    "reopenDay",
    "reviewPurchase",
    "pay",
  ];
  if (managerActions.includes(action) && !manager)
    throw new Error("Manager access required.");
  const actionId = safeId(input.actionId);
  const auditRef = db.doc(`staffAudit/${actor.uid}_${actionId}`);
  return db.runTransaction(async (tx) => {
    const audit = await tx.get(auditRef);
    if (audit.exists) {
      if (audit.data().action !== action || audit.data().uid !== uid)
        throw new Error("Action ID already used.");
      return { duplicate: true };
    }
    const profileSnap = await tx.get(db.doc(`staffProfiles/${uid}`));
    if (!profileSnap.exists || (!profileSnap.data().active && !manager))
      throw new Error("Staff access is not active.");
    const profile = profileSnap.data();
    let recordId = "";
    let detail = {};
    if (
      [
        "publish",
        "removeTask",
        "setRates",
        "task",
        "submitDay",
        "approveDay",
        "reopenDay",
      ].includes(action)
    ) {
      const date = requireDay(input.date);
      recordId = `${uid}_${date}`;
      const dayRef = db.doc(`staffDays/${recordId}`);
      const snap = await tx.get(dayRef);
      const old = snap.exists ? snap.data() : null;
      const day = old || {
        uid,
        staffName: profile.name,
        date,
        week: weekStart(date),
        status: "draft",
        tasks: [],
        revision: 0,
        amountVnd: 0,
      };
      if (["task", "submitDay"].includes(action) && date > today)
        throw new Error("Future work cannot be completed.");
      if (
        ["publish", "removeTask", "setRates", "task", "submitDay"].includes(
          action,
        ) &&
        day.status !== "draft"
      )
        throw new Error("This day is locked. Ask a manager to reopen it.");
      if (input.revision != null && input.revision !== day.revision)
        throw new Error("This day changed. Refresh and try again.");
      let tasks = day.tasks.map((t) => ({ ...t }));
      if (action === "publish") {
        if (!profile.active) throw new Error("Staff access is not active.");
        if (
          !Array.isArray(input.tasks) ||
          !input.tasks.length ||
          input.tasks.length > 80
        )
          throw new Error("Select between 1 and 80 tasks.");
        const incoming = input.tasks.map((t) => normalizeTask(t, profile));
        if (new Set(incoming.map((t) => t.id)).size !== incoming.length)
          throw new Error("Duplicate tasks.");
        const additions = incoming.filter(
          (t) => !tasks.some((existing) => existing.id === t.id),
        );
        if (tasks.length + additions.length > 100)
          throw new Error("A day can contain at most 100 tasks.");
        const claims = await Promise.all(
          additions.map((t) => tx.get(db.doc(`staffTaskClaims/${t.id}`))),
        );
        claims.forEach((claim, i) => {
          if (claim.exists && claim.data().dayId !== recordId)
            throw new Error(
              `${additions[i].label} is already assigned. Remove its pending assignment before assigning it again.`,
            );
        });
        const recurring = new Map(await Promise.all([...new Set(additions.filter((task) => task.type !== 'shared').map((task) => task.roomId).filter(Boolean))]
          .map(async (roomId) => [roomId, await readRoomRecurring(db, roomId, tx)])));
        additions.forEach((task) => { task.recurringTodos = roomRecurringChecklist(task, recurring.get(task.roomId) || [], date); });
        additions.forEach((t) =>
          tx.set(db.doc(`staffTaskClaims/${t.id}`), {
            uid,
            dayId: recordId,
            date,
          }),
        );
        tasks.push(...additions);
      }
      if (action === "removeTask") {
        const task = tasks.find((t) => t.id === input.taskId);
        if (!task || task.status !== "pending")
          throw new Error("Only pending tasks can be removed.");
        tasks = tasks.filter((t) => t.id !== task.id);
        tx.delete(db.doc(`staffTaskClaims/${task.id}`));
      }
      if (action === "setRates") {
        detail = {
          previousRates: tasks.map(({ id, rateVnd }) => ({ id, rateVnd })),
        };
        tasks = tasks.map((t) => ({
          ...t,
          rateVnd: profile.rates[t.type] ?? null,
        }));
        detail.rates = tasks.map(({ id, rateVnd }) => ({ id, rateVnd }));
      }
      if (action === "task") {
        const task = tasks.find((t) => t.id === input.taskId);
        if (!task || !["done", "blocked", "pending"].includes(input.status))
          throw new Error("Task unavailable. Refresh your day.");
        detail = { taskBefore: structuredClone(task) };
        const templates = task.type !== 'shared' ? await readRoomRecurring(db, task.roomId, tx) : [];
        const todos = roomRecurringChecklist(task, templates, date);
        const updates = [];
        if (input.status === 'done') {
          const checks = input.recurringChecks || [];
          if (!Array.isArray(checks) || checks.length > 100 || new Set(checks.map((check) => check.id)).size !== checks.length
            || checks.some((check) => !todos.some((todo) => todo.id === check.id && todo.status !== 'done')))
            throw new Error('The recurring checklist changed. Refresh your day and try again.');
          for (const todo of todos.filter((item) => item.status !== 'done')) {
            const check = checks.find((item) => item.id === todo.id);
            if (!check || (check.completed !== true && !textValue(check.reason)))
              throw new Error(`Confirm ${todo.description}, or explain why it was not completed.`);
            if (check.completed === true) {
              const template = templates.find((item) => item.id === todo.templateId);
              if (!template || template.nextDue !== todo.dueDate)
                throw new Error('This recurring task was already updated. Refresh your day.');
              const nextDue = nextRoomCleaningDue(today, template.frequency || 'monthly');
              updates.push({ todo, nextDue });
              Object.assign(todo, { status: 'done', reason: '', completedAt: now });
            } else Object.assign(todo, { status: 'blocked', reason: textValue(check.reason) });
          }
        }
        task.recurringTodos = todos;
        const reason = textValue(input.reason);
        if (input.status === "blocked" && !reason)
          throw new Error("Explain why the task could not be completed.");
        Object.assign(task, {
          status: input.status,
          reason,
          completedAt: input.status === "done" ? now : "",
          updatedAt: now,
          updatedBy: actor.uid,
        });
        detail.taskAfter = structuredClone(task);
        detail.recurringCompleted = updates.map(({ todo, nextDue }) => ({ templateId: todo.templateId, previousDue: todo.dueDate, nextDue }));
        for (const { todo, nextDue } of updates) {
          tx.update(db.doc(`recurringCleaningTasks/${todo.templateId}`), {
            nextDue, lastCompleted: now, updatedAt: now, updatedBy: actor.uid,
          });
          tx.set(db.doc(`housekeepingOverrides/${todo.id}`), {
            status: 'clean', assignedTo: profile.name, completedAt: now, updatedAt: now, updatedBy: actor.uid,
          }, { merge: true });
        }
        if (task.type !== "shared")
          tx.set(
            db.doc(`housekeepingOverrides/${task.id}`),
            {
              status: input.status === "done" ? "clean" : "dirty",
              assignedTo: profile.name,
              updatedAt: now,
              updatedBy: actor.uid,
            },
            { merge: true },
          );
      }
      const earnings = dayEarnings(tasks);
      const patch = {
        ...day,
        tasks,
        amountVnd: earnings.amountVnd,
        revision: day.revision + 1,
        updatedAt: now,
        updatedBy: actor.uid,
      };
      if (action === "submitDay") {
        if (!old || !tasks.length)
          throw new Error("Your manager needs to assign today’s work first.");
        if (tasks.some((t) => t.status === "pending"))
          throw new Error(
            "Complete each task or explain why it could not be completed.",
          );
        Object.assign(patch, {
          status: "submitted",
          submittedAt: now,
          note: textValue(input.note),
        });
      }
      if (action === "reopenDay") {
        if (day.status !== "submitted")
          throw new Error(
            "Only submitted days can be reopened before approval.",
          );
        if (!textValue(input.reason))
          throw new Error("Enter a correction reason.");
        Object.assign(patch, {
          status: "draft",
          reopenedReason: textValue(input.reason),
          reopenedAt: now,
        });
        detail = { previousDay: day, reason: patch.reopenedReason };
      }
      if (action === "approveDay") {
        if (day.status !== "submitted")
          throw new Error("Only submitted days can be approved.");
        if (earnings.missingRates)
          throw new Error(
            "Set missing rates, reopen the day, and apply the rates before approval.",
          );
        const financeId = `staff_day_${recordId}`;
        const financeRef = db.doc(`financeEntries/${financeId}`);
        const existingFinance = await tx.get(financeRef);
        if (existingFinance.exists)
          throw new Error("A payroll expense already exists for this day.");
        Object.assign(patch, {
          status: "approved",
          approvedAt: now,
          approvedBy: actor.uid,
          financeId: earnings.amountVnd > 0 ? financeId : "",
        });
        if (earnings.amountVnd > 0)
          tx.set(
            financeRef,
            financeEntry({
              date,
              amountVnd: earnings.amountVnd,
              propertyId:
                new Set(
                  tasks
                    .filter((t) => t.status === "done")
                    .map((t) => t.propertyId),
                ).size === 1
                  ? tasks.find((t) => t.status === "done").propertyId
                  : "shared",
              description: `${profile.name} · housekeeping · ${date}`,
              category: "cleaning",
              sourceId: recordId,
              sourceType: "staff_day",
              actor,
              now,
            }),
          );
      }
      tx.set(dayRef, patch);
      if (action === "submitDay" || action === "approveDay")
        detail = { day: patch };
    } else if (action === "purchase") {
      recordId = safeId(input.purchaseId);
      const ref = db.doc(`staffPurchases/${recordId}`);
      if ((await tx.get(ref)).exists)
        throw new Error("Purchase already submitted.");
      const purchase = normalizePurchase(input, profile, today);
      if (input.receiptData) {
        const receipt = input.receiptData;
        if (
          typeof receipt !== "string" ||
          receipt.length > 700000 ||
          !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(receipt)
        )
          throw new Error("Use a JPEG or PNG receipt smaller than 500 KB.");
        const bytes = Buffer.from(receipt.split(",")[1], "base64");
        if (
          !(
            receipt.startsWith("data:image/jpeg;") &&
            bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          ) &&
          !(
            receipt.startsWith("data:image/png;") &&
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
        )
          throw new Error("Invalid receipt image.");
        tx.set(db.doc(`staffReceipts/${recordId}`), {
          uid,
          data: receipt,
          createdAt: now,
        });
      }
      tx.set(ref, {
        ...purchase,
        uid,
        staffName: profile.name,
        createdAt: now,
        createdBy: actor.uid,
      });
    } else if (action === "reviewPurchase") {
      recordId = safeId(input.purchaseId);
      const ref = db.doc(`staffPurchases/${recordId}`),
        snap = await tx.get(ref);
      if (
        !snap.exists ||
        snap.data().uid !== uid ||
        snap.data().status !== "submitted"
      )
        throw new Error("Purchase is not awaiting approval.");
      const purchase = snap.data();
      if (!["approved", "rejected"].includes(input.status))
        throw new Error("Choose approve or reject.");
      if (input.status === "rejected" && !textValue(input.reason))
        throw new Error("Give a reason for rejection.");
      const financeId = `staff_purchase_${recordId}`,
        financeRef = db.doc(`financeEntries/${financeId}`);
      if ((await tx.get(financeRef)).exists)
        throw new Error("Expense already recorded.");
      if (input.status === "approved")
        tx.set(
          financeRef,
          financeEntry({
            ...purchase,
            category: "supplies",
            sourceId: recordId,
            sourceType: "staff_purchase",
            actor,
            now,
            paymentDate: purchase.paidWith === "house" ? purchase.date : "",
            method: purchase.paidWith === "house" ? "House money" : "",
          }),
        );
      tx.update(ref, {
        status: input.status,
        reviewedAt: now,
        reviewedBy: actor.uid,
        reviewReason: textValue(input.reason),
        financeId: input.status === "approved" ? financeId : "",
      });
    } else if (action === "pay") {
      requireDay(input.paymentDate);
      if (input.paymentDate > today || !textValue(input.method, 120))
        throw new Error("Enter an actual payment date and method.");
      if (
        !Array.isArray(input.records) ||
        !input.records.length ||
        input.records.length > 100
      )
        throw new Error("Select approved records to pay.");
      const paths = input.records.map(
        (r) =>
          `${r.kind === "day" ? "staffDays" : r.kind === "purchase" ? "staffPurchases" : "invalid"}/${safeId(r.id)}`,
      );
      if (
        paths.some((p) => p.startsWith("invalid")) ||
        new Set(paths).size !== paths.length
      )
        throw new Error("Invalid payment selection.");
      const records = await Promise.all(
        paths.map((path) => tx.get(db.doc(path))),
      );
      records.forEach((r, i) => {
        if (
          !r.exists ||
          r.data().uid !== uid ||
          r.data().status !== "approved" ||
          (input.records[i].kind === "purchase" &&
            r.data().paidWith !== "personal")
        )
          throw new Error(
            "A selected record is no longer payable. Refresh and try again.",
          );
        if (r.data().date > input.paymentDate)
          throw new Error("Payment cannot precede the work or purchase date.");
      });
      const finances = await Promise.all(
        records.map((r) =>
          r.data().financeId
            ? tx.get(db.doc(`financeEntries/${r.data().financeId}`))
            : null,
        ),
      );
      finances.forEach((f, i) => {
        if (
          records[i].data().amountVnd > 0 &&
          (!f?.exists || f.data().status !== "active" || f.data().paymentDate)
        )
          throw new Error("Linked expense is unavailable or already paid.");
      });
      const payment = {
        paymentDate: input.paymentDate,
        paymentMonth: input.paymentDate.slice(0, 7),
        method: textValue(input.method, 120),
        reference: textValue(input.reference, 200),
        paymentRecordedAt: now,
        paymentRecordedBy: actor.uid,
      };
      records.forEach((r, i) => {
        tx.update(db.doc(paths[i]), { status: "paid", ...payment });
        if (r.data().financeId)
          tx.update(db.doc(`financeEntries/${r.data().financeId}`), payment);
      });
      detail = {
        records: input.records,
        amountVnd: records.reduce(
          (sum, r) => sum + amount(r.data().amountVnd, true),
          0,
        ),
        ...payment,
      };
    } else throw new Error("Unknown action.");
    tx.set(auditRef, {
      action,
      uid,
      recordId,
      actor: actor.uid,
      at: now,
      ...detail,
    });
    return { ok: true };
  });
}
function financeEntry({
  date,
  amountVnd,
  propertyId,
  description,
  category,
  sourceId,
  sourceType,
  actor,
  now,
  paymentDate = "",
  method = "",
}) {
  return {
    kind: "expense",
    date,
    month: date.slice(0, 7),
    amountVnd,
    propertyId,
    description,
    category,
    sourceId,
    sourceType,
    status: "active",
    paymentDate,
    paymentMonth: paymentDate.slice(0, 7),
    method,
    reference: "",
    createdAt: now,
    createdBy: actor.uid,
    createdByName: actor.name || "Manager",
  };
}
