import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import {
  addCharge, applyCredit, applyDepositMovement, applyPayment, buildAlerts,
  createAccount, reviseBillingPlan, money, propertyToday, remaining, reversePayment, syncSchedule, validDate,
} from '../../functions/lib/crmFinance.mjs';

export function subscribeToCrm(db, onData, onError) {
  const stops = ['crmAccounts', 'crmPayments', 'crmAlerts'].map((name) => onSnapshot(
    collection(db, name),
    (snapshot) => onData(name, snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }))),
    (error) => onError(name, new Error(`Guest payment records could not sync (${name}): ${error.message}`)),
  ));
  return () => stops.forEach((stop) => stop());
}

// One account is the serialization point for its bounded charge schedule.
// Receipt history lives in separate documents. A stable action ID makes retries
// idempotent, including after a write succeeded but its response was lost.
export async function saveCrmAction({ db, user, bookingId, actionId, kind, input }) {
  if (!user?.uid) throw new Error('Sign in before changing payments.');
  if (!actionId) throw new Error('Missing payment action ID. Reopen the form.');
  const today = propertyToday();
  const accountRef = doc(db, 'crmAccounts', bookingId);
  const bookingRef = doc(db, 'bookings', bookingId);
  const eventRef = doc(db, 'crmPayments', actionId);
  return runTransaction(db, async (transaction) => {
    const [accountSnap, bookingSnap, eventSnap] = await Promise.all([
      transaction.get(accountRef), transaction.get(bookingRef), transaction.get(eventRef),
    ]);
    if (eventSnap.exists()) return { duplicate: true };
    if (!bookingSnap.exists()) throw new Error('This booking no longer exists.');
    const booking = { ...bookingSnap.data(), id: bookingSnap.id };
    const source = accountSnap.exists() ? accountSnap.data() : null;
    const now = new Date().toISOString();
    let account, event;
    if (kind === 'setup') {
      if (source) throw new Error('Billing was already set up by another staff member. Refresh this guest.');
      account = createAccount(booking, input, today);
      event = { kind: 'setup', amountVnd: 0, note: 'Reviewed billing plan and opening position' };
    } else {
      if (!source) throw new Error('Set up this booking’s billing first.');
      if (kind === 'payment') ({ account, event } = applyPayment(booking, source, input, today));
      else if (kind === 'deposit_movement') ({ account, event } = applyDepositMovement(booking, source, input));
      else if (kind === 'charge') ({ account, event } = addCharge(source, { ...input, id: actionId }));
      else if (kind === 'credit') ({ account, event } = applyCredit(booking, source, input.chargeId));
      else if (kind === 'sync') {
        account = syncSchedule(booking, source, today);
        event = { kind: 'schedule_update', amountVnd: 0, note: 'Updated unpaid future charges from booking; historical charges preserved' };
      } else if (kind === 'plan') {
        if (Number(input.expectedVersion) !== source.version) throw new Error('Another staff member updated this account. Reopen billing settings.');
        const old = source.charges.find((c) => c.id === 'security');
        if (old && money(input.plan.securityDepositVnd) < money(old.paidVnd)) throw new Error('The deposit requirement cannot be reduced below its received amount. Record a refund instead.');
        if (input.correctSchedule && !String(input.note || '').trim()) throw new Error('Enter a reason for correcting the rent schedule.');
        account = reviseBillingPlan(booking, source, input.plan, today, input.correctSchedule);
        const security = account.charges.find((c) => c.id === 'security');
        if (security) {
          security.amountVnd = money(input.plan.securityDepositVnd);
          security.dueDate = input.plan.securityDepositDue;
          security.voided = security.amountVnd === 0;
        }
        event = { kind: 'plan_update', amountVnd: 0, note: input.correctSchedule ? input.note.trim() : 'Changed billing settings; existing due and paid rent preserved', previousPlan: source.plan, plan: input.plan, previousCharges: source.charges };
      } else if (kind === 'adjustment' || kind === 'due_date') {
        account = structuredClone(source);
        const charge = account.charges.find((c) => c.id === input.chargeId && !c.voided);
        if (!charge || !String(input.note || '').trim()) throw new Error('Choose a charge and enter a reason.');
        if (kind === 'adjustment') {
          if (charge.type === 'security' || !Number.isSafeInteger(Number(input.amountVnd)) || Number(input.amountVnd) <= 0 || Number(input.amountVnd) > remaining(charge, booking)) throw new Error('Credit must be within this charge’s outstanding amount.');
          charge.creditVnd = money(charge.creditVnd) + Number(input.amountVnd);
        } else {
          if (!validDate(input.dueDate)) throw new Error('Enter a valid due date.');
          charge.dueDate = input.dueDate;
        }
        account.version++;
        event = { kind, amountVnd: kind === 'adjustment' ? Number(input.amountVnd) : 0, chargeId: charge.id, note: input.note.trim(), ...(kind === 'due_date' ? { dueDate: input.dueDate } : {}) };
      } else if (kind === 'reverse') {
        const originalRef = doc(db, 'crmPayments', input.paymentId);
        const originalSnap = await transaction.get(originalRef);
        if (!originalSnap.exists() || originalSnap.data().bookingId !== bookingId) throw new Error('Payment not found for this booking.');
        ({ account, event } = reversePayment(booking, source, { ...originalSnap.data(), id: originalSnap.id }, input.note));
        transaction.update(originalRef, { reversedBy: actionId, reversedAt: now });
      } else throw new Error('Unknown guest payment action.');
    }
    // These IDs are stable: updating a balance replaces its alert, never adds
    // another copy. Clear resolved alerts in the same atomic account write.
    const beforeAlerts = source ? buildAlerts(booking, source, today) : [];
    const afterAlerts = buildAlerts(booking, account, today);
    const active = new Set(afterAlerts.map((alert) => alert.id));
    for (const alert of beforeAlerts) if (!active.has(alert.id)) transaction.set(doc(db, 'crmAlerts', alert.id), { ...alert, resolved: true, resolvedAt: now }, { merge: true });
    for (const alert of afterAlerts) transaction.set(doc(db, 'crmAlerts', alert.id), { ...alert, resolved: false, updatedAt: now }, { merge: true });
    transaction.set(accountRef, { ...account, updatedAt: now, updatedBy: user.uid, createdAt: source?.createdAt || now });
    transaction.set(eventRef, { ...event, bookingId, guestId: booking.guestId || '', createdAt: now, createdBy: user.uid, createdByName: user.displayName || user.email || 'Staff' });
    return { account, event };
  });
}
