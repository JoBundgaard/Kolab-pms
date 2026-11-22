import test from 'node:test';
import assert from 'node:assert/strict';
import { addRentMonths, classifyStay, rentDuration } from '../../functions/lib/rentMonths.mjs';
import { buildSchedule, defaultPlan } from '../../functions/lib/crmFinance.mjs';
import { calculateLongTermRentForRange } from './bookingDates.js';
import { invoiceFromBooking, invoiceSubtotal } from './invoice.js';
import { bookingIncomeRows } from './propertyFinance.js';

const monthly = (checkIn, checkOut, patch = {}) => ({ id: 'monthly', guestName: 'Guest', roomId: 'T1', channel: 'direct', checkIn, checkOut, monthlyRentVnd: 9000000, ...patch });

test('long stays begin at one calendar month, including 28, 29 and 30 nights', () => {
  for (const [start, end] of [['2027-02-01', '2027-03-01'], ['2028-02-01', '2028-03-01'], ['2026-11-17', '2026-12-17'], ['2027-01-31', '2027-02-28']]) {
    assert.equal(classifyStay({ checkIn: start, checkOut: end, stayCategory: 'medium' }), 'long');
    assert.deepEqual(rentDuration(start, end), { months: 1, nights: 0 });
  }
  assert.equal(classifyStay({ checkIn: '2027-01-01', checkOut: '2027-01-31' }), 'medium');
  assert.equal(classifyStay({ checkIn: '2027-02-01', checkOut: '2027-02-28' }), 'medium');
  assert.equal(addRentMonths('2027-01-31', 2), '2027-03-31');
});

test('one month, extra nights and two months agree across invoices, CRM and rent estimates', () => {
  for (const [end, expected] of [['2026-12-17', 9000000], ['2026-12-20', Math.round(9000000 + 9000000 * 3 / 31)], ['2027-01-17', 18000000]]) {
    const booking = monthly('2026-11-17', end);
    assert.equal(calculateLongTermRentForRange(booking, booking.checkIn, end), expected);
    const invoice = invoiceFromBooking(booking);
    assert.equal(invoiceSubtotal(invoice), expected);
    const plan = { ...defaultPlan(booking, booking.checkIn), paymentTerms: 'custom' };
    const charges = buildSchedule(booking, plan);
    assert.equal(charges.reduce((total, charge) => total + charge.amountVnd, 0), expected);
    assert.equal(invoice.items[0].unit, 'month');
    assert.equal(invoice.items[0].quantity, end === '2027-01-17' ? 2 : 1);
    if (end === '2026-12-20') {
      assert.equal(invoice.items[1].quantity, 3);
      assert.equal(invoice.items[1].unit, 'night');
    }
  }
});

test('month ends and leap years retain the arrival anchor', () => {
  for (const [start, end, months] of [['2027-01-31', '2027-02-28', 1], ['2028-01-31', '2028-02-29', 1], ['2027-01-31', '2027-03-31', 2]]) {
    const booking = monthly(start, end);
    assert.equal(calculateLongTermRentForRange(booking, start, end), months * 9000000);
    assert.equal(invoiceSubtotal(invoiceFromBooking(booking)), months * 9000000);
  }
});

test('room moves, rate changes and overlapping sellable breaks keep the original rent month', () => {
  const booking = monthly('2026-11-17', '2026-12-17', { roomMoves: [{ moveDate: '2026-12-02', roomId: 'N1', useDifferentMonthlyRent: true, monthlyRentVnd: 12000000 }], sellRoomDuringBreak: true, guestBreakPeriods: [{ startDate: '2026-11-20', endDate: '2026-11-23' }, { startDate: '2026-11-21', endDate: '2026-11-24' }] });
  const expected = 9000000 * 11 / 30 + 12000000 * 15 / 30;
  assert.equal(calculateLongTermRentForRange(booking, booking.checkIn, booking.checkOut), expected);
  assert.equal(invoiceSubtotal(invoiceFromBooking(booking)), expected);
  const plan = { ...defaultPlan(booking, booking.checkIn), paymentTerms: 'custom' };
  assert.equal(buildSchedule(booking, plan).reduce((total, charge) => total + charge.amountVnd, 0), expected);
  assert.equal(['2026-11', '2026-12'].flatMap((month) => bookingIncomeRows([booking], month)).reduce((total, row) => total + row.amountVnd, 0), expected);
});

test('report ranges and reimbursed early departures prorate the original month', () => {
  const booking = monthly('2026-11-17', '2026-12-17');
  assert.equal(calculateLongTermRentForRange(booking, '2026-11-17', '2026-12-01'), 4200000);
  assert.equal(calculateLongTermRentForRange(booking, '2026-12-01', '2026-12-17'), 4800000);
  const early = { ...booking, actualCheckoutDate: '2026-12-02', earlyTerminationReimbursed: true };
  assert.equal(calculateLongTermRentForRange(early, booking.checkIn, booking.checkOut), 4500000);
});
