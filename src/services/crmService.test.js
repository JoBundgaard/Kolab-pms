import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as finance from '../../functions/lib/crmFinance.mjs';

// Exercise the actual service with a small optimistic-transaction adapter.
// Concurrent commits retry the callback after a conflicting document version,
// which is the Firestore contract relied on by the payment service.
const source = readFileSync(new URL('./crmService.js', import.meta.url), 'utf8')
  .replace(/import[\s\S]*?from 'firebase\/firestore';/, '')
  .replace(/import[\s\S]*?from '\.\.\/\.\.\/functions\/lib\/crmFinance\.mjs';/, '')
  .replaceAll('export ', '');
const today = '2026-10-25';
const booking = { id: 'test-booking', guestId: 'test-guest', channel: 'direct', roomId: 'T1', checkIn: '2026-10-01', checkOut: '2026-11-01', monthlyRentVnd: 10000000, price: 10000000, stayCategory: 'long' };
const user = { uid: 'staff', displayName: 'Staff member' };

function database() {
  const documents = new Map([['bookings/test-booking', structuredClone(booking)]]);
  const versions = new Map();
  const db = {};
  const runTransaction = async (_db, callback) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const reads = new Map(), writes = [];
      const transaction = {
        get: async (ref) => {
          reads.set(ref.path, versions.get(ref.path) || 0);
          const value = structuredClone(documents.get(ref.path));
          return { id: ref.path.split('/').at(-1), exists: () => value !== undefined, data: () => structuredClone(value) };
        },
        set: (ref, data, options) => writes.push({ ref, data: structuredClone(data), merge: options?.merge }),
        update: (ref, data) => writes.push({ ref, data: structuredClone(data), merge: true }),
      };
      const result = await callback(transaction);
      if ([...reads].some(([path, version]) => (versions.get(path) || 0) !== version)) continue;
      for (const { ref, data, merge } of writes) {
        documents.set(ref.path, merge ? { ...documents.get(ref.path), ...data } : data);
        versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
      }
      return result;
    }
    throw new Error('Transaction retry limit');
  };
  const context = vm.createContext({ ...finance, propertyToday: () => today, structuredClone, Date, Map, Set, Promise, Error, Number, String, Object, doc: (_db, collection, id) => ({ path: `${collection}/${id}` }), runTransaction });
  vm.runInContext(source, context);
  const action = (kind, input, actionId) => context.saveCrmAction({ db, user, bookingId: booking.id, kind, input, actionId });
  const setup = (patch = {}) => action('setup', { ...finance.defaultPlan(booking, today), trackingStart: booking.checkIn, firstDueDate: '2026-10-05', ...patch }, 'setup');
  return { documents, action, setup, account: () => documents.get(`crmAccounts/${booking.id}`) };
}
const payment = (amountVnd, target = 'oldest') => ({ target, amountVnd, receivedDate: today, method: 'Bank transfer', reference: 'bank-123' });

test('setup writes account, audit record and internal alerts atomically, with no invented receipt', async () => {
  const db = database();
  await db.setup();
  assert.equal(db.account().charges[0].paidVnd, 0);
  assert.equal(db.documents.get('crmPayments/setup').kind, 'setup');
  assert.equal(db.documents.get('crmPayments/setup').createdBy, 'staff');
  assert.equal([...db.documents.keys()].filter((key) => key.startsWith('crmAlerts/')).length, 1);
  await assert.rejects(db.action('setup', finance.defaultPlan(booking, today), 'other-setup'), /already set up/);
});

test('retrying the same payment action records money exactly once', async () => {
  const db = database();
  await db.setup();
  await Promise.all([db.action('payment', payment(6000000), 'receipt-1'), db.action('payment', payment(6000000), 'receipt-1')]);
  assert.equal(db.account().charges[0].paidVnd, 6000000);
  assert.equal([...db.documents.keys()].filter((key) => key === 'crmPayments/receipt-1').length, 1);
  assert.equal(db.account().unallocatedVnd, 0);
});

test('two staff can record concurrent receipts without losing money or overpaying a charge', async () => {
  const db = database();
  await db.setup();
  // Each staff member targets the same charge from their original snapshot.
  const target = db.account().charges[0].id;
  await Promise.all([db.action('payment', payment(6000000, target), 'staff-a'), db.action('payment', payment(6000000, target), 'staff-b')]);
  assert.equal(db.account().charges[0].paidVnd, 10000000);
  assert.equal(db.account().unallocatedVnd, 2000000);
  assert.equal(db.documents.get('crmPayments/staff-a').amountVnd + db.documents.get('crmPayments/staff-b').amountVnd, 12000000);
  assert.equal([...db.documents.values()].some((entry) => entry.resolved === false && entry.type === 'payment'), false);
});

test('concurrent security payments cannot exceed the deposit requirement', async () => {
  const db = database();
  await db.setup({ securityDepositVnd: 5000000, securityDepositDue: today });
  const outcomes = await Promise.allSettled([db.action('payment', payment(3000000, 'security'), 'deposit-a'), db.action('payment', payment(3000000, 'security'), 'deposit-b')]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  assert.equal(db.account().charges.find((c) => c.id === 'security').paidVnd, 3000000);
});

test('payment reversal preserves the original and restores its collection alert', async () => {
  const db = database();
  await db.setup();
  await db.action('payment', payment(10000000), 'receipt');
  await db.action('reverse', { paymentId: 'receipt', note: 'Wrong guest' }, 'undo');
  assert.equal(db.documents.get('crmPayments/receipt').reversedBy, 'undo');
  assert.equal(db.documents.get('crmPayments/receipt').amountVnd, 10000000);
  assert.equal(db.account().charges[0].paidVnd, 0);
  assert.equal([...db.documents.values()].some((entry) => entry.resolved === false && entry.type === 'payment'), true);
  await assert.rejects(db.action('reverse', { paymentId: 'receipt', note: 'Again' }, 'undo-again'), /unreversed/);
});

test('billing correction audits replaced overdue rent and resolves its old alert atomically', async () => {
  const db = database();
  await db.setup({ periodBasis: 'calendar' });
  const before = structuredClone(db.account());
  const plan = { ...before.plan, periodBasis: 'anniversary', cycleAnchor: booking.checkIn, trackingStart: '2026-10-24', firstDueDate: '2026-10-24' };
  await assert.rejects(db.action('plan', { plan, expectedVersion: before.version, correctSchedule: true }, 'missing-reason'), /reason/);
  await db.action('plan', { plan, expectedVersion: before.version, correctSchedule: true, note: 'Rent already paid until October 24' }, 'correct');
  const summary = finance.accountSummary(booking, db.account(), today);
  assert.equal(summary.totalOutstanding, Math.round(10000000 * 8 / 31));
  assert.equal(summary.openCharges.length, 1);
  assert.equal(db.documents.get('crmPayments/correct').previousCharges[0].amountVnd, 10000000);
  assert.ok([...db.documents.values()].some((entry) => entry.resolved === true));
  await assert.rejects(db.action('plan', { plan, expectedVersion: before.version, correctSchedule: true, note: 'Stale form' }, 'stale'), /Another staff/);
});
