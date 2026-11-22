import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHousekeepingTasks } from './housekeeping.js';

const departing = { id: 'old', roomId: 'a', checkIn: '2026-10-01', checkOut: '2026-10-20' };
const arriving = { id: 'new', roomId: 'a', checkIn: '2026-10-23', checkOut: '2026-10-27' };
const tasks = (bookings, targetDate = '2026-10-23', overrides = {}) => normalizeHousekeepingTasks({ bookings, targetDate, overrides });

test('Tuesday checkout and Friday arrival produce an arrival-day room check', () => {
  assert.equal(tasks([departing, arriving], '2026-10-20')[0].type, 'checkout');
  assert.deepEqual(tasks([departing, arriving], '2026-10-22'), []);
  const friday = tasks([departing, arriving]);
  assert.equal(friday.length, 1);
  assert.equal(friday[0].type, 'check_room');
  assert.equal(friday[0].roomId, 'a');
  assert.equal(friday[0].dueDate, '2026-10-23');
});

test('same-day checkout covers arrival inspection regardless of booking order', () => {
  const checkout = { ...departing, checkOut: arriving.checkIn };
  for (const bookings of [[checkout, arriving], [arriving, checkout]]) {
    assert.deepEqual(tasks(bookings).map((task) => task.type), ['checkout']);
  }
});

test('checkout in a different room does not suppress the room check', () => {
  assert.deepEqual(tasks([{ ...departing, roomId: 'b', checkOut: arriving.checkIn }, arriving]).map((task) => task.type), ['checkout', 'check_room']);
});

test('cancelled arrivals are ignored and cancelled checkouts do not suppress checks', () => {
  assert.deepEqual(tasks([{ ...arriving, status: 'cancelled' }]), []);
  assert.equal(tasks([{ ...departing, checkOut: arriving.checkIn, status: 'cancelled' }, arriving])[0].type, 'check_room');
});

test('room checks preserve completion, assignment and priority overrides', () => {
  const [task] = tasks([arriving]);
  const [updated] = tasks([arriving], arriving.checkIn, { [task.id]: { status: 'clean', assignedTo: 'Staff', priority: 4 } });
  assert.equal(updated.status, 'clean');
  assert.equal(updated.assignedTo, 'Staff');
  assert.equal(updated.priority, 4);
});

test('no inspection while guest is away and weekly cleans remain available', () => {
  assert.deepEqual(tasks([{ ...arriving, guestBreakPeriods: [{ startDate: '2026-10-23', endDate: '2026-10-25' }] }]), []);
  assert.equal(tasks([{ ...departing, checkOut: '2026-10-30', isLongTerm: true, weeklyCleaningDay: 'friday' }])[0].type, 'weekly');
});

test('calendar task dates and weekly weekdays do not shift on devices west of UTC', async () => {
  const { execFileSync } = await import('node:child_process');
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { normalizeHousekeepingTasks } from './src/lib/housekeeping.js';
    const tasks = normalizeHousekeepingTasks({ bookings: [{ id: 'weekly', roomId: 'T1', checkIn: '2026-10-01', checkOut: '2026-12-01', isLongTerm: true, weeklyCleaningDay: 'tuesday' }], rooms: [{ id: 'T1' }], targetDate: '2026-11-03' });
    console.log(JSON.stringify(tasks));
  `], { cwd: new URL('../../', import.meta.url), env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  const tasks = JSON.parse(output);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].dueDate, '2026-11-03');
  assert.equal(tasks[0].type, 'weekly');
});

test('day-specific type edits retain stable task identity, completion and booking dates', () => {
  const [original] = tasks([arriving]);
  const overrides = { [original.id]: { type: 'custom', description: 'Clean balcony', status: 'clean', assignedTo: 'Thanh', priority: 7 } };
  const [edited] = tasks([arriving], arriving.checkIn, overrides);
  assert.equal(edited.id, original.id);
  assert.equal(edited.scheduledType, 'check_room');
  assert.equal(edited.type, 'custom');
  assert.equal(edited.description, 'Clean balcony');
  assert.equal(edited.status, 'clean');
  assert.equal(edited.assignedTo, 'Thanh');
  assert.equal(arriving.checkOut, '2026-10-27');
  assert.equal(tasks([arriving], arriving.checkOut, overrides)[0].type, 'checkout');
  overrides[original.id].type = null;
  assert.equal(tasks([arriving], arriving.checkIn, overrides)[0].type, 'check_room');
  assert.equal(tasks([arriving], arriving.checkIn, overrides)[0].description, '');
});

test('changing an arrival check to weekly does not make the booking reschedulable', () => {
  const [original] = tasks([arriving]);
  const [edited] = tasks([arriving], arriving.checkIn, { [original.id]: { type: 'weekly' } });
  assert.equal(edited.type, 'weekly');
  assert.equal(edited.scheduledType, 'check_room');
});

test('skipping a cleaning excludes only that occurrence and allows restoring its overrides', () => {
  const booking = { ...departing, checkOut: '2026-12-01', isLongTerm: true, weeklyCleaningDay: 'friday' };
  const [original] = tasks([booking]);
  const overrides = { [original.id]: { skipped: true, assignedTo: 'Thanh', priority: 7 } };
  assert.deepEqual(tasks([booking], '2026-10-23', overrides), []);
  const [skipped] = normalizeHousekeepingTasks({ bookings: [booking], targetDate: '2026-10-23', overrides, includeSkipped: true });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.assignedTo, 'Thanh');
  assert.equal(tasks([booking], '2026-10-30', overrides).length, 1);
  overrides[original.id].skipped = false;
  const [restored] = tasks([booking], '2026-10-23', overrides);
  assert.equal(restored.id, original.id);
  assert.equal(restored.assignedTo, 'Thanh');
  assert.equal(restored.priority, 7);
  assert.equal(booking.weeklyCleaningDay, 'friday');
});

test('skipping one room leaves other cleaning and inspection tasks available', () => {
  const checkout = { ...departing, checkOut: arriving.checkIn, roomId: 'b' };
  const [cleaning] = tasks([checkout]);
  assert.deepEqual(tasks([checkout, arriving], arriving.checkIn, { [cleaning.id]: { skipped: true } }).map((task) => task.type), ['check_room']);
});
