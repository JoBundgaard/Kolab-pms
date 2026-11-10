import { PROPERTIES } from '../config/properties.js';
import { getBookingFinancialCheckOut, getBookingFinancialDateKeys, getBookingRoomStays, isCancelledStatus, isDateOnBookingBreak } from './bookingDates.js';
import { getDisplayPriceForBooking } from './airbnb.js';
import { validDate } from '../../functions/lib/crmFinance.mjs';

export const FINANCE_CATEGORIES = [
  ['rent', 'Property rent', 'operating'], ['cleaning', 'Cleaning', 'operating'],
  ['linen', 'Laundry · bed linen', 'operating'], ['guest_laundry', 'Laundry · clothes', 'operating'],
  ['wifi', 'Wi-Fi', 'operating'], ['utilities', 'Water, electricity & trash', 'operating'],
  ['maintenance', 'Maintenance', 'operating'], ['supplies', 'Supplies', 'operating'],
  ['guest_relations', 'Guest relations', 'operating'], ['salaries', 'Salaries', 'overhead'],
  ['software', 'Software & subscriptions', 'overhead'], ['marketing', 'Marketing', 'overhead'],
  ['other_overhead', 'Other overhead', 'overhead'], ['interest', 'Interest', 'interest'],
  ['tax', 'Tax', 'tax'], ['loan_principal', 'Loan principal repayment', 'financing'],
  ['owner_drawings', 'Owner drawings', 'financing'],
].map(([id, label, group]) => ({ id, label, group }));
export const FINANCE_SCOPES = [...PROPERTIES.map(({ id, name }) => ({ id, name })), { id: 'shared', name: 'Company / shared' }, { id: 'unassigned', name: 'Unassigned' }];
export const financeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const validFinanceMonth = (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '');
const propertyForRoom = (roomId) => PROPERTIES.find((p) => p.rooms.some((r) => r.id === roomId))?.id || 'unassigned';
const categoryFor = (id) => FINANCE_CATEGORIES.find((c) => c.id === id);

export function normalizeFinanceEntry(input, today = financeToday()) {
  const kind = input.kind;
  if (!['expense', 'other_income', 'payout'].includes(kind)) throw new Error('Choose an entry type.');
  const amountVnd = Number(input.amountVnd);
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) throw new Error('Enter a positive whole VND amount.');
  if (!validDate(input.date)) throw new Error('Enter a valid income or expense date.');
  if (!FINANCE_SCOPES.some((p) => p.id === input.propertyId)) throw new Error('Choose a property or company costs.');
  if (!String(input.description || '').trim()) throw new Error('Enter a description.');
  if (kind === 'expense' && !categoryFor(input.category)) throw new Error('Choose an expense category.');
  const paymentDate = input.paymentDate || '';
  if (paymentDate && (!validDate(paymentDate) || paymentDate > today)) throw new Error('Receipt/payment date must be today or earlier.');
  if (kind === 'payout' && !paymentDate) throw new Error('Enter the actual payout receipt date.');
  if (paymentDate && !String(input.method || '').trim()) throw new Error('Enter the payment account or method.');
  return { kind, amountVnd, date: input.date, month: input.date.slice(0, 7), propertyId: input.propertyId,
    description: input.description.trim().slice(0, 500), category: kind === 'expense' ? input.category : kind,
    paymentDate, paymentMonth: paymentDate.slice(0, 7), method: String(input.method || '').trim().slice(0, 120),
    reference: String(input.reference || '').trim().slice(0, 200), status: 'active' };
}

