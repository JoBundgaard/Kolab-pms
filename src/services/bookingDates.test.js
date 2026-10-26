import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHousekeepingTasks } from '../lib/housekeeping.js';
import {
  bookingOccupiesDate,
  countBookingBreakNightsForRange,
  expandBookingToRoomStays,
  getBookingRoomIdForDate,
  getBookingStaySegments,
  isHousekeepingBooking,
} from '../lib/bookingDates.js';
const guest = { id: 'guest', roomId: 'a', checkIn: '2026-10-20', checkOut: '2026-11-05' };

test('room switch departs and arrives on October 29 with no gap', () => {
  const booking = { ...guest, roomMoves: [{ moveDate: '2026-10-29', roomId: 'b' }] };
  assert.equal(bookingOccupiesDate(booking, '2026-10-28', 'a'), true);
  assert.equal(bookingOccupiesDate(booking, '2026-10-29', 'a'), false);
  assert.equal(bookingOccupiesDate(booking, '2026-10-29', 'b'), true);
  assert.equal(getBookingStaySegments(booking)[0].endDate, '2026-10-29');
  assert.equal(getBookingStaySegments(booking)[1].startDate, '2026-10-29');
});

test('switching to direct billing does not require a legacy paid flag', () => {
  const booking = { ...guest, channel: 'airbnb', roomMoves: [{ moveDate: '2026-10-29', roomId: 'b', useDifferentChannel: true, channel: 'direct' }] };
  assert.equal(getBookingStaySegments(booking)[1].channel, 'direct');
  assert.equal(getBookingRoomIdForDate(booking, '2026-10-29'), 'b');
});

test('break until October 29 returns on October 29 and deducts only away nights', () => {
  const booking = { ...guest, sellRoomDuringBreak: true, guestBreakPeriods: [{ startDate: '2026-10-25', endDate: '2026-10-29' }] };
  assert.equal(bookingOccupiesDate(booking, '2026-10-25', 'a'), false);
  assert.equal(bookingOccupiesDate(booking, '2026-10-28', 'a'), false);
  assert.equal(bookingOccupiesDate(booking, '2026-10-29', 'a'), true);
  assert.equal(countBookingBreakNightsForRange(booking, '2026-10-01', '2026-11-01'), 4);
  assert.equal(countBookingBreakNightsForRange(booking, '2026-10-29', '2026-10-30'), 0);
  const tasks = normalizeHousekeepingTasks({ bookings: [{ ...booking, isLongTerm: true, weeklyCleaningDay: 'thursday' }], targetDate: '2026-10-29' });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].type, 'weekly');
});

test('return from break and room switch can happen on the same day', () => {
  const booking = { ...guest, guestBreakPeriods: [{ startDate: '2026-10-25', endDate: '2026-10-29' }], roomMoves: [{ moveDate: '2026-10-29', roomId: 'b' }] };
  assert.equal(bookingOccupiesDate(booking, '2026-10-29', 'a'), false);
  assert.equal(bookingOccupiesDate(booking, '2026-10-29', 'b'), true);
});


test('room move on the 31st creates checkout clean in old room before same-day arrival', () => {
  const movingGuest = { ...guest, roomMoves: [{ moveDate: '2026-10-31', roomId: 'b' }] };
  const stays = expandBookingToRoomStays(movingGuest);
  const incoming = { id: 'incoming', roomId: 'a', checkIn: '2026-10-31', checkOut: '2026-11-05' };
  const tasks = normalizeHousekeepingTasks({ bookings: [...stays, incoming], targetDate: '2026-10-31' });
  const oldRoomTasks = tasks.filter((task) => task.roomId === 'a');
  assert.equal(oldRoomTasks.length, 1);
  assert.equal(oldRoomTasks[0].type, 'checkout');
});


test('Ana-style legacy booking without status still creates T1 checkout on October 31', () => {
  const movingGuest = { id: 'legacy-guest', roomId: 'T1', checkIn: '2026-10-25', checkOut: '2026-11-13', roomMoves: [{ moveDate: '2026-10-31', roomId: 'N3' }] };
  const incoming = { id: 'incoming-t1', status: 'confirmed', roomId: 'T1', checkIn: '2026-10-31', checkOut: '2026-11-05' };
  const stays = [movingGuest].filter(isHousekeepingBooking).flatMap(expandBookingToRoomStays);
  const tasks = normalizeHousekeepingTasks({ bookings: [...stays, incoming], targetDate: '2026-10-31' });
  const t1Tasks = tasks.filter((task) => task.roomId === 'T1');
  assert.equal(t1Tasks.length, 1);
  assert.equal(t1Tasks[0].type, 'checkout');
  assert.equal(tasks.find((task) => task.roomId === 'N3').type, 'check_room');
  for (const status of ['cancelled', 'inquiry', 'pending']) {
    assert.equal(isHousekeepingBooking({ ...movingGuest, status }), false);
  }
  for (const status of [undefined, '', 'confirmed', 'checked-in', 'checked-out']) {
    assert.equal(isHousekeepingBooking({ ...movingGuest, status }), true);
  }
});
