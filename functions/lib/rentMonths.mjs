// Calendar months anchored to arrival: Jan 31 -> Feb 28 -> Mar 31.
const DAY = 86400000;
const valid = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
export function addRentMonths(anchor, count) {
  if (!valid(anchor)) return '';
  const [year, month, day] = anchor.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + count, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}
export function rentMonthPeriods(anchor, end, basis = 'anniversary') {
  if (!valid(anchor) || !valid(end) || anchor >= end) return [];
  const result = [];
  const origin = basis === 'calendar' ? `${anchor.slice(0, 7)}-01` : anchor;
  for (let index = 0, start = origin; start < end; index++) {
    const next = addRentMonths(origin, index + 1);
    result.push({ start, end: next, days: Math.round((Date.parse(next) - Date.parse(start)) / DAY) });
    start = next;
  }
  return result;
}
export function rentDuration(start, end) {
  if (!valid(start) || !valid(end) || start >= end) return { months: 0, nights: 0 };
  let months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7));
  if (addRentMonths(start, months) > end) months--;
  const nights = Math.round((Date.parse(end) - Date.parse(addRentMonths(start, months))) / DAY);
  return { months, nights };
}
export function classifyStay(booking = {}) {
  if (rentDuration(booking.checkIn, booking.checkOut).months >= 1) return 'long';
  if (['short', 'medium', 'long'].includes(booking.stayCategory)) return booking.stayCategory;
  const nights = valid(booking.checkIn) && valid(booking.checkOut) ? Math.round((Date.parse(booking.checkOut) - Date.parse(booking.checkIn)) / DAY) : Number(booking.nights) || 0;
  return nights >= 7 ? 'medium' : 'short';
}
