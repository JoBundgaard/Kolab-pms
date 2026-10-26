// Shared by the React workspace and Firebase jobs. Dates are property-local
// calendar keys; UTC is used only for calendar arithmetic (never device time).
export const PROPERTY_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAY = 86400000;
export const money = (value) => Math.round(Number(value) || 0);
export const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function propertyToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PROPERTY_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key).value).join('-');
}
export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
const max = (...dates) => dates.sort().at(-1);
const min = (...dates) => dates.sort()[0];
export const cancelled = (booking) => /^(cancel|no[-_ ]?show)/i.test(booking?.status || '');
export function occupancyEnd(booking) {
  const actual = booking.actualCheckoutDate || booking.earlyCheckoutDate || booking.actualEndDate;
  return validDate(actual) && actual > booking.checkIn && actual < booking.checkOut ? actual : booking.checkOut;
}
export const financialEnd = (booking) => booking.earlyTerminationReimbursed ? occupancyEnd(booking) : booking.checkOut;
export function stayCategory(booking) {
  if (['short', 'medium', 'long'].includes(booking.stayCategory)) return booking.stayCategory;
  const nights = daysBetween(booking.checkIn, booking.checkOut);
  return nights >= 31 ? 'long' : nights >= 7 ? 'medium' : 'short';
}
export function lifecycle(booking, today) {
  if (cancelled(booking)) return 'cancelled';
  if (occupancyEnd(booking) <= today || /^(checked[-_]out|completed)$/.test(booking.status)) return 'past';
  return booking.checkIn > today ? 'arriving' : 'inhouse';
}
export function staySegments(booking, plan = {}) {
  const end = financialEnd(booking);
  if (!validDate(booking.checkIn) || !validDate(end) || booking.checkIn >= end) return [];
  let current = { start: booking.checkIn, roomId: booking.roomId, channel: (booking.channel || 'airbnb').toLowerCase(), rate: money(plan.monthlyRentVnd ?? booking.monthlyRentVnd) };
  const result = [];
  for (const move of [...(booking.roomMoves || [])].sort((a, b) => String(a.moveDate).localeCompare(String(b.moveDate)))) {
    if (!validDate(move.moveDate) || move.moveDate <= current.start || move.moveDate >= end) continue;
    result.push({ ...current, end: move.moveDate });
    current = { ...current, start: move.moveDate, roomId: move.roomId || current.roomId, channel: move.useDifferentChannel && move.channel ? move.channel.toLowerCase() : current.channel, rate: move.useDifferentMonthlyRent ? money(move.monthlyRentVnd) : current.rate };
  }
  result.push({ ...current, end });
  return result;
}
export const airbnbOnly = (booking) => {
  const segments = staySegments(booking);
  return segments.length > 0 && segments.every((segment) => segment.channel === 'airbnb');
};
export function roomAt(booking, today) {
  const segments = staySegments(booking);
  return (segments.find((s) => s.start <= today && today < s.end) || (today < booking.checkIn ? segments[0] : segments.at(-1)))?.roomId || booking.roomId;
}
function billableNights(booking, start, end) {
  const breaks = booking.sellRoomDuringBreak ? (booking.guestBreakPeriods || booking.breakPeriods || booking.breaks || []) : [];
  let nights = 0;
  for (let date = start; date < end; date = addDays(date, 1)) {
    if (!breaks.some((b) => (b.startDate || b.start) <= date && date < (b.endDate || b.end))) nights++;
  }
  return nights;
}
function extraEntries(booking) {
  const explicit = booking.longTermOps?.extrasLedger?.length ? booking.longTermOps.extrasLedger : booking.longTermOps?.extrasLog;
  const entries = explicit?.length ? explicit : (booking.services || []).map((s) => ({ ...s, title: s.name, amountVnd: money(s.price) * Math.max(1, Number(s.qty) || 1), status: s.billedAt ? 'billed' : 'unbilled' }));
  return entries.map((entry, index) => ({ key: `${explicit?.length ? 'ledger' : 'service'}_${entry.id || `${entry.title || entry.name}_${entry.createdAt || ''}_${index}`}`, title: entry.title || entry.name || 'Extra charge', amountVnd: (entry.kind === 'credit' || entry.type === 'credit' ? -1 : 1) * money(entry.amountVnd ?? entry.price), billed: entry.status === 'billed' || !!entry.billedAt || !!entry.settledMonthKey }));
}
export function legacyExtras(booking) {
  return extraEntries(booking).filter((entry) => !entry.billed).reduce((total, entry) => total + entry.amountVnd, 0);
}
export function defaultPlan(booking, today = propertyToday()) {
  const monthly = stayCategory(booking) === 'long' && money(booking.monthlyRentVnd) > 0;
  const reference = financialEnd(booking) <= today ? addDays(financialEnd(booking), -1) : today;
  const anchorDay = Number(booking.checkIn?.slice(8)) || 1;
  let cycleStart = monthDue(reference.slice(0, 7), anchorDay);
  if (cycleStart > reference) cycleStart = monthDue(addDays(`${reference.slice(0, 7)}-01`, -1).slice(0, 7), anchorDay);
  const start = booking.checkIn > reference ? booking.checkIn : max(booking.checkIn, monthly ? cycleStart : `${reference.slice(0, 7)}-01`);
  const dueDay = Number(booking.longTermOps?.rentDueDay) || Number(booking.checkIn?.slice(8)) || 1;
  return { billing: monthly ? 'monthly' : 'one_off', paymentTerms: 'standard_25_75', periodBasis: 'anniversary', cycleAnchor: booking.checkIn, trackingStart: start, firstDueDate: monthly ? start : booking.checkIn, dueDay, monthlyRentVnd: money(booking.monthlyRentVnd), totalVnd: money(booking.price), useBookingRate: true, useBookingTotal: true, bookingDepositVnd: 0, bookingDepositDue: min(today, booking.checkIn), securityDepositVnd: 0, securityDepositDue: booking.checkIn, openingVnd: 0, openingDue: today, includeExtras: true };
}
export function validatePlan(booking, plan) {
  if (!validDate(booking.checkIn) || !validDate(financialEnd(booking))) throw new Error('This booking needs valid arrival and departure dates.');
  if (!['monthly', 'one_off'].includes(plan.billing) || !validDate(plan.trackingStart) || !validDate(plan.firstDueDate)) throw new Error('Choose a billing plan, tracking start, and first due date.');
  if (plan.paymentTerms && !['standard_25_75', 'no_deposit', 'custom'].includes(plan.paymentTerms)) throw new Error('Choose valid reservation payment terms.');
  if (plan.splitReservation && plan.trackingStart > booking.checkIn && Number(plan.bookingDepositVnd) > 0) throw new Error('A reservation payment applies at arrival only. Record advance payments against the remaining rent instead.');
  if (plan.paymentTerms === 'no_deposit' && Number(plan.bookingDepositVnd) !== 0) throw new Error('No deposit requires a zero reservation payment.');
  if ((plan.paymentTerms === 'standard_25_75' || plan.splitReservation) && (!validDate(plan.bookingDepositDue) || plan.bookingDepositDue > booking.checkIn)) throw new Error('Reservation payment must be due on or before arrival.');
  if (plan.periodBasis && !['calendar', 'anniversary'].includes(plan.periodBasis)) throw new Error('Choose calendar months or rent-date months.');
  if (plan.periodBasis === 'anniversary' && (!validDate(plan.cycleAnchor) || plan.cycleAnchor > plan.trackingStart)) throw new Error('The rent cycle anchor must be on or before the first unpaid date.');
  if (plan.trackingStart < booking.checkIn || plan.trackingStart >= financialEnd(booking)) throw new Error('The first tracked date must be within the stay.');
  if (plan.firstDueDate < booking.checkIn) throw new Error('First rent due date cannot be before arrival. Use a booking deposit for pre-arrival collection.');
  if (!Number.isInteger(Number(plan.dueDay)) || plan.dueDay < 1 || plan.dueDay > 31) throw new Error('Rent due day must be between 1 and 31.');
  for (const key of ['monthlyRentVnd', 'totalVnd', 'bookingDepositVnd', 'securityDepositVnd', 'openingVnd']) {
    if (!Number.isSafeInteger(Number(plan[key])) || Number(plan[key]) < 0) throw new Error('Amounts must be whole, non-negative VND values.');
  }
  if (!airbnbOnly(booking) && Number(plan[plan.billing === 'monthly' ? 'monthlyRentVnd' : 'totalVnd']) <= 0) throw new Error('Enter the agreed rent or stay amount.');
  if (plan.securityDepositVnd > 0 && !validDate(plan.securityDepositDue)) throw new Error('Choose a security deposit due date.');
  if (plan.bookingDepositVnd > 0 && !validDate(plan.bookingDepositDue)) throw new Error('Choose a booking deposit due date.');
  if (plan.openingVnd > 0 && !validDate(plan.openingDue)) throw new Error('Choose an opening balance due date.');
  if (airbnbOnly(booking) && (Number(plan.openingVnd) > 0 || Number(plan.bookingDepositVnd) > 0)) throw new Error('Airbnb rent is prepaid. Only add a separate security deposit or service charge if needed.');
}
function monthAfter(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
}
function monthDue(month, day) {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(day), last)).padStart(2, '0')}`;
}
export function buildSchedule(booking, plan) {
  validatePlan(booking, plan);
  const segments = staySegments(booking, plan);
  const charges = [];
  const push = (charge) => charges.push({ paidVnd: 0, creditVnd: 0, refundedVnd: 0, deductedVnd: 0, ...charge });
  if (plan.billing === 'monthly') {
    const from = max(booking.checkIn, plan.trackingStart);
    const anniversary = plan.periodBasis === 'anniversary';
    const cycleDay = Number(plan.cycleAnchor?.slice(8));
    let month = anniversary ? monthDue(from.slice(0, 7), cycleDay) : `${from.slice(0, 7)}-01`;
    if (month > from) {
      const previous = addDays(`${from.slice(0, 7)}-01`, -1);
      month = monthDue(previous.slice(0, 7), cycleDay);
    }
    for (let index = 0; month < financialEnd(booking); index++, month = anniversary ? monthDue(monthAfter(month.slice(0, 7)).slice(0, 7), cycleDay) : monthAfter(month.slice(0, 7))) {
      if (index >= 120) throw new Error('Track at most ten years in one billing plan.');
      const end = anniversary ? monthDue(monthAfter(month.slice(0, 7)).slice(0, 7), cycleDay) : monthAfter(month.slice(0, 7));
      const amounts = new Map();
      for (const segment of segments) {
        const start = max(month, segment.start, from), until = min(end, segment.end);
        if (start >= until) continue;
        const item = amounts.get(segment.channel) || { amountVnd: 0, start, end: until };
        item.amountVnd += segment.rate * billableNights(booking, start, until) / daysBetween(month, end);
        item.end = until;
        amounts.set(segment.channel, item);
      }
      for (const [channel, item] of amounts) {
        const dueDate = index === 0 ? max(plan.firstDueDate, item.start) : anniversary ? item.start : max(item.start, monthDue(month.slice(0, 7), plan.dueDay));
        push({ id: anniversary ? `cycle_${month}_${channel}` : `rent_${month.slice(0, 7)}_${channel}`, type: 'rent', channel, prepaid: channel === 'airbnb', title: anniversary ? `Rent · ${item.start} → ${item.end}` : `Rent · ${month.slice(0, 7)}`, coverageStart: item.start, coverageEnd: item.end, dueDate, amountVnd: money(item.amountVnd) });
      }
    }
  } else {
    const groups = new Map();
    const totalNights = Math.max(1, daysBetween(booking.checkIn, financialEnd(booking)));
    for (const segment of segments) {
      const item = groups.get(segment.channel) || { nights: 0, start: segment.start, end: segment.end };
      item.nights += daysBetween(segment.start, segment.end);
      item.end = segment.end;
      groups.set(segment.channel, item);
    }
    let allocated = 0;
    for (const [channel, item] of groups) {
      const amountVnd = channel === [...groups.keys()].at(-1) ? money(plan.totalVnd) - allocated : money(Number(plan.totalVnd) * item.nights / totalNights);
      allocated += amountVnd;
      push({ id: `stay_${channel}`, type: 'rent', channel, prepaid: channel === 'airbnb', title: 'Stay balance', coverageStart: item.start, coverageEnd: item.end, dueDate: max(plan.firstDueDate, item.start), amountVnd });
    }
  }
  // Reservation and arrival instalments partition rent, never add to it.
  // A paid-through date after arrival must not create a new reservation deposit.
  if ((plan.paymentTerms === 'standard_25_75' || plan.paymentTerms === 'no_deposit' || plan.splitReservation) && plan.trackingStart === booking.checkIn) {
    const first = charges.find((c) => c.type === 'rent' && !c.prepaid && c.coverageStart === booking.checkIn);
    if (first) {
      const upfront = plan.paymentTerms === 'standard_25_75' ? money(first.amountVnd * 0.25) : plan.paymentTerms === 'no_deposit' ? 0 : money(plan.bookingDepositVnd);
      if (upfront > first.amountVnd) throw new Error('Reservation payment cannot exceed the first rent period.');
      if (upfront > 0) push({ ...first, id: `reservation_${first.id}`, role: 'reservation', title: plan.paymentTerms === 'standard_25_75' ? '25% reservation payment' : 'Custom reservation payment', dueDate: plan.bookingDepositDue, amountVnd: upfront });
      first.amountVnd -= upfront;
      first.role = 'arrival';
      first.title = plan.paymentTerms === 'standard_25_75' ? '75% arrival balance' : plan.paymentTerms === 'no_deposit' ? 'Full payment on arrival · no deposit' : 'Custom remaining balance';
      first.dueDate = plan.paymentTerms === 'custom' ? max(plan.firstDueDate, first.coverageStart) : booking.checkIn;
    }
  }
  if (Number(plan.openingVnd) > 0) push({ id: 'opening', type: 'rent', channel: 'direct', title: 'Reviewed opening rent balance', amountVnd: money(plan.openingVnd), dueDate: plan.openingDue });
  if (Number(plan.securityDepositVnd) > 0) push({ id: 'security', type: 'security', title: 'Refundable security deposit', amountVnd: money(plan.securityDepositVnd), dueDate: plan.securityDepositDue });
  const rentTotal = charges.filter((c) => c.type === 'rent' && !c.prepaid).reduce((n, c) => n + c.amountVnd, 0);
  if (Number(plan.bookingDepositVnd) > rentTotal) throw new Error('Booking deposit cannot exceed the rent collected directly.');
  return !(plan.paymentTerms === 'standard_25_75' || plan.splitReservation) ? charges : charges.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.role === 'reservation' ? -1 : b.role === 'reservation' ? 1 : 0));
}
export function bookingFingerprint(booking) {
  return JSON.stringify([booking.checkIn, booking.checkOut, occupancyEnd(booking), !!booking.earlyTerminationReimbursed, booking.monthlyRentVnd ?? null, booking.price ?? null, booking.channel || 'airbnb', booking.status || '', booking.roomMoves || [], !!booking.sellRoomDuringBreak, booking.guestBreakPeriods || booking.breakPeriods || booking.breaks || [], extraEntries(booking)]);
}
export function createAccount(booking, plan, today) {
  const charges = buildSchedule(booking, plan);
  const extras = plan.includeExtras ? legacyExtras(booking) : 0;
  if (extras > 0) charges.push({ id: 'legacy_extras', type: 'extra', title: 'Opening extras, net of existing credits', dueDate: today, amountVnd: extras, paidVnd: 0, creditVnd: 0, refundedVnd: 0, deductedVnd: 0 });
  return { bookingId: booking.id, guestId: booking.guestId || '', plan, charges, importedExtraKeys: extraEntries(booking).map((entry) => entry.key), unallocatedVnd: Math.max(0, -extras), bookingDepositPaidVnd: 0, fingerprint: bookingFingerprint(booking), version: 1 };
}
export function isPrepaid(charge, booking) {
  return charge.type === 'rent' && (charge.prepaid || airbnbOnly(booking));
}
export const remaining = (charge, booking) => charge.voided || isPrepaid(charge, booking) ? 0 : Math.max(0, money(charge.amountVnd) - money(charge.paidVnd) - money(charge.creditVnd));
export const heldDeposit = (charge) => Math.max(0, money(charge.paidVnd) - money(charge.refundedVnd) - money(charge.deductedVnd));
export function accountSummary(booking, account, today = propertyToday()) {
  const prepaid = airbnbOnly(booking);
  const charges = (account?.charges || []).filter((c) => !c.voided && (!cancelled(booking) || c.type !== 'rent' || c.dueDate <= today || c.paidVnd > 0));
  const rent = charges.filter((c) => c.type !== 'security');
  const open = rent.filter((c) => remaining(c, booking) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = open.filter((c) => c.dueDate < today);
  const security = charges.filter((c) => c.type === 'security');
  const depositLeft = security.reduce((n, c) => n + remaining(c, booking), 0);
  const rentReceived = rent.filter((c) => c.type === 'rent' && c.id !== 'opening').reduce((n, c) => n + money(c.paidVnd), 0);
  const standard = account?.plan?.paymentTerms === 'standard_25_75' || account?.plan?.splitReservation;
  const reservations = rent.filter((c) => c.role === 'reservation');
  const bookingDepositRequired = standard ? reservations.reduce((n, c) => n + c.amountVnd, 0) : money(account?.plan?.bookingDepositVnd);
  const bookingDepositLeft = prepaid || cancelled(booking) ? 0 : standard ? reservations.reduce((n, c) => n + remaining(c, booking), 0) : Math.max(0, bookingDepositRequired - rentReceived);
  const arrivalCharges = rent.filter((c) => c.role === 'arrival');
  const arrivalBalanceVnd = arrivalCharges.reduce((n, c) => n + remaining(c, booking), 0);
  const depositDue = [...security.filter((c) => remaining(c, booking) > 0).map((c) => c.dueDate), ...(bookingDepositLeft ? standard ? reservations.filter((c) => remaining(c, booking) > 0).map((c) => c.dueDate) : [account.plan.bookingDepositDue] : [])].sort()[0] || '';
  const dueSoon = open.filter((c) => daysBetween(today, c.dueDate) >= 0 && daysBetween(today, c.dueDate) <= 3);
  const needsSetup = !account && !prepaid && !cancelled(booking);
  const paymentState = needsSetup ? 'setup' : overdue.length ? 'overdue' : open.some((c) => c.paidVnd > 0) ? 'partial' : open.length ? 'unpaid' : prepaid ? 'airbnb' : 'paid';
  const totalOutstanding = open.reduce((n, c) => n + remaining(c, booking), 0);
  const arrivalReady = !needsSetup && !rent.some((c) => c.dueDate <= booking.checkIn && remaining(c, booking) > 0) && !security.some((c) => c.dueDate <= booking.checkIn && remaining(c, booking) > 0) && !(bookingDepositLeft > 0 && account.plan.bookingDepositDue <= booking.checkIn);
  return { prepaid, needsSetup, paymentState, totalOutstanding, overdueVnd: overdue.reduce((n, c) => n + remaining(c, booking), 0), dueSoonVnd: dueSoon.reduce((n, c) => n + remaining(c, booking), 0), overdueDays: overdue[0] ? daysBetween(overdue[0].dueDate, today) : 0, nextDue: open[0]?.dueDate || '', nextCharge: open[0] || null, depositLeft, bookingDepositLeft, bookingDepositRequired, arrivalBalanceVnd, depositDue, depositAction: !!depositDue && daysBetween(today, depositDue) <= 3, securityHeldVnd: security.reduce((n, c) => n + heldDeposit(c), 0), creditVnd: money(account?.unallocatedVnd), scheduleChanged: !!account && account.fingerprint !== bookingFingerprint(booking), arrivalReady, openCharges: open, charges };
}
export function applyPayment(booking, source, input, today = propertyToday()) {
  if (!source) throw new Error('Set up billing before recording a payment.');
  const account = structuredClone(source);
  const amountVnd = Number(input.amountVnd);
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) throw new Error('Enter a positive, whole VND amount.');
  if (!validDate(input.receivedDate) || input.receivedDate > today) throw new Error('Received date must be today or earlier.');
  const method = String(input.method || '').trim();
  if (!method) throw new Error('Choose a payment method.');
  let candidates;
  if (input.target === 'booking_deposit' || input.target === 'oldest') candidates = account.charges.filter((c) => c.type === 'rent' && remaining(c, booking) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  else candidates = account.charges.filter((c) => c.id === input.target && remaining(c, booking) > 0);
  if (!candidates.length) throw new Error('This obligation is already paid or is prepaid via Airbnb.');
  if (input.target === 'booking_deposit') {
    candidates = candidates.filter((c) => c.id !== 'opening' && (!(account.plan.paymentTerms === 'standard_25_75' || account.plan.splitReservation) || c.role === 'reservation'));
    if (amountVnd > accountSummary(booking, account, today).bookingDepositLeft) throw new Error('Payment exceeds the remaining booking deposit. Record additional rent separately.');
  }
  if (candidates[0].type === 'security' && amountVnd > remaining(candidates[0], booking)) throw new Error('Payment exceeds the security deposit requirement.');
  let unallocatedVnd = amountVnd;
  const allocations = [];
  for (const charge of candidates) {
    const amount = Math.min(unallocatedVnd, remaining(charge, booking));
    if (amount) { charge.paidVnd = money(charge.paidVnd) + amount; allocations.push({ chargeId: charge.id, amountVnd: amount }); unallocatedVnd -= amount; }
  }
  if (input.target === 'booking_deposit') account.bookingDepositPaidVnd = money(account.bookingDepositPaidVnd) + amountVnd - unallocatedVnd;
  account.unallocatedVnd = money(account.unallocatedVnd) + unallocatedVnd;
  account.version++;
  return { account, event: { kind: 'payment', amountVnd, receivedDate: input.receivedDate, method, reference: String(input.reference || '').trim(), note: String(input.note || '').trim(), target: input.target, allocations, unallocatedVnd } };
}
export function applyDepositMovement(booking, source, input) {
  const account = structuredClone(source);
  const charge = account.charges.find((c) => c.type === 'security' && !c.voided);
  const amountVnd = Number(input.amountVnd);
  if (!charge || !Number.isSafeInteger(amountVnd) || amountVnd <= 0 || amountVnd > heldDeposit(charge)) throw new Error('Amount must be within the security deposit currently held.');
  if (!['refund', 'deduction'].includes(input.kind) || !String(input.note || '').trim()) throw new Error('Select refund or deduction and enter a reason.');
  const field = input.kind === 'refund' ? 'refundedVnd' : 'deductedVnd';
  charge[field] = money(charge[field]) + amountVnd;
  account.version++;
  return { account, event: { kind: `security_${input.kind}`, amountVnd, note: input.note.trim(), chargeId: charge.id, bookingId: booking.id } };
}
export function reversePayment(booking, source, payment, reason) {
  if (!['payment', 'credit_allocation', 'adjustment', 'charge', 'due_date', 'security_refund', 'security_deduction'].includes(payment.kind) || payment.reversedBy || !String(reason || '').trim()) throw new Error('Choose an action that has not already been undone and enter a reason.');
  const account = structuredClone(source);
  if (['adjustment', 'charge', 'due_date', 'security_refund', 'security_deduction'].includes(payment.kind)) {
    const charge = account.charges.find((c) => c.id === payment.chargeId && !c.voided);
    if (!charge) throw new Error('This charge is no longer active. Correct the billing schedule first.');
    if (payment.kind === 'adjustment') {
      if (!Number.isSafeInteger(payment.amountVnd) || payment.amountVnd <= 0 || money(charge.creditVnd) < payment.amountVnd) throw new Error('This credit is no longer available to undo.');
      charge.creditVnd -= payment.amountVnd;
    } else if (payment.kind === 'charge') {
      if (charge.type !== 'extra' || charge.paidVnd || charge.creditVnd) throw new Error('Undo this charge’s payments and credits first.');
      charge.voided = true;
    } else if (payment.kind === 'due_date') {
      if (!validDate(payment.previousDueDate)) throw new Error('This older action has no saved previous date. Use Change due date instead.');
      if (charge.dueDate !== payment.dueDate) throw new Error('The due date has changed again. Undo the more recent date change first.');
      charge.dueDate = payment.previousDueDate;
    } else {
      const field = payment.kind === 'security_refund' ? 'refundedVnd' : 'deductedVnd';
      if (!Number.isSafeInteger(payment.amountVnd) || payment.amountVnd <= 0 || money(charge[field]) < payment.amountVnd) throw new Error('This deposit movement is no longer available to undo.');
      charge[field] -= payment.amountVnd;
    }
    account.version++;
    return { account, event: { kind: 'reversal', amountVnd: money(payment.amountVnd), chargeId: charge.id, reverses: payment.id, reversedKind: payment.kind, note: reason.trim(), bookingId: booking.id } };
  }
  if (payment.kind === 'credit_allocation') {
    const charge = account.charges.find((c) => c.id === payment.chargeId);
    if (!charge || money(charge.creditVnd) < payment.amountVnd) throw new Error('The allocated credit is no longer available to reverse.');
    charge.creditVnd -= payment.amountVnd;
    account.unallocatedVnd += payment.amountVnd;
    account.version++;
    return { account, event: { kind: 'reversal', amountVnd: payment.amountVnd, reverses: payment.id, note: reason.trim(), bookingId: booking.id } };
  }
  if (money(account.unallocatedVnd) < money(payment.unallocatedVnd)) throw new Error('The payment credit has already been allocated. Reverse that allocation first.');
  for (const allocation of payment.allocations || []) {
    const charge = account.charges.find((c) => c.id === allocation.chargeId);
    if (!charge || money(charge.paidVnd) < allocation.amountVnd || (charge.type === 'security' && heldDeposit(charge) < allocation.amountVnd)) throw new Error('This payment has been used in a deposit refund or adjustment and cannot be reversed.');
    charge.paidVnd -= allocation.amountVnd;
  }
  account.unallocatedVnd -= money(payment.unallocatedVnd);
  if (payment.target === 'booking_deposit') account.bookingDepositPaidVnd -= payment.amountVnd - money(payment.unallocatedVnd);
  account.version++;
  return { account, event: { kind: 'reversal', amountVnd: payment.amountVnd, reverses: payment.id, note: reason.trim(), bookingId: booking.id } };
}
export function weeklyLaundryStatus(booking, today) {
  const status = booking.longTermOps?.laundryStatus || 'pending';
  const updated = new Date(booking.longTermOps?.laundryUpdatedAt || '');
  if (!['done', 'processing'].includes(status) || Number.isNaN(updated.getTime())) return status;
  const startOfWeek = (date) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  return startOfWeek(propertyToday(updated)) === startOfWeek(today) ? status : 'pending';
}
export function applyCredit(booking, source, target) {
  const account = structuredClone(source);
  const charge = account.charges.find((c) => c.id === target && c.type !== 'security');
  const amountVnd = Math.min(money(account.unallocatedVnd), charge ? remaining(charge, booking) : 0);
  if (amountVnd <= 0) throw new Error('Choose an unpaid charge to apply available credit.');
  charge.creditVnd = money(charge.creditVnd) + amountVnd;
  account.unallocatedVnd -= amountVnd;
  account.version++;
  return { account, event: { kind: 'credit_allocation', amountVnd, chargeId: charge.id, note: 'Applied account credit' } };
}
export function addCharge(source, input) {
  if (!source) throw new Error('Set up billing first.');
  const account = structuredClone(source);
  if (!String(input.title || '').trim() || !validDate(input.dueDate) || !Number.isSafeInteger(Number(input.amountVnd)) || Number(input.amountVnd) <= 0) throw new Error('Enter a charge description, positive whole VND amount, and due date.');
  if (account.charges.length >= 240) throw new Error('This account has reached its charge limit.');
  account.charges.push({ id: input.id, type: 'extra', title: input.title.trim(), dueDate: input.dueDate, amountVnd: Number(input.amountVnd), paidVnd: 0, creditVnd: 0, refundedVnd: 0, deductedVnd: 0 });
  account.version++;
  return { account, event: { kind: 'charge', amountVnd: Number(input.amountVnd), chargeId: input.id, note: input.title.trim() } };
}
// Explicit correction of an unreceived rent schedule; never reinterpret receipts.
export function reviseBillingPlan(booking, source, plan, today, correction = false) {
  const structural = ['billing', 'trackingStart', 'periodBasis', 'cycleAnchor', 'paymentTerms', 'splitReservation'].some((key) => (source.plan[key] || (key === 'periodBasis' ? 'calendar' : '')) !== (plan[key] || (key === 'periodBasis' ? 'calendar' : '')));
  const changedCustomDeposit = plan.splitReservation && Number(source.plan.bookingDepositVnd) !== Number(plan.bookingDepositVnd);
  if (!structural && !changedCustomDeposit) return syncSchedule(booking, { ...source, plan }, today);
  if (!correction) throw new Error('Confirm replacement of the existing rent schedule.');
  if (source.charges.some((c) => c.type === 'rent' && c.id !== 'opening' && !c.voided && (c.paidVnd || c.creditVnd))) throw new Error('This rent schedule has payments or credits. Reverse those allocations before changing its billing periods.');
  const account = structuredClone(source);
  for (const charge of account.charges) {
    if (charge.type === 'rent' && charge.id !== 'opening') charge.voided = true;
  }
  const next = buildSchedule(booking, plan);
  for (const charge of next.filter((c) => c.type === 'rent' && c.id !== 'opening')) {
    const old = account.charges.find((c) => c.id === charge.id);
    if (old) Object.assign(old, charge, { voided: false });
    else account.charges.push(charge);
  }
  return syncSchedule(booking, { ...account, plan }, today);
}
export function syncSchedule(booking, source, today) {
  const account = structuredClone(source);
  if (account.plan.useBookingRate) account.plan.monthlyRentVnd = money(booking.monthlyRentVnd);
  if (account.plan.useBookingTotal) account.plan.totalVnd = money(booking.price);
  const next = cancelled(booking) ? [] : buildSchedule(booking, account.plan);
  const existing = new Map(account.charges.map((c) => [c.id, c]));
  for (const charge of next) {
    const old = existing.get(charge.id);
    if (!old) account.charges.push(charge);
    else if (old.dueDate > today && !old.paidVnd && !old.creditVnd && old.type !== 'security') Object.assign(old, charge, { voided: false });
  }
  const nextIds = new Set(next.map((c) => c.id));
  for (const charge of account.charges) {
    if (charge.type === 'rent' && !nextIds.has(charge.id) && charge.dueDate > today && !charge.paidVnd && !charge.creditVnd) charge.voided = true;
  }
  const imported = new Set(account.importedExtraKeys || []);
  for (const entry of extraEntries(booking)) {
    if (imported.has(entry.key)) continue;
    imported.add(entry.key);
    if (entry.billed || !entry.amountVnd) continue;
    if (entry.amountVnd < 0) account.unallocatedVnd = money(account.unallocatedVnd) - entry.amountVnd;
    else account.charges.push({ id: `extra_${encodeURIComponent(entry.key)}`, type: 'extra', title: entry.title, dueDate: today, amountVnd: entry.amountVnd, paidVnd: 0, creditVnd: 0, refundedVnd: 0, deductedVnd: 0 });
  }
  account.importedExtraKeys = [...imported];
  if (account.charges.length > 240) throw new Error('This account has reached its charge limit.');
  account.fingerprint = bookingFingerprint(booking);
  account.version++;
  return account;
}
export function buildAlerts(booking, account, today = propertyToday()) {
  if (!account) return [];
  const summary = accountSummary(booking, account, today);
  const alerts = [];
  for (const charge of summary.charges) {
    if (remaining(charge, booking) <= 0) continue;
    // A cancelled stay has no new collection reminders, but existing debt stays visible.
    if (cancelled(booking) && charge.dueDate > today) continue;
    const days = daysBetween(charge.dueDate, today);
    if (days < -3) continue;
    alerts.push({ id: `${booking.id}__${charge.id}`, bookingId: booking.id, guestId: booking.guestId || '', guestName: booking.guestName || 'Guest', type: charge.type === 'security' || charge.role === 'reservation' ? 'deposit' : 'payment', title: charge.title, amountVnd: remaining(charge, booking), dueDate: charge.dueDate, stage: days >= 7 ? 'escalated' : days >= 3 ? 'follow_up' : days > 0 ? 'overdue' : days === 0 ? 'due_today' : 'due_soon', daysOverdue: Math.max(0, days) });
  }
  if (!(account.plan.paymentTerms === 'standard_25_75' || account.plan.splitReservation) && summary.bookingDepositLeft && daysBetween(today, account.plan.bookingDepositDue) <= 3) alerts.push({ id: `${booking.id}__booking_deposit`, bookingId: booking.id, guestId: booking.guestId || '', guestName: booking.guestName || 'Guest', type: 'deposit', title: 'Booking deposit', amountVnd: summary.bookingDepositLeft, dueDate: account.plan.bookingDepositDue, stage: account.plan.bookingDepositDue < today ? 'overdue' : 'due_soon' });
  return alerts;
}
