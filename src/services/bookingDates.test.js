import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeHousekeepingTasks } from '../lib/housekeeping.js';

// Exercise the app's actual date helpers without loading React or Firebase.
const source = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const names = ['normalizeRoomMoves', 'getBookingStaySegments', 'getBookingRoomIdForDate', 'normalizeBookingBreaks', 'countBookingBreakNightsForRange', 'isDateOnBookingBreak', 'bookingOccupiesDate', 'expandBookingToRoomStays'];
const context = vm.createContext({
  formatDate: (value) => value || '',
  randomId: () => 'test',
  getBookingOccupancyCheckOut: (booking) => booking.checkOut,
  getBookingFinancialCheckOut: (booking) => booking.checkOut,
});
for (const name of names) {
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf('\n};', start) + 3;
  vm.runInContext(source.slice(start, end), context);
}
vm.runInContext(source.match(/const isBlockingStatus = [\s\S]*?\n};/)[0], context);
vm.runInContext(source.match(/const isHousekeepingBooking = .*;/)[0], context);
const run = (expression, booking) => {
  context.booking = booking;
  return vm.runInContext(expression, context);
};
const guest = { id: 'guest', roomId: 'a', checkIn: '2026-10-20', checkOut: '2026-11-05' };

test('room switch departs and arrives on October 29 with no gap', () => {
  const booking = { ...guest, roomMoves: [{ moveDate: '2026-10-29', roomId: 'b' }] };
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-28', 'a')", booking), true);
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-29', 'a')", booking), false);
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-29', 'b')", booking), true);
  assert.equal(run('getBookingStaySegments(booking)[0].endDate', booking), '2026-10-29');
  assert.equal(run('getBookingStaySegments(booking)[1].startDate', booking), '2026-10-29');
});

test('break until October 29 returns on October 29 and deducts only away nights', () => {
  const booking = { ...guest, sellRoomDuringBreak: true, guestBreakPeriods: [{ startDate: '2026-10-25', endDate: '2026-10-29' }] };
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-25', 'a')", booking), false);
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-28', 'a')", booking), false);
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-29', 'a')", booking), true);
  assert.equal(run("countBookingBreakNightsForRange(booking, '2026-10-01', '2026-11-01')", booking), 4);
  assert.equal(run("countBookingBreakNightsForRange(booking, '2026-10-29', '2026-10-30')", booking), 0);
  const tasks = normalizeHousekeepingTasks({ bookings: [{ ...booking, isLongTerm: true, weeklyCleaningDay: 'thursday' }], targetDate: '2026-10-29' });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].type, 'weekly');
});

test('return from break and room switch can happen on the same day', () => {
  const booking = { ...guest, guestBreakPeriods: [{ startDate: '2026-10-25', endDate: '2026-10-29' }], roomMoves: [{ moveDate: '2026-10-29', roomId: 'b' }] };
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-29', 'a')", booking), false);
  assert.equal(run("bookingOccupiesDate(booking, '2026-10-29', 'b')", booking), true);
});


test('room move on the 31st creates checkout clean in old room before same-day arrival', () => {
  const movingGuest = { ...guest, roomMoves: [{ moveDate: '2026-10-31', roomId: 'b' }] };
  const stays = run('expandBookingToRoomStays(booking)', movingGuest);
  const incoming = { id: 'incoming', roomId: 'a', checkIn: '2026-10-31', checkOut: '2026-11-05' };
  const tasks = normalizeHousekeepingTasks({ bookings: [...stays, incoming], targetDate: '2026-10-31' });
  const oldRoomTasks = tasks.filter((task) => task.roomId === 'a');
  assert.equal(oldRoomTasks.length, 1);
  assert.equal(oldRoomTasks[0].type, 'checkout');
});


test('Ana-style legacy booking without status still creates T1 checkout on October 31', () => {
  const movingGuest = { id: 'legacy-guest', roomId: 'T1', checkIn: '2026-10-25', checkOut: '2026-11-13', roomMoves: [{ moveDate: '2026-10-31', roomId: 'N3' }] };
  const incoming = { id: 'incoming-t1', status: 'confirmed', roomId: 'T1', checkIn: '2026-10-31', checkOut: '2026-11-05' };
  const stays = run('[booking].filter(isHousekeepingBooking).flatMap(expandBookingToRoomStays)', movingGuest);
  const tasks = normalizeHousekeepingTasks({ bookings: [...stays, incoming], targetDate: '2026-10-31' });
  const t1Tasks = tasks.filter((task) => task.roomId === 'T1');
  assert.equal(t1Tasks.length, 1);
  assert.equal(t1Tasks[0].type, 'checkout');
  assert.equal(tasks.find((task) => task.roomId === 'N3').type, 'check_room');
  for (const status of ['cancelled', 'inquiry', 'pending']) {
    assert.equal(run('isHousekeepingBooking(booking)', { ...movingGuest, status }), false);
  }
  for (const status of [undefined, '', 'confirmed', 'checked-in', 'checked-out']) {
    assert.equal(run('isHousekeepingBooking(booking)', { ...movingGuest, status }), true);
  }
});
