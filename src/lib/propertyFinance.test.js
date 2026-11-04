import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingIncomeRows, buildFinanceReport, normalizeFinanceEntry } from './propertyFinance.js';

const booking = { id: 'guest', guestName: 'Test guest', channel: 'direct', roomId: 'T1', checkIn: '2026-09-29', checkOut: '2026-10-03', price: 4000001 };
const entry = (patch = {}) => normalizeFinanceEntry({ kind: 'expense', category: 'rent', propertyId: 'prop_1', amountVnd: 1000000, date: '2026-10-01', description: 'Rent', ...patch }, '2026-11-02');

test('net booking income follows stay dates, checkout exclusive and exact VND remainder', () => {
  assert.equal(bookingIncomeRows([booking], '2026-09')[0].amountVnd, 2000001);
  assert.equal(bookingIncomeRows([booking], '2026-10')[0].amountVnd, 2000000);
  assert.deepEqual(bookingIncomeRows([{ ...booking, status: 'cancelled' }], '2026-10'), []);
});

test('Airbnb final net income is allocated once without subtracting commission again', () => {
  const rows = bookingIncomeRows([{ ...booking, channel: 'airbnb', _withholding: { status: 'computed', finalCountedIncome: 3600000, commissionWithheld: 400001 } }], '2026-10');
  assert.equal(rows[0].amountVnd, 1800000);
});

test('monthly rent follows room moves and only deducts sellable break nights', () => {
  const monthly = { ...booking, checkIn: '2026-10-01', checkOut: '2026-11-01', stayCategory: 'long', monthlyRentVnd: 31000000,
    roomMoves: [{ moveDate: '2026-10-16', roomId: 'N1' }], guestBreakPeriods: [{ startDate: '2026-10-03', endDate: '2026-10-06' }] };
  let rows = bookingIncomeRows([monthly], '2026-10');
  assert.equal(rows.find((r) => r.propertyId === 'prop_1').amountVnd, 15000000);
  assert.equal(rows.find((r) => r.propertyId === 'prop_2').amountVnd, 16000000);
  rows = bookingIncomeRows([{ ...monthly, sellRoomDuringBreak: true }], '2026-10');
  assert.equal(rows.find((r) => r.propertyId === 'prop_1').amountVnd, 12000000);
});

test('profit and cash use separate dates; payouts and receipts never duplicate accommodation', () => {
  const entries = [entry({ paymentDate: '2026-11-01', method: 'bank' }),
    entry({ kind: 'payout', amountVnd: 2000000, paymentDate: '2026-10-03', method: 'bank' }),
    entry({ category: 'loan_principal', amountVnd: 500000, paymentDate: '2026-10-04', method: 'bank' }),
    entry({ kind: 'other_income', amountVnd: 100000, paymentDate: '2026-10-05', method: 'cash' })];
  const report = buildFinanceReport({ bookings: [booking], entries, month: '2026-10', payments: [
    { kind: 'payment', bookingId: 'guest', receivedDate: '2026-10-02', amountVnd: 2000000 },
    { kind: 'adjustment', bookingId: 'guest', receivedDate: '2026-10-02', amountVnd: 999999 },
  ] });
  assert.equal(report.profit, 1100000);
  assert.equal(report.cashMovement, 3600000);
  assert.equal(report.unpaidExpenses, 1000000);
  assert.equal(buildFinanceReport({ bookings: [booking], entries, month: '2026-11' }).cashMovement, -1000000);
});

test('reversed receipts and voided entries are excluded; unknown booking receipts stay visible', () => {
  const report = buildFinanceReport({ month: '2026-10', entries: [{ ...entry(), status: 'void' }], payments: [
    { kind: 'payment', receivedDate: '2026-10-01', amountVnd: 99, reversedBy: 'undo' },
    { kind: 'payment', receivedDate: '2026-10-01', amountVnd: 100, bookingId: 'missing' },
    { kind: 'reversal', createdAt: '2026-10-01', amountVnd: 99 },
  ] });
  assert.equal(report.profit, 0);
  assert.equal(report.crmReceipts, 100);
  assert.equal(report.receipts[0].propertyId, 'unassigned');
});

test('shared overhead is included in consolidation without arbitrary property allocation', () => {
  const entries = [entry({ category: 'software', propertyId: 'shared', amountVnd: 200000 })];
  assert.equal(buildFinanceReport({ bookings: [booking], month: '2026-10', entries }).profit, 1800000);
  assert.equal(buildFinanceReport({ bookings: [booking], month: '2026-10', entries, propertyId: 'prop_1' }).profit, 2000000);
});

test('entry validation rejects invalid amounts, dates and categories', () => {
  for (const patch of [{ amountVnd: -1 }, { amountVnd: 1.5 }, { amountVnd: 'Infinity' }, { date: '2026-02-30' }, { category: 'unknown' }, { propertyId: 'unknown' }, { paymentDate: '2026-11-03' }, { paymentDate: '2026-10-01' }, { kind: 'payout' }]) {
    assert.throws(() => entry(patch));
  }
});
