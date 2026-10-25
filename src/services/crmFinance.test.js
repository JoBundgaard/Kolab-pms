import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountSummary, addCharge, airbnbOnly, applyCredit, applyDepositMovement, applyPayment,
  buildAlerts, buildSchedule, createAccount, defaultPlan, heldDeposit, lifecycle,
  propertyToday, reviseBillingPlan, remaining, reversePayment, roomAt, stayCategory, syncSchedule,
  weeklyLaundryStatus,
} from '../../functions/lib/crmFinance.mjs';

const today = '2026-10-25';
const booking = { id: 'stay', guestId: 'guest', guestName: 'Test Guest', channel: 'direct', roomId: 'T2', checkIn: '2026-09-12', checkOut: '2027-01-01', monthlyRentVnd: 9300000, price: 35000000, stayCategory: 'long' };
const planFor = (stay = booking, patch = {}) => ({ ...defaultPlan(stay, today), paymentTerms: 'custom', periodBasis: 'calendar', trackingStart: stay.checkIn, firstDueDate: stay.checkIn, dueDay: 5, ...patch });
const accountFor = (stay = booking, patch = {}) => createAccount(stay, planFor(stay, patch), today);
const receipt = (target, amountVnd, patch = {}) => ({ target, amountVnd, receivedDate: today, method: 'Bank transfer', reference: 'test-ref', ...patch });

test('Airbnb stays always have prepaid accommodation, without rent alerts or manual rent collection', () => {
  const airbnb = { ...booking, channel: 'airbnb', paymentStatus: 'unpaid' };
  assert.equal(accountSummary(airbnb, null, today).paymentState, 'airbnb');
  const account = accountFor(airbnb);
  assert.equal(accountSummary(airbnb, account, today).totalOutstanding, 0);
  assert.deepEqual(buildAlerts(airbnb, account, today), []);
  assert.throws(() => applyPayment(airbnb, account, receipt('oldest', 1), today), /Airbnb/);
  assert.equal(account.charges.every((charge) => charge.prepaid), true);
});

test('Airbnb services and an explicitly configured security deposit remain separate obligations', () => {
  const airbnb = { ...booking, channel: 'airbnb' };
  let account = accountFor(airbnb, { securityDepositVnd: 1000000, securityDepositDue: '2026-10-24' });
  account = addCharge(account, { id: 'laundry', title: 'Laundry', amountVnd: 90000, dueDate: '2026-10-24' }).account;
  const summary = accountSummary(airbnb, account, today);
  assert.equal(summary.totalOutstanding, 90000);
  assert.equal(summary.depositLeft, 1000000);
  assert.deepEqual(buildAlerts(airbnb, account, today).map((a) => a.type).sort(), ['deposit', 'payment']);
});

test('Airbnb-to-direct room move bills only the direct part, preserving its effective date', () => {
  const stay = { ...booking, checkIn: '2026-10-01', checkOut: '2026-11-01', channel: 'airbnb', roomMoves: [{ moveDate: '2026-10-16', roomId: 'N3', useDifferentChannel: true, channel: 'direct' }] };
  const account = accountFor(stay);
  assert.equal(airbnbOnly(stay), false);
  assert.equal(roomAt(stay, '2026-10-15'), 'T2');
  assert.equal(roomAt(stay, '2026-10-16'), 'N3');
  const direct = account.charges.find((c) => c.channel === 'direct');
  assert.equal(direct.amountVnd, 4800000);
  assert.equal(direct.dueDate, '2026-10-16');
  assert.equal(accountSummary(stay, account, today).totalOutstanding, 4800000);
});

