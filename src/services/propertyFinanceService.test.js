import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeFinanceEntry, validFinanceMonth } from '../lib/propertyFinance.js';

const source = readFileSync(new URL('./propertyFinanceService.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replaceAll('export ', '');
function database() {
  const records = new Map();
  const versions = new Map();
  const listeners = [];
  const context = vm.createContext({ normalizeFinanceEntry, validFinanceMonth, Date, String, Error, Map, Set, Object,
    doc: (_db, _collection, id) => id,
    collection: (_db, name) => name, where: (field, _operator, value) => ({ field, value }), query: (_collection, condition) => condition,
    onSnapshot: (condition, _options, next, error) => { const listener = { condition, next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; },
    runTransaction: async (_db, callback) => {
      for (let i = 0; i < 20; i++) {
        const reads = new Map(), writes = [];
        const result = await callback({ get: async (id) => { reads.set(id, versions.get(id)); return { exists: () => records.has(id), data: () => structuredClone(records.get(id)) }; },
          set: (id, data) => writes.push([id, data]), update: (id, patch) => writes.push([id, { ...records.get(id), ...patch }]) });
        if ([...reads].some(([id, version]) => versions.get(id) !== version)) continue;
        for (const [id, data] of writes) { records.set(id, structuredClone(data)); versions.set(id, (versions.get(id) || 0) + 1); }
        return result;
      }
      throw new Error('Retry limit');
    },
  });
  vm.runInContext(source, context);
  return { context, records, listeners };
}
const user = { uid: 'staff' };
const input = { kind: 'expense', category: 'cleaning', amountVnd: 100000, date: '2026-10-01', propertyId: 'prop_1', description: 'Cleaning' };

test('concurrent retries write a finance entry exactly once', async () => {
  const { context, records } = database();
  const results = await Promise.all([1, 2].map(() => context.saveFinanceEntry({ db: {}, user, actionId: 'same-action', input })));
  assert.equal(records.size, 1);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  assert.equal(records.get('same-action').createdBy, 'staff');
});

test('settling preserves the original expense; void retains history and requires a reason', async () => {
  const { context, records } = database();
  await context.saveFinanceEntry({ db: {}, user, actionId: 'bill', input });
  await context.settleFinanceEntry({ db: {}, user, entryId: 'bill', paymentDate: '2026-10-15', method: 'Cash', reference: 'receipt' });
  assert.equal(records.get('bill').month, '2026-10');
  assert.equal(records.get('bill').paymentDate, '2026-10-15');
  await assert.rejects(context.settleFinanceEntry({ db: {}, user, entryId: 'bill', paymentDate: '2026-10-16', method: 'Cash' }), /already recorded/);
  await assert.rejects(context.voidFinanceEntry({ db: {}, user, entryId: 'bill', reason: '' }), /reason/);
  await context.voidFinanceEntry({ db: {}, user, entryId: 'bill', reason: 'Duplicate bill' });
  assert.equal(records.get('bill').status, 'void');
  assert.equal(records.get('bill').amountVnd, 100000);
  assert.equal(records.get('bill').voidReason, 'Duplicate bill');
});

test('month subscriptions deduplicate period and payment matches and clean up both listeners', () => {
  const { context, listeners } = database();
  const outputs = [];
  const stop = context.subscribeToFinance({}, '2026-10', (entries, ready) => outputs.push({ entries, ready }), () => {});
  const snap = (cached) => ({ docs: [{ id: 'one', data: () => ({ ...input }) }], metadata: { fromCache: cached } });
  listeners[0].next(snap(true)); listeners[1].next(snap(false));
  assert.equal(outputs.at(-1).ready, false);
  listeners[0].next(snap(false));
  assert.equal(outputs.at(-1).ready, true);
  assert.equal(outputs.at(-1).entries.length, 1);
  stop(); assert.ok(listeners.every((l) => l.stopped));
});

test('linked staff expenses cannot be separately paid or voided through Finance', async () => {
  const { context, records } = database();
  records.set('staff-expense', { ...input, status: 'active', sourceType: 'staff_day', sourceId: 'worker_2026-11-03' });
  await assert.rejects(context.settleFinanceEntry({ db: {}, user, entryId: 'staff-expense', paymentDate: '2026-11-03', method: 'Cash' }), /Staff & pay/);
  await assert.rejects(context.voidFinanceEntry({ db: {}, user, entryId: 'staff-expense', reason: 'Mistake' }), /Staff & pay/);
  assert.equal(records.get('staff-expense').status, 'active');
  assert.equal(records.get('staff-expense').paymentDate, undefined);
});
