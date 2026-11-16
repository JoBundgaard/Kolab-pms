import { useEffect, useId, useState } from 'react';
import { ALL_ROOMS } from '../config/properties.js';
import { occupancyEnd, propertyToday } from '../../functions/lib/crmFinance.mjs';
import { guestBookingGroups } from '../lib/guestBookingOptions.js';

export default function GuestBookingSelect({ bookings, value, onChange, rooms = ALL_ROOMS }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [today, setToday] = useState(propertyToday);
  useEffect(() => {
    const timer = setInterval(() => setToday(propertyToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  const groups = guestBookingGroups(bookings, query, today);
  const selected = bookings.find((booking) => booking.id === value);
  const hiddenSelected = selected && !groups.some((group) => group.bookings.some((booking) => booking.id === value));
  const label = (booking) => `${booking.guestName || 'Unknown guest'} — ${booking.checkIn || 'No arrival date'} → ${occupancyEnd(booking) || 'No departure date'} — ${rooms.find((room) => room.id === booking.roomId)?.name || booking.roomId || 'No room'}`;
  const inputClass = 'w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white text-slate-800';
  return <div className="space-y-2">
    <label htmlFor={`${id}-search`} className="block text-xs font-bold uppercase tracking-wider text-slate-500">Find guest by name</label>
    <input id={`${id}-search`} type="search" autoComplete="off" placeholder="Type a guest name…" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`} className="text-xs text-slate-500" role="status">{query.trim() ? `${groups.reduce((n, group) => n + group.bookings.length, 0)} matching bookings` : 'Current guests first, then upcoming arrivals and past guests. Soon = next 14 days.'}</p>
    <label htmlFor={`${id}-booking`} className="block text-xs font-bold uppercase tracking-wider text-slate-500">Select guest / booking</label>
    <select id={`${id}-booking`} className={inputClass} value={value} size={query.trim() ? 8 : 1} onChange={(event) => onChange(event.target.value)}>
      <option value="">{groups.length ? '-- Select a Guest --' : 'No matching guests'}</option>
      {hiddenSelected && <optgroup label="Selected booking"><option value={selected.id}>{label(selected)}</option></optgroup>}
      {groups.map((group) => <optgroup key={group.key} label={`${group.label} (${group.bookings.length})`}>{group.bookings.map((booking) => <option value={booking.id} key={booking.id}>{label(booking)}</option>)}</optgroup>)}
    </select>
  </div>;
}