test('month-end due day clamps in February and returns to 31 in March', () => {
  const stay = { ...booking, checkIn: '2027-01-31', checkOut: '2027-04-01' };
  const charges = buildSchedule(stay, planFor(stay, { dueDay: 31 }));
  assert.deepEqual(charges.map((c) => c.dueDate), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.equal(charges[1].amountVnd, 9300000);
});

test('calendar-month proration and a dated room rate change use the real month length', () => {
  const stay = { ...booking, checkIn: '2026-10-10', checkOut: '2026-11-01', roomMoves: [{ moveDate: '2026-10-20', roomId: 'N3', useDifferentMonthlyRent: true, monthlyRentVnd: 12400000 }] };
  const charge = buildSchedule(stay, planFor(stay))[0];
  assert.equal(charge.amountVnd, 10 * 300000 + 12 * 400000);
});

test('overlapping sellable breaks are deducted once and checkout is exclusive', () => {
  const stay = { ...booking, checkIn: '2026-10-01', checkOut: '2026-11-01', sellRoomDuringBreak: true, guestBreakPeriods: [{ startDate: '2026-10-20', endDate: '2026-10-25' }, { startDate: '2026-10-23', endDate: '2026-10-27' }] };
  assert.equal(buildSchedule(stay, planFor(stay))[0].amountVnd, (31 - 7) * 300000);
});

test('a medium stay can be billed once and fully prepaid', () => {
  const stay = { ...booking, stayCategory: 'medium', checkIn: '2026-10-10', checkOut: '2026-10-31', price: 9000000 };
  let account = accountFor(stay);
  assert.equal(account.plan.billing, 'one_off');
  assert.equal(account.charges.length, 1);
  account = applyPayment(stay, account, receipt('oldest', 9000000), today).account;
  assert.equal(accountSummary(stay, account, today).paymentState, 'paid');
});

test('partial payments leave overdue debt; late payment date does not change allocation', () => {
  let account = accountFor();
  const oct = account.charges.find((c) => c.id === 'rent_2026-10_direct');
  account = applyPayment(booking, account, receipt(oct.id, 6000000), today).account;
  assert.equal(remaining(account.charges.find((c) => c.id === oct.id), booking), 3300000);
  assert.equal(accountSummary(booking, account, '2026-11-01').overdueVnd > 3300000, true);
  account = applyPayment(booking, account, receipt(oct.id, 3300000, { receivedDate: '2026-11-01' }), '2026-11-01').account;
  assert.equal(remaining(account.charges.find((c) => c.id === oct.id), booking), 0);
  assert.equal(remaining(account.charges.find((c) => c.id === 'rent_2026-11_direct'), booking), 9300000);
});

test('advance payment to a later period never clears older arrears', () => {
  let account = accountFor();
  account = applyPayment(booking, account, receipt('rent_2026-12_direct', 9300000), today).account;
  assert.equal(remaining(account.charges.find((c) => c.id === 'rent_2026-10_direct'), booking), 9300000);
  assert.equal(accountSummary(booking, account, today).overdueVnd > 0, true);
});

test('excess payment is explicit credit, and applying it reduces only the selected charge', () => {
  let account = accountFor();
  account = applyPayment(booking, account, receipt('rent_2026-10_direct', 10000000), today).account;
  assert.equal(account.unallocatedVnd, 700000);
  account = applyCredit(booking, account, 'rent_2026-11_direct').account;
  assert.equal(account.unallocatedVnd, 0);
  assert.equal(remaining(account.charges.find((c) => c.id === 'rent_2026-11_direct'), booking), 8600000);
});

test('booking deposit is allocated toward rent and cannot be counted twice', () => {
  let account = accountFor(booking, { bookingDepositVnd: 3000000, bookingDepositDue: '2026-09-10' });
  const before = accountSummary(booking, account, today).totalOutstanding;
  account = applyPayment(booking, account, receipt('booking_deposit', 3000000), today).account;
  assert.equal(accountSummary(booking, account, today).bookingDepositLeft, 0);
  assert.equal(accountSummary(booking, account, today).totalOutstanding, before - 3000000);
  assert.throws(() => applyPayment(booking, account, receipt('booking_deposit', 1), today), /exceeds/);
});

test('ordinary rent payment also satisfies the booking deposit requirement', () => {
  let account = accountFor(booking, { bookingDepositVnd: 3000000, bookingDepositDue: '2026-09-10' });
  account = applyPayment(booking, account, receipt('oldest', 3000000), today).account;
  assert.equal(accountSummary(booking, account, today).bookingDepositLeft, 0);
});

test('security receipts, deductions and refunds never pay rent or reopen deposit collection', () => {
  let account = accountFor(booking, { securityDepositVnd: 5000000, securityDepositDue: today });
  const rentBefore = accountSummary(booking, account, today).totalOutstanding;
  account = applyPayment(booking, account, receipt('security', 5000000), today).account;
  account = applyDepositMovement(booking, account, { kind: 'deduction', amountVnd: 1000000, note: 'Agreed damage charge' }).account;
  account = applyDepositMovement(booking, account, { kind: 'refund', amountVnd: 4000000, note: 'Transfer reference 123' }).account;
  assert.equal(accountSummary(booking, account, today).totalOutstanding, rentBefore);
  assert.equal(accountSummary(booking, account, today).depositLeft, 0);
  assert.equal(heldDeposit(account.charges.find((c) => c.id === 'security')), 0);
  assert.throws(() => applyDepositMovement(booking, account, { kind: 'refund', amountVnd: 1, note: 'Duplicate refund' }), /currently held/);
});

test('reversal restores arrears without deleting payment history', () => {
  let account = accountFor();
  const result = applyPayment(booking, account, receipt('rent_2026-10_direct', 9300000), today);
  account = reversePayment(booking, result.account, { ...result.event, id: 'receipt' }, 'Wrong guest').account;
  assert.equal(remaining(account.charges.find((c) => c.id === 'rent_2026-10_direct'), booking), 9300000);
  assert.equal(result.event.amountVnd, 9300000);
  assert.throws(() => reversePayment(booking, account, { ...result.event, id: 'receipt', reversedBy: 'reversal' }, 'Again'), /unreversed/);
});

test('refunded security money cannot be reversed into a negative held amount', () => {
  const account = accountFor(booking, { securityDepositVnd: 1000000, securityDepositDue: today });
  const paid = applyPayment(booking, account, receipt('security', 1000000), today);
  const refunded = applyDepositMovement(booking, paid.account, { kind: 'refund', amountVnd: 1000000, note: 'Paid back' });
  assert.throws(() => reversePayment(booking, refunded.account, { ...paid.event, id: 'receipt' }, 'Wrong receipt'), /cannot be reversed/);
});

test('existing paid flags never invent transactions or clear a reviewed charge', () => {
  const legacy = { ...booking, paymentStatus: 'paid', longTermOps: { rentPaidThrough: '2026-12', rentLastPaidAt: '2026-10-24' } };
  assert.equal(accountSummary(legacy, null, today).needsSetup, true);
  assert.equal(accountSummary(legacy, accountFor(legacy), today).overdueVnd > 0, true);
});

test('opening extras import once, with credits netted and no duplicated booking services', () => {
  const stay = { ...booking, services: [{ name: 'Old laundry', price: 999999 }], longTermOps: { extrasLedger: [{ title: 'Laundry', amountVnd: 200000 }, { kind: 'credit', amountVnd: 50000 }, { status: 'billed', amountVnd: 800000 }] } };
  const account = accountFor(stay);
  assert.equal(account.charges.find((c) => c.id === 'legacy_extras').amountVnd, 150000);
  assert.equal(syncSchedule(stay, account, today).charges.filter((c) => c.id === 'legacy_extras').length, 1);
});

test('schedule updates preserve due and paid charges, update future rates and add extensions', () => {
  let account = accountFor();
  account = applyPayment(booking, account, receipt('rent_2026-12_direct', 1000000), today).account;
  const next = { ...booking, monthlyRentVnd: 12400000, checkOut: '2027-02-01' };
  const updated = syncSchedule(next, account, today);
  assert.equal(updated.charges.find((c) => c.id === 'rent_2026-10_direct').amountVnd, 9300000);
  assert.equal(updated.charges.find((c) => c.id === 'rent_2026-11_direct').amountVnd, 12400000);
  assert.equal(updated.charges.find((c) => c.id === 'rent_2026-12_direct').amountVnd, 9300000);
  assert.equal(updated.charges.find((c) => c.id === 'rent_2027-01_direct').amountVnd, 12400000);
});

test('early checkout applies financial reimbursement only when agreed', () => {
  const stay = { ...booking, actualCheckoutDate: '2026-10-20', endedEarly: true, earlyTerminationReimbursed: true };
  assert.equal(buildSchedule(stay, planFor(stay)).find((c) => c.id === 'rent_2026-10_direct').amountVnd, 19 * 300000);
  assert.equal(lifecycle(stay, today), 'past');
  assert.equal(buildSchedule({ ...stay, earlyTerminationReimbursed: false }, planFor(stay)).length, 4);
});

test('checkout and cancellation retain arrears but cancel unpaid future rent', () => {
  const account = accountFor();
  const stay = { ...booking, status: 'cancelled' };
  const updated = syncSchedule(stay, account, today);
  assert.equal(updated.charges.find((c) => c.id === 'rent_2026-11_direct').voided, true);
  assert.equal(accountSummary(stay, updated, today).overdueVnd > 0, true);
  assert.equal(buildAlerts(stay, updated, today).every((a) => a.dueDate <= today), true);
});

test('alerts use stable obligation IDs and correct due/overdue escalation stages', () => {
  const stay = { ...booking, checkIn: '2026-10-01', checkOut: '2026-11-01' };
  const account = accountFor(stay, { firstDueDate: '2026-10-25' });
  assert.equal(buildAlerts(stay, account, '2026-10-22')[0].stage, 'due_soon');
  assert.equal(buildAlerts(stay, account, today)[0].stage, 'due_today');
  assert.equal(buildAlerts(stay, account, '2026-10-26')[0].stage, 'overdue');
  assert.equal(buildAlerts(stay, account, '2026-10-28')[0].stage, 'follow_up');
  assert.equal(buildAlerts(stay, account, '2026-11-01')[0].stage, 'escalated');
  const id = buildAlerts(stay, account, today)[0].id;
  assert.equal(buildAlerts(stay, account, '2026-11-01')[0].id, id);
  const paid = applyPayment(stay, account, receipt('oldest', 9300000), today).account;
  assert.deepEqual(buildAlerts(stay, paid, '2026-11-01'), []);
});

test('property dates are independent of a staff device timezone', () => {
  assert.equal(propertyToday(new Date('2026-10-24T18:30:00Z')), '2026-10-25');
  assert.equal(stayCategory({ checkIn: '2026-10-01', checkOut: '2026-10-08' }), 'medium');
  assert.equal(stayCategory({ checkIn: '2026-10-01', checkOut: '2026-11-01' }), 'long');
});

test('invalid amounts, dates and unsupported deposit requirements are rejected', () => {
  const account = accountFor();
  assert.throws(() => applyPayment(booking, account, receipt('oldest', 1.5), today), /whole/);
  assert.throws(() => applyPayment(booking, account, receipt('oldest', 1, { receivedDate: '2026-10-26' }), today), /earlier/);
  assert.throws(() => buildSchedule(booking, planFor(booking, { trackingStart: '2027-02-01' })), /within/);
  assert.throws(() => buildSchedule(booking, planFor(booking, { securityDepositVnd: 100, securityDepositDue: '2026-02-30' })), /due date/);
  const airbnb = { ...booking, channel: 'airbnb' };
  assert.throws(() => buildSchedule(airbnb, planFor(airbnb, { bookingDepositVnd: 1 })), /prepaid/);
});

test('allocated account credit can be reversed before reversing its original overpayment', () => {
  const paid = applyPayment(booking, accountFor(), receipt('rent_2026-10_direct', 10000000), today);
  const credited = applyCredit(booking, paid.account, 'rent_2026-11_direct');
  assert.throws(() => reversePayment(booking, credited.account, { ...paid.event, id: 'receipt' }, 'Correction'), /credit has already/);
  const undoneCredit = reversePayment(booking, credited.account, { ...credited.event, id: 'credit' }, 'Undo allocation');
  const undonePayment = reversePayment(booking, undoneCredit.account, { ...paid.event, id: 'receipt' }, 'Correction');
  assert.equal(undonePayment.account.unallocatedVnd, 0);
  assert.equal(remaining(undonePayment.account.charges.find((c) => c.id === 'rent_2026-10_direct'), booking), 9300000);
});

test('laundry completion resets on the next property-local Monday', () => {
  const stay = { ...booking, longTermOps: { laundryStatus: 'done', laundryUpdatedAt: '2026-10-25T10:00:00Z' } };
  assert.equal(weeklyLaundryStatus(stay, '2026-10-25'), 'done');
  assert.equal(weeklyLaundryStatus(stay, '2026-10-26'), 'pending');
});

test('new booking services import once without changing the reviewed opening extras', () => {
  const stay = { ...booking, services: [{ id: 'old', name: 'Old laundry', price: 90000, qty: 1 }] };
  const account = accountFor(stay);
  const changed = { ...stay, services: [...stay.services, { id: 'new', name: 'Extra cleaning', price: 100000, qty: 2 }] };
  const synced = syncSchedule(changed, account, today);
  assert.equal(synced.charges.find((c) => c.id === 'legacy_extras').amountVnd, 90000);
  assert.equal(synced.charges.find((c) => c.title === 'Extra cleaning').amountVnd, 200000);
  assert.equal(syncSchedule(changed, synced, today).charges.filter((c) => c.title === 'Extra cleaning').length, 1);
});

test('arrival readiness does not require a security deposit agreed for after arrival', () => {
  const stay = { ...booking, channel: 'airbnb', checkIn: '2026-10-27', checkOut: '2026-11-27' };
  const account = accountFor(stay, { securityDepositVnd: 1000000, securityDepositDue: '2026-10-30' });
  assert.equal(accountSummary(stay, account, today).arrivalReady, true);
});

const kim = { ...booking, checkIn: '2026-09-24', checkOut: '2026-11-12', monthlyRentVnd: 15505478 };
const kimPlan = () => planFor(kim, { periodBasis: 'anniversary', cycleAnchor: kim.checkIn, trackingStart: '2026-10-24', firstDueDate: '2026-10-24' });
test('Kim: paid through October 24 leaves one 19-night rent charge due October 24', () => {
  const charges = buildSchedule(kim, kimPlan());
  assert.equal(charges.length, 1);
  assert.equal(charges[0].coverageStart, '2026-10-24');
  assert.equal(charges[0].coverageEnd, '2026-11-12');
  assert.equal(charges[0].dueDate, '2026-10-24');
  assert.equal(charges[0].amountVnd, Math.round(15505478 * 19 / 31));
});
test('anniversary months clamp February then return to the anchor day', () => {
  const stay = { ...booking, checkIn: '2026-01-31', checkOut: '2026-04-30' };
  const charges = buildSchedule(stay, planFor(stay, { periodBasis: 'anniversary', cycleAnchor: stay.checkIn }));
  assert.deepEqual(charges.map((c) => [c.coverageStart, c.coverageEnd]), [['2026-01-31', '2026-02-28'], ['2026-02-28', '2026-03-31'], ['2026-03-31', '2026-04-30']]);
  assert.ok(charges.every((c) => c.amountVnd === stay.monthlyRentVnd));
});
test('explicit correction removes overdue calendar rent without duplicate balances and preserves source', () => {
  const source = createAccount(kim, planFor(kim, { trackingStart: '2026-10-01', firstDueDate: '2026-10-24' }), today);
  assert.throws(() => reviseBillingPlan(kim, source, kimPlan(), today), /Confirm/);
  const corrected = reviseBillingPlan(kim, source, kimPlan(), today, true);
  assert.equal(accountSummary(kim, corrected, today).totalOutstanding, Math.round(15505478 * 19 / 31));
  assert.equal(source.charges[0].voided, undefined);
  assert.equal(corrected.charges.filter((c) => c.voided).length, 2);
  const paid = applyPayment(kim, source, receipt('oldest', 1000), today).account;
  assert.throws(() => reviseBillingPlan(kim, paid, kimPlan(), today, true), /payments or credits/);
});

const upcoming = { ...booking, checkIn: '2026-11-24', checkOut: '2027-02-12', monthlyRentVnd: 12000000 };
const standardPlan = (stay = upcoming) => defaultPlan(stay, today);
test('standard monthly terms split only the first rent cycle into 25% upfront and 75% arrival', () => {
  const plan = standardPlan();
  const charges = buildSchedule(upcoming, plan);
  assert.equal(plan.securityDepositVnd, 0);
  assert.deepEqual(charges.slice(0, 2).map((c) => [c.role, c.amountVnd, c.dueDate]), [['reservation', 3000000, today], ['arrival', 9000000, upcoming.checkIn]]);
  assert.equal(charges[2].amountVnd, 12000000);
  assert.equal(charges[2].dueDate, '2026-12-24');
  assert.equal(charges.filter((c) => c.role === 'reservation').length, 1);
  assert.equal(charges.some((c) => c.type === 'security'), false);
  const unsplit = buildSchedule(upcoming, { ...plan, paymentTerms: 'custom' });
  assert.equal(charges.reduce((n, c) => n + c.amountVnd, 0), unsplit.reduce((n, c) => n + c.amountVnd, 0));
});
test('standard short stay uses 25% of total with exact rounded remainder due on arrival', () => {
  const stay = { ...upcoming, stayCategory: 'short', checkOut: '2026-11-28', price: 10000003 };
  const charges = buildSchedule(stay, standardPlan(stay));
  assert.deepEqual(charges.map((c) => c.amountVnd), [2500001, 7500002]);
  assert.equal(charges[1].dueDate, stay.checkIn);
});
test('reservation receipt pays rent once; arrival payment does not collect later monthly rent', () => {
  let account = createAccount(upcoming, standardPlan(), today);
  const initial = accountSummary(upcoming, account, today);
  const result = applyPayment(upcoming, account, receipt('booking_deposit', 3000000), today);
  account = result.account;
  assert.equal(result.event.allocations[0].chargeId, account.charges.find((c) => c.role === 'reservation').id);
  let summary = accountSummary(upcoming, account, today);
  assert.equal(summary.bookingDepositRequired, 3000000);
  assert.equal(summary.bookingDepositLeft, 0);
  assert.equal(summary.arrivalBalanceVnd, 9000000);
  assert.equal(summary.totalOutstanding, initial.totalOutstanding - 3000000);
  const arrival = account.charges.find((c) => c.role === 'arrival');
  account = applyPayment(upcoming, account, receipt(arrival.id, 9000000, { receivedDate: upcoming.checkIn }), upcoming.checkIn).account;
  summary = accountSummary(upcoming, account, upcoming.checkIn);
  assert.equal(summary.arrivalBalanceVnd, 0);
  assert.equal(summary.arrivalReady, true);
  assert.equal(summary.nextDue, '2026-12-24');
});
test('partial reservation payments, reversal and alerts track the same obligation without duplicates', () => {
  const source = createAccount(upcoming, standardPlan(), today);
  const { account, event } = applyPayment(upcoming, source, receipt('booking_deposit', 1000000), today);
  assert.equal(accountSummary(upcoming, account, today).bookingDepositLeft, 2000000);
  const alerts = buildAlerts(upcoming, account, today);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'deposit');
  assert.equal(alerts[0].amountVnd, 2000000);
  const reversed = reversePayment(upcoming, account, { ...event, id: 'receipt' }, 'Wrong receipt').account;
  assert.equal(accountSummary(upcoming, reversed, today).bookingDepositLeft, 3000000);
  assert.throws(() => applyPayment(upcoming, account, receipt('booking_deposit', 2000001), today), /exceeds/);
});
test('paying a later month or arrival balance cannot silently satisfy the reservation obligation', () => {
  let account = createAccount(upcoming, standardPlan(), today);
  const arrival = account.charges.find((c) => c.role === 'arrival');
  account = applyPayment(upcoming, account, receipt(arrival.id, 9000000), today).account;
  assert.equal(accountSummary(upcoming, account, today).bookingDepositLeft, 3000000);
});
test('no new reservation payment is created for Kim after the paid-through date', () => {
  const charges = buildSchedule(kim, { ...kimPlan(), paymentTerms: 'standard_25_75' });
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amountVnd, 9503357);
  assert.equal(charges[0].role, undefined);
});
test('Airbnb prepaid bookings never get a standard reservation or arrival charge', () => {
  const stay = { ...upcoming, channel: 'airbnb' };
  const account = createAccount(stay, standardPlan(stay), today);
  assert.equal(account.charges.some((c) => c.role), false);
  assert.equal(accountSummary(stay, account, today).bookingDepositRequired, 0);
  assert.deepEqual(buildAlerts(stay, account, today), []);
});
test('standard reservation date cannot be after arrival and legacy terms are not silently changed', () => {
  assert.throws(() => buildSchedule(upcoming, { ...standardPlan(), bookingDepositDue: '2026-12-01' }), /before arrival/);
  const plan = standardPlan();
  delete plan.paymentTerms;
  assert.equal(buildSchedule(upcoming, plan).some((c) => c.role), false);
});

