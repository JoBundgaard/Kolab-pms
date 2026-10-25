import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyExportDays } from './weeklyHousekeepingExport.js';
import { normalizeHousekeepingTasks } from './housekeeping.js';

test('community export includes only long-term weekly cleans and omits staff details', () => {
  const base = { roomLabel: 'T1', propertyName: 'Townhouse', guestName: 'Ana Tanure', priority: 1, status: 'dirty', assignedTo: 'Private staff' };
  const days = buildWeeklyExportDays([[
    { ...base, type: 'weekly', stayCategory: 'long' },
    { ...base, roomLabel: 'N3', type: 'weekly', isLongTerm: true },
    { ...base, type: 'weekly', stayCategory: 'medium' },
    { ...base, type: 'checkout', stayCategory: 'long' },
    { ...base, type: 'check_room', stayCategory: 'long' },
  ], []], 'community');
  assert.equal(days.length, 2);
  assert.equal(days[0].length, 2);
  assert.deepEqual(Object.keys(days[0][0]).sort(), ['guestName', 'propertyName', 'roomLabel', 'type']);
  assert.equal(days[0][0].guestName, 'Ana Tanure');
  assert.deepEqual(days[1], []);
});

test('housekeeping export retains every task and its assignment and completion details', () => {
  const tasks = [{ type: 'check_room', priority: 2, status: 'clean', assignedTo: 'Staff', guestName: 'Guest', roomLabel: 'T1' }, { type: 'checkout', priority: 1, checkOutTime: '11:00', roomLabel: 'T2' }];
  const [day] = buildWeeklyExportDays([tasks], 'housekeeping');
  assert.equal(day.length, 2);
  assert.equal(day[0].type, 'checkout');
  assert.equal(day[0].checkOutTime, '11:00');
  assert.equal(day[1].assignedTo, 'Staff');
  assert.equal(day[1].status, 'clean');
  assert.equal(tasks[0].type, 'check_room');
});

test('guest and stay details flow from booking to community schedule on the correct day', () => {
  const booking = { id: 'guest', sourceBookingId: 'original', roomId: 'T1', guestName: 'Long-term guest', stayCategory: 'long', weeklyCleaningDay: 'monday', checkIn: '2026-10-01', checkOut: '2026-11-30', checkInTime: '16:00' };
  const tasks = normalizeHousekeepingTasks({ bookings: [booking], rooms: [{ id: 'T1', name: 'T1', propertyName: 'Townhouse' }], targetDate: '2026-10-26' });
  const [[entry]] = buildWeeklyExportDays([tasks], 'community');
  assert.equal(entry.guestName, booking.guestName);
  assert.equal(entry.roomLabel, 'T1');
  const awayTasks = normalizeHousekeepingTasks({ bookings: [{ ...booking, guestBreakPeriods: [{ startDate: '2026-10-25', endDate: '2026-10-29' }] }], targetDate: '2026-10-26' });
  assert.deepEqual(buildWeeklyExportDays([awayTasks], 'community'), [[]]);
});
