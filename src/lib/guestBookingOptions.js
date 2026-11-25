import { daysBetween, lifecycle, occupancyEnd, validDate } from '../../functions/lib/crmFinance.mjs';

export const normalizeGuestSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
const groups = [ ['current', 'Currently staying'], ['soon', 'Arriving soon · next 14 days'], ['future', 'Future arrivals'], ['past', 'Past guests'], ['cancelled', 'Cancelled / no-show'], ['other', 'Other bookings'] ];
export function guestBookingGroups(bookings, query, today) {
  const tokens = normalizeGuestSearch(query).split(/\s+/).filter(Boolean);
  const result = groups.map(([key, label]) => ({ key, label, bookings: [] }));
  for (const booking of bookings) {
    const searchable = normalizeGuestSearch(`${booking.guestName || ''} ${booking.guestEmail || ''} ${booking.roomId || ''}`);
    if (!tokens.every((token) => searchable.includes(token))) continue;
    const status = lifecycle(booking, today);
    const key = status === 'cancelled' ? 'cancelled' : !validDate(booking.checkIn) || !validDate(occupancyEnd(booking)) ? 'other' : status === 'inhouse' ? 'current' : status === 'past' ? 'past' : daysBetween(today, booking.checkIn) <= 14 ? 'soon' : 'future';
    result.find((group) => group.key === key).bookings.push(booking);
  }
  for (const group of result) group.bookings.sort((a, b) => {
    const date = group.key === 'past' ? String(occupancyEnd(b)).localeCompare(String(occupancyEnd(a))) : group.key === 'current' ? String(occupancyEnd(a)).localeCompare(String(occupancyEnd(b))) : String(a.checkIn).localeCompare(String(b.checkIn));
    return date || (a.guestName || '').localeCompare(b.guestName || '') || String(a.id).localeCompare(String(b.id));
  });
  return result.filter((group) => group.bookings.length);
}
