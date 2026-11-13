import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomTransferPlan, transferRoomWithinDates } from './roomTransfers.js';

const roomAtDate = (booking, date) => [...(booking.roomMoves || [])].sort((a, b) => a.moveDate.localeCompare(b.moveDate)).reduce((room, move) => move.moveDate <= date ? move.roomId : room, booking.roomId);
const occupiedDates = (booking, room) => {
  const dates = [];
  for (let time = Date.parse(booking.checkIn); time < Date.parse(booking.checkOut); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if ((!room || roomAtDate(booking, date) === room) && !(booking.breakDates || []).includes(date)) dates.push(date);
  }
  return dates;
};
const helpers = { roomAtDate, occupiedDates, isBlocking: (status) => status !== 'cancelled' };
const guest = (id, roomId, checkIn = '2026-11-01', checkOut = '2026-11-11', extra = {}) => ({ id, roomId, checkIn, checkOut, status: 'confirmed', price: 500, ...extra });
const transfer = { bookingId: 'a', fromRoomId: 'h3', toRoomId: 'h5', startDate: '2026-11-01', endDate: '2026-11-11' };

test('one guest exchanges rooms with two successive guests', () => {
  const bookings = [guest('a', 'h3'), guest('b', 'h5', '2026-11-01', '2026-11-06'), guest('c', 'h5', '2026-11-06', '2026-11-11')];
  const plan = buildRoomTransferPlan(bookings, transfer, helpers);
  assert.deepEqual(plan.map(({ after }) => after.roomId), ['h5', 'h3', 'h3']);
  for (const { before, after } of plan) {
    assert.equal(after.price, before.price);
    assert.equal(after.checkIn, before.checkIn);
    assert.equal(after.checkOut, before.checkOut);
  }
});

test('a longer destination stay moves only inside the swap window', () => {
  const b = guest('b', 'h5', '2026-10-28', '2026-11-15');
  const [, { after }] = buildRoomTransferPlan([guest('a', 'h3'), b], transfer, helpers);
  assert.equal(roomAtDate(after, '2026-10-31'), 'h5');
  assert.equal(roomAtDate(after, '2026-11-01'), 'h3');
  assert.equal(roomAtDate(after, '2026-11-10'), 'h3');
  assert.equal(roomAtDate(after, '2026-11-11'), 'h5');
});

test('multi-room stays retain other rooms and financial changes', () => {
  const financialMove = { id: 'rent', moveDate: '2026-11-05', roomId: 'h5', useDifferentMonthlyRent: true, monthlyRentVnd: 9000000, useDifferentChannel: true, channel: 'direct', paymentStatus: 'paid' };
  const b = guest('b', 'h5', '2026-11-01', '2026-11-15', { roomMoves: [financialMove, { id: 'later', moveDate: '2026-11-12', roomId: 'h7' }] });
  const [, { after }] = buildRoomTransferPlan([guest('a', 'h3'), b], transfer, helpers);
  assert.deepEqual(after.roomMoves.find((move) => move.id === 'rent'), { ...financialMove, roomId: 'h3' });
  assert.equal(roomAtDate(after, '2026-11-11'), 'h5');
  assert.equal(roomAtDate(after, '2026-11-12'), 'h7');
});

test('dragging a middle room segment preserves earlier and later assignments', () => {
  const a = guest('a', 'h1', '2026-10-25', '2026-11-20', { roomMoves: [{ id: 'one', moveDate: '2026-11-01', roomId: 'h3' }, { id: 'two', moveDate: '2026-11-11', roomId: 'h7' }] });
  const [{ after }] = buildRoomTransferPlan([a], transfer, helpers);
  assert.equal(roomAtDate(after, '2026-10-31'), 'h1');
  assert.equal(roomAtDate(after, '2026-11-05'), 'h5');
  assert.equal(roomAtDate(after, '2026-11-11'), 'h7');
});

test('cancelled, unrelated and back-to-back guests are not moved', () => {
  const bookings = [guest('a', 'h3'), guest('b', 'h5', '2026-11-11', '2026-11-15'), guest('c', 'h5', undefined, undefined, { status: 'cancelled' }), guest('d', 'h7')];
  assert.equal(buildRoomTransferPlan(bookings, transfer, helpers).length, 1);
});

test('restoring the room after a window preserves original moves', () => {
  const booking = guest('b', 'h5', '2026-11-01', '2026-11-20', { roomMoves: [{ id: 'later', moveDate: '2026-11-15', roomId: 'h7' }] });
  const after = transferRoomWithinDates(booking, { fromRoomId: 'h5', toRoomId: 'h3', startDate: '2026-11-03', endDate: '2026-11-08' }, roomAtDate);
  assert.equal(roomAtDate(after, '2026-11-02'), 'h5');
  assert.equal(roomAtDate(after, '2026-11-03'), 'h3');
  assert.equal(roomAtDate(after, '2026-11-08'), 'h5');
  assert.equal(roomAtDate(after, '2026-11-16'), 'h7');
});
