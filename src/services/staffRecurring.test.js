import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRoomCleaningDue } from '../../functions/lib/staffRecurring.mjs';

test('room cleaning counters start from completion and clamp month ends', () => {
  assert.equal(nextRoomCleaningDue('2026-11-03', 'monthly'), '2026-12-03');
  assert.equal(nextRoomCleaningDue('2027-01-31', 'monthly'), '2027-02-28');
  assert.equal(nextRoomCleaningDue('2028-01-31', 'monthly'), '2028-02-29');
  assert.equal(nextRoomCleaningDue('2028-02-29', 'yearly'), '2029-02-28');
  assert.equal(nextRoomCleaningDue('2026-11-03', 'weekly'), '2026-11-10');
  assert.equal(nextRoomCleaningDue('2026-11-03', 'every_45_days'), '2026-12-18');
  assert.equal(nextRoomCleaningDue('2026-11-03', 'bimonthly'), '2027-01-03');
  assert.throws(() => nextRoomCleaningDue('2026-11-03', 'invalid'), /valid frequency/);
});