test('no-deposit returning guest owes the full first month on arrival and no upfront obligation', () => {
  const plan = { ...standardPlan(), paymentTerms: 'no_deposit' };
  const account = createAccount(upcoming, plan, today);
  const summary = accountSummary(upcoming, account, today);
  assert.equal(account.charges[0].role, 'arrival');
  assert.equal(account.charges[0].amountVnd, 12000000);
  assert.equal(account.charges[0].dueDate, upcoming.checkIn);
  assert.equal(summary.bookingDepositRequired, 0);
  assert.equal(summary.bookingDepositLeft, 0);
  assert.equal(summary.arrivalBalanceVnd, 12000000);
  assert.equal(account.charges[1].dueDate, '2026-12-24');
  assert.equal(summary.depositAction, false);
  assert.deepEqual(buildAlerts(upcoming, account, today), []);
});
test('no deposit for a short stay is the full accommodation payment on arrival', () => {
  const stay = { ...upcoming, stayCategory: 'short', checkOut: '2026-11-28', price: 10000000 };
  const charges = buildSchedule(stay, { ...standardPlan(stay), paymentTerms: 'no_deposit' });
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amountVnd, 10000000);
  assert.equal(charges[0].dueDate, stay.checkIn);
});
test('custom terms use the agreed amount and remaining due date without increasing total rent', () => {
  const plan = { ...standardPlan(), paymentTerms: 'custom', splitReservation: true, bookingDepositVnd: 4000000, firstDueDate: '2026-11-26' };
  let account = createAccount(upcoming, plan, today);
  assert.equal(account.charges[0].amountVnd, 4000000);
  assert.equal(account.charges[0].role, 'reservation');
  assert.equal(account.charges[1].amountVnd, 8000000);
  assert.equal(account.charges[1].dueDate, '2026-11-26');
  const result = applyPayment(upcoming, account, receipt('booking_deposit', 4000000), today);
  account = result.account;
  const summary = accountSummary(upcoming, account, today);
  assert.equal(summary.bookingDepositLeft, 0);
  assert.equal(summary.arrivalBalanceVnd, 8000000);
  assert.equal(account.charges[2].amountVnd, 12000000);
  assert.throws(() => buildSchedule(upcoming, { ...plan, bookingDepositVnd: 12000001 }), /first rent period/);
});
test('no-deposit rejects stale upfront amounts and leaves Kim remaining rent unchanged', () => {
  assert.throws(() => buildSchedule(upcoming, { ...standardPlan(), paymentTerms: 'no_deposit', bookingDepositVnd: 1 }), /zero reservation/);
  const charges = buildSchedule(kim, { ...kimPlan(), paymentTerms: 'no_deposit' });
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amountVnd, 9503357);
});
test('switching an unreceived standard plan to no deposit requires correction and preserves the total', () => {
  const source = createAccount(upcoming, standardPlan(), today);
  const plan = { ...source.plan, paymentTerms: 'no_deposit' };
  assert.throws(() => reviseBillingPlan(upcoming, source, plan, today), /Confirm/);
  const corrected = reviseBillingPlan(upcoming, source, plan, today, true);
  assert.equal(accountSummary(upcoming, corrected, today).bookingDepositRequired, 0);
  assert.equal(accountSummary(upcoming, corrected, today).totalOutstanding, accountSummary(upcoming, source, today).totalOutstanding);
});
