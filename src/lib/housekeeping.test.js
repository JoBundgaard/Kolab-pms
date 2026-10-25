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
