const safeFormatDate = (val) => {
  const input = val && val.toDate ? val.toDate() : val;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const weekdayKey = (dateStr) => {
  const d = new Date(dateStr);
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[d.getDay ? d.getDay() : 0] || 'sunday';
};

const normalizeBookingBreaks = (breaksInput = []) => {
  if (!Array.isArray(breaksInput)) return [];
  return breaksInput
    .map((entry) => {
      const startDate = safeFormatDate(entry?.startDate || entry?.start || '');
      const endDate = safeFormatDate(entry?.endDate || entry?.end || '');
      if (!startDate || !endDate) return null;
      if (new Date(endDate).getTime() < new Date(startDate).getTime()) return null;
      return { startDate, endDate };
    })
    .filter(Boolean);
};

const isDateOnBookingBreak = (booking, dateStr) => {
  const breaks = normalizeBookingBreaks(booking?.guestBreakPeriods || booking?.breakPeriods || booking?.breaks || []);
  if (!breaks.length) return false;
  return breaks.some((brk) => dateStr >= brk.startDate && dateStr <= brk.endDate);
};

export function normalizeHousekeepingTasks({ bookings = [], rooms = [], targetDate, overrides = {} }) {
  const dateStr = safeFormatDate(targetDate);
  if (!dateStr) return [];

  const roomMap = new Map();
  (rooms || []).forEach((r) => {
    if (!r?.id) return;
    roomMap.set(r.id, r);
  });

  const tasks = [];
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const weekday = weekdayKey(dateStr);

  safeBookings.forEach((booking) => {
    if (!booking || booking.status === 'cancelled') return;
    const checkIn = safeFormatDate(booking.checkIn);
    const checkOut = safeFormatDate(booking.checkOut);
    const room = booking.roomId ? roomMap.get(booking.roomId) : null;
    const base = {
      propertyId: room?.propertyId || 'unknown',
      propertyName: room?.propertyName || 'Unknown property',
      roomId: booking.roomId || 'unknown-room',
      roomLabel: room?.name || booking.roomId || 'Room',
      priority: 1,
      assignedTo: null,
      sourceBookingId: booking.sourceBookingId || booking.id || null,
      dueDate: dateStr,
    };

    // Checkout task
    if (checkOut === dateStr) {
      const id = `hk_${booking.id || booking.roomId || 'unknown'}_${dateStr}_checkout`;
      const override = overrides[id] || {};
      tasks.push({
        ...base,
        id,
        type: 'checkout',
        status: override.status || 'dirty',
        priority: override.priority ?? 1,
        assignedTo: override.assignedTo ?? null,
      });
    }

    // Weekly task for long/medium stays
    const isLong = booking.isLongTerm || booking.stayCategory === 'medium' || booking.stayCategory === 'long';
    if (isLong && booking.weeklyCleaningDay === weekday && checkIn && checkOut && checkIn < dateStr && checkOut > dateStr) {
      if (isDateOnBookingBreak(booking, dateStr)) return;
      const id = `hk_${booking.id || booking.roomId || 'unknown'}_${dateStr}_weekly`;
      const override = overrides[id] || {};
      tasks.push({
        ...base,
        id,
        type: 'weekly',
        status: override.status || 'dirty',
        priority: override.priority ?? 3,
        assignedTo: override.assignedTo ?? null,
      });
    }
  });

  return tasks;
}
