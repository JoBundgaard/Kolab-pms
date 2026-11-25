export const TASK_TYPES = [
  "checkout",
  "weekly",
  "check_room",
  "shared",
  "recurring",
];
export const PROPERTY_IDS = ["prop_1", "prop_2", "prop_3"];
export const staffToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const validDay = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export function requireDay(s) {
  if (!validDay(s)) throw new Error("Choose a valid date.");
  return s;
}
export function addStaffDays(s, count) {
  requireDay(s);
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function weekStart(s) {
  requireDay(s);
  const day = new Date(`${s}T00:00:00Z`).getUTCDay();
  return addStaffDays(s, day === 0 ? -6 : 1 - day);
}
export function textValue(v, max = 500) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}
export function safeId(v) {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,180}$/.test(v))
    throw new Error("Invalid record ID.");
  return v;
}
export function amount(v, allowZero = false) {
  if (v === "" || v == null) throw new Error("Enter an amount in VND.");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 1000000000)
    throw new Error("Enter a valid whole VND amount.");
  return n;
}
export function normalizeProfile(input) {
  const name = textValue(input.name, 100),
    email = textValue(input.email, 200).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a name and valid Google email.");
  const propertyIds = [...new Set(input.propertyIds || [])];
  if (
    !propertyIds.length ||
    propertyIds.some((id) => !PROPERTY_IDS.includes(id))
  )
    throw new Error("Select at least one property.");
  const rates = Object.fromEntries(
    TASK_TYPES.map((type) => [
      type,
      input.rates?.[type] == null || input.rates[type] === ""
        ? null
        : amount(input.rates[type], true),
    ]),
  );
  return {
    name,
    email,
    propertyIds,
    rates,
    active: input.active !== false,
    language: input.language === "vi" ? "vi" : "en",
    payBasis: "per_clean",
  };
}
export function normalizeTask(input, profile) {
  const id = safeId(input.id);
  if (
    !TASK_TYPES.includes(input.type) ||
    !profile.propertyIds.includes(input.propertyId)
  )
    throw new Error(
      "Task type or property is not available to this staff member.",
    );
  const label = textValue(input.label, 150);
  if (!label) throw new Error("Enter a room or task name.");
  return {
    id,
    type: input.type,
    propertyId: input.propertyId,
    label,
    roomId: textValue(input.roomId, 80),
    instructions: textValue(input.instructions),
    availableAfter: textValue(input.availableAfter, 5),
    dueBy: textValue(input.dueBy, 5),
    status: "pending",
    reason: "",
    rateVnd: profile.rates?.[input.type] ?? null,
  };
}
export function dayEarnings(tasks = []) {
  const completed = tasks.filter((t) => t.status === "done");
  const missingRates = completed.some((t) => t.rateVnd == null);
  return {
    completed: completed.length,
    total: tasks.length,
    missingRates,
    amountVnd: missingRates
      ? null
      : completed.reduce((sum, task) => sum + amount(task.rateVnd, true), 0),
  };
}
export function normalizePurchase(input, profile, today = staffToday()) {
  requireDay(input.date);
  if (input.date > today) throw new Error("Purchases cannot be in the future.");
  if (!profile.propertyIds.includes(input.propertyId))
    throw new Error("Choose one of your properties.");
  if (!["personal", "house"].includes(input.paidWith))
    throw new Error("Choose whose money was used.");
  const description = textValue(input.description);
  if (!description) throw new Error("Describe the purchase.");
  const receiptMissingReason = textValue(input.receiptMissingReason);
  if (!input.receiptData && !receiptMissingReason)
    throw new Error("Attach a receipt or explain why it is unavailable.");
  return {
    date: input.date,
    week: weekStart(input.date),
    propertyId: input.propertyId,
    description,
    amountVnd: amount(input.amountVnd),
    paidWith: input.paidWith,
    receiptMissingReason,
    hasReceipt: !!input.receiptData,
    status: "submitted",
  };
}
export function weeklySummary(days = [], purchases = []) {
  const sum = (rows) => rows.reduce((n, r) => n + (r.amountVnd ?? 0), 0);
  return {
    wagesVnd: sum(days),
    missingRates: days.some((d) => d.amountVnd == null),
    approvedWagesVnd: sum(days.filter((d) => d.status === "approved")),
    reimbursementsVnd: sum(
      purchases.filter(
        (p) => p.paidWith === "personal" && p.status !== "rejected",
      ),
    ),
    approvedReimbursementsVnd: sum(
      purchases.filter(
        (p) => p.paidWith === "personal" && p.status === "approved",
      ),
    ),
    paidVnd:
      sum(days.filter((d) => d.status === "paid")) +
      sum(
        purchases.filter(
          (p) => p.paidWith === "personal" && p.status === "paid",
        ),
      ),
  };
}