// Management estimate using the PMS's existing net pricing and calendar-month
// rent basis. Does not create charges, receipts, or a second CRM ledger.
export function bookingIncomeRows(bookings, month) {
  if (!validFinanceMonth(month)) return [];
  const rows = [];
  for (const booking of bookings) {
    if (isCancelledStatus(booking.status)) continue;
    const dates = getBookingFinancialDateKeys(booking);
    const category = booking.stayCategory?.toLowerCase();
    const hasRent = (value) => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
    const stays = getBookingRoomStays({ ...booking, monthlyRentVnd: hasRent(booking.monthlyRentVnd) ? booking.monthlyRentVnd : undefined }, { mode: 'financial' });
    const hasMonthlyRate = hasRent(booking.monthlyRentVnd) || stays.some((stay) => hasRent(stay.monthlyRentVnd));
    // Explicit short/medium categories take precedence over legacy flags.
    // Older monthly bookings may have a rate without a category or flag.
    const usesMonthlyRent = category === 'long' || (!category && (booking.isLongTerm || hasMonthlyRate));
    const total = Math.round(getDisplayPriceForBooking(booking));
    const base = dates.length ? Math.floor(total / dates.length) : 0;
    const remainder = total - base * dates.length;
    const groups = new Map();
    // A missing room assignment must not remove priced bookings from group income.
    const incomeStays = stays.length ? stays : dates.length ? [{ startDate: dates[0], endDate: getBookingFinancialCheckOut(booking), monthlyRentVnd: booking.monthlyRentVnd }] : [];
    for (const stay of incomeStays) {
      const propertyId = propertyForRoom(stay.roomId);
      for (let day = 1; day <= 31; day++) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        if (!validDate(date) || date < stay.startDate || date >= stay.endDate) continue;
        let amount;
        if (usesMonthlyRent && hasRent(stay.monthlyRentVnd)) {
          if (booking.sellRoomDuringBreak && isDateOnBookingBreak(booking, date)) continue;
          const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
          amount = (Number(stay.monthlyRentVnd) || 0) / daysInMonth;
        } else {
          const index = dates.indexOf(date);
          if (index < 0) continue;
          amount = base + (index < remainder ? 1 : 0);
        }
        groups.set(propertyId, (groups.get(propertyId) || 0) + amount);
      }
    }
    for (const [propertyId, amount] of groups) rows.push({ id: `${booking.id}:${propertyId}`, bookingId: booking.id, propertyId,
      description: booking.guestName || booking.name || booking.id, channel: booking.channel || '', amountVnd: Math.round(amount) });
  }
  return rows;
}

export function buildFinanceReport({ bookings = [], payments = [], entries = [], month, propertyId = 'all' }) {
  const matches = (entry) => propertyId === 'all' || entry.propertyId === propertyId;
  const incomeRows = bookingIncomeRows(bookings, month).filter(matches);
  const active = entries.filter((e) => e.status === 'active' && matches(e));
  const period = active.filter((e) => e.month === month);
  const paid = active.filter((e) => e.paymentMonth === month && e.paymentDate);
  const sum = (list) => list.reduce((n, e) => n + e.amountVnd, 0);
  const expenseByGroup = (group) => sum(period.filter((e) => e.kind === 'expense' && categoryFor(e.category)?.group === group));
  const netAccommodation = sum(incomeRows);
  const otherIncome = sum(period.filter((e) => e.kind === 'other_income'));
  const operating = expenseByGroup('operating');
  const overhead = expenseByGroup('overhead');
  const interest = expenseByGroup('interest');
  const tax = expenseByGroup('tax');
  const bookingMap = new Map(bookings.map((b) => [b.id, b]));
  const receipts = payments.filter((p) => p.kind === 'payment' && !p.reversedBy && p.receivedDate?.startsWith(month)).map((p) => {
    const booking = bookingMap.get(p.bookingId);
    // Receipt scope follows the booked property at receipt date. Unknown bookings
    // remain visible in Unassigned, never silently disappear from group totals.
    const stay = booking && getBookingRoomStays(booking).find((s) => s.startDate <= p.receivedDate && s.endDate > p.receivedDate);
    return { ...p, propertyId: propertyForRoom(stay?.roomId || booking?.roomId), description: booking?.guestName || p.bookingId };
  }).filter(matches);
  const crmReceipts = sum(receipts);
  const manualReceipts = sum(paid.filter((e) => e.kind !== 'expense'));
  const cashOut = sum(paid.filter((e) => e.kind === 'expense'));
  return { incomeRows, receipts, netAccommodation, otherIncome, operating, overhead, interest, tax,
    profit: netAccommodation + otherIncome - operating - overhead - interest - tax,
    crmReceipts, manualReceipts, cashOut, cashMovement: crmReceipts + manualReceipts - cashOut,
    unpaidExpenses: sum(period.filter((e) => e.kind === 'expense' && (!e.paymentDate || e.paymentDate > `${month}-31`))),
    categories: FINANCE_CATEGORIES.map((c) => ({ ...c, amountVnd: sum(period.filter((e) => e.kind === 'expense' && e.category === c.id)) })),
  };
}
