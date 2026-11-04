import { calculateNights, formatDate, parseLocalDateString } from './dates.js';
import { randomId } from './shared.js';

export const isCancelledStatus = (status) => {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'cancelled' || s === 'canceled' || s.startsWith('cancel');
};

export const isBlockingStatus = (status) => {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'confirmed' || s === 'checked-in' || s === 'checked-out';
};

export const isHousekeepingBooking = (booking) => !!booking && (!booking.status || isBlockingStatus(booking.status));

export const getBookingEarlyCheckoutMeta = (booking) => {
  const checkIn = formatDate(booking?.checkIn || '');
  const contractCheckOut = formatDate(booking?.checkOut || '');
  const actualCheckoutDate = formatDate(
    booking?.actualCheckoutDate ||
    booking?.earlyCheckoutDate ||
    booking?.actualEndDate ||
    ''
  );
  const endedEarly = !!(
    booking?.endedEarly ||
    booking?.hasEarlyTermination ||
    booking?.earlyTermination ||
    actualCheckoutDate
  );

  if (!endedEarly || !checkIn || !contractCheckOut || !actualCheckoutDate) {
    return {
      endedEarly: false,
      actualCheckoutDate: '',
      reimbursed: false,
      contractCheckOut,
    };
  }

  if (!(checkIn < actualCheckoutDate && actualCheckoutDate < contractCheckOut)) {
    return {
      endedEarly: false,
      actualCheckoutDate: '',
      reimbursed: false,
      contractCheckOut,
    };
  }

  return {
    endedEarly: true,
    actualCheckoutDate,
    reimbursed: !!booking?.earlyTerminationReimbursed,
    contractCheckOut,
  };
};

export const getBookingOccupancyCheckOut = (booking) => {
  const earlyMeta = getBookingEarlyCheckoutMeta(booking);
  return earlyMeta.endedEarly ? earlyMeta.actualCheckoutDate : earlyMeta.contractCheckOut;
};

export const getBookingFinancialCheckOut = (booking) => {
  const earlyMeta = getBookingEarlyCheckoutMeta(booking);
  if (!earlyMeta.endedEarly) return earlyMeta.contractCheckOut;
  return earlyMeta.reimbursed ? earlyMeta.actualCheckoutDate : earlyMeta.contractCheckOut;
};

export const doDateRangesOverlap = (startA, endA, startB, endB) => {
  if (!startA || !endA || !startB || !endB) return false;
  return startA < endB && startB < endA;
};

export const normalizeRoomMoves = (movesInput = [], { stayStart = '', stayEnd = '', fallbackRent = null } = {}) => {
  if (!Array.isArray(movesInput)) return [];
  return movesInput
    .map((entry) => {
      const moveDate = formatDate(entry?.moveDate || entry?.startDate || entry?.date || '');
      const roomId = entry?.roomId || '';
      const useDifferentMonthlyRent = !!entry?.useDifferentMonthlyRent;
      const nextRent = Number(entry?.monthlyRentVnd);
      const useDifferentChannel = !!entry?.useDifferentChannel;
      const channel = entry?.channel || '';
      const paymentStatus = entry?.paymentStatus || '';

      if (!moveDate || !roomId) return null;
      if (stayStart && moveDate <= stayStart) return null;
      if (stayEnd && moveDate >= stayEnd) return null;
      if (useDifferentMonthlyRent && (!Number.isFinite(nextRent) || nextRent < 0)) return null;
      if (useDifferentChannel && !channel) return null;

      return {
        id: entry?.id || randomId(),
        moveDate,
        roomId,
        useDifferentMonthlyRent,
        useDifferentChannel,
        channel: useDifferentChannel ? channel : '',
        paymentStatus: useDifferentChannel && channel === 'direct' ? paymentStatus : '',
        monthlyRentVnd: useDifferentMonthlyRent
          ? Math.round(nextRent)
          : (Number.isFinite(Number(fallbackRent)) ? Math.round(Number(fallbackRent)) : null),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.moveDate) - new Date(b.moveDate));
};

export const getBookingStaySegments = (booking, { mode = 'occupancy' } = {}) => {
  const checkIn = formatDate(booking?.checkIn || '');
  const checkOut = mode === 'financial'
    ? getBookingFinancialCheckOut(booking)
    : getBookingOccupancyCheckOut(booking);
  const primaryRoomId = booking?.roomId || '';
  if (!checkIn || !checkOut || !primaryRoomId) return [];

  const baseRent = Number(booking?.monthlyRentVnd);
  let currentRent = Number.isFinite(baseRent) ? Math.round(baseRent) : null;
  let currentRoomId = primaryRoomId;
  let currentChannel = booking?.channel || 'airbnb';
  let currentPaymentStatus = currentChannel === 'direct' ? (booking?.paymentStatus || '') : '';
  let currentStart = checkIn;
  const segments = [];
  const roomMoves = normalizeRoomMoves(booking?.roomMoves || [], {
    stayStart: checkIn,
    stayEnd: checkOut,
    fallbackRent: currentRent,
  });

  roomMoves.forEach((move, index) => {
    if (move.moveDate <= currentStart || move.moveDate >= checkOut) return;
    segments.push({
      id: `${booking?.id || 'booking'}_segment_${index}`,
      roomId: currentRoomId,
      startDate: currentStart,
      endDate: move.moveDate,
      monthlyRentVnd: currentRent,
      channel: currentChannel,
      paymentStatus: currentPaymentStatus,
    });
    currentStart = move.moveDate;
    currentRoomId = move.roomId;
    if (move.useDifferentMonthlyRent && Number.isFinite(Number(move.monthlyRentVnd))) {
      currentRent = Math.round(Number(move.monthlyRentVnd));
    }
    if (move.useDifferentChannel && move.channel) {
      currentChannel = move.channel;
      currentPaymentStatus = move.channel === 'direct' ? (move.paymentStatus || '') : '';
    }
  });

  if (currentStart < checkOut) {
    segments.push({
      id: `${booking?.id || 'booking'}_segment_final`,
      roomId: currentRoomId,
      startDate: currentStart,
      endDate: checkOut,
      monthlyRentVnd: currentRent,
      channel: currentChannel,
      paymentStatus: currentPaymentStatus,
    });
  }

  return segments.filter((segment) => segment.roomId && segment.startDate < segment.endDate);
};

export const getBookingRoomStays = (booking, options = {}) => {
  return getBookingStaySegments(booking, options).map((segment) => ({
    id: segment.id,
    roomId: segment.roomId,
    startDate: segment.startDate,
    endDate: segment.endDate,
    monthlyRentVnd: segment.monthlyRentVnd,
  }));
};

export const getBookingRoomIdForDate = (booking, dateStr) => {
  const segment = getBookingStaySegments(booking, { mode: 'occupancy' }).find((stay) => stay.startDate <= dateStr && stay.endDate > dateStr);
  return segment?.roomId || booking?.roomId || '';
};

export const getBookingSegmentForDate = (booking, dateStr) => {
  return getBookingStaySegments(booking, { mode: 'occupancy' }).find((segment) => segment.startDate <= dateStr && segment.endDate > dateStr) || null;
};

export const getBookingChannelForDate = (booking, dateStr) => {
  return getBookingSegmentForDate(booking, dateStr)?.channel || booking?.channel || 'airbnb';
};

export const getBookingChannelSummary = (booking) => {
  const channels = Array.from(new Set(getBookingStaySegments(booking, { mode: 'occupancy' }).map((segment) => (segment.channel || '').toLowerCase()).filter(Boolean)));
  if (channels.length > 1) return 'mixed';
  return channels[0] || (booking?.channel || 'airbnb');
};

export const expandBookingToRoomStays = (booking) => {
  const roomStays = getBookingStaySegments(booking, { mode: 'occupancy' });
  if (!roomStays.length) return [];
  return roomStays.map((stay, index) => ({
    ...booking,
    id: `${booking?.id || 'booking'}__roomstay_${index}`,
    sourceBookingId: booking?.id || null,
    roomId: stay.roomId,
    checkIn: stay.startDate,
    checkOut: stay.endDate,
    monthlyRentVnd: stay.monthlyRentVnd,
    channel: stay.channel,
    paymentStatus: stay.paymentStatus,
    roomStayIndex: index,
    isRoomStaySegment: true,
  }));
};

export const calculateLongTermRentForRange = (booking, startDate, endDate) => {
  // Use parseLocalDateString so all boundaries are local midnight — prevents a
  // timezone-mismatch bug where new Date('YYYY-MM-DD') is UTC midnight but
  // new Date(y,m,d) is local midnight, causing a spurious extra month iteration
  // on the last day of a 31-day month (visible as a doubled value in Excel exports).
  const rangeStart = parseLocalDateString(startDate);
  const rangeEnd = parseLocalDateString(endDate);
  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime()) || rangeStart >= rangeEnd) return 0;

  let totalRent = 0;

  // A full calendar month always costs exactly the configured monthly rent.
  // Partial months and sellable break days use that calendar month's actual
  // length (28/29/30/31 days), never a fixed 30-day billing cycle.
  let currentMonthStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);

  while (currentMonthStart < rangeEnd) {
    const currentMonthEnd = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 1);
    const daysInMonth = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0).getDate();

    const monthOverlapStart = currentMonthStart < rangeStart ? rangeStart : currentMonthStart;
    const monthOverlapEnd = currentMonthEnd > rangeEnd ? rangeEnd : currentMonthEnd;

    getBookingRoomStays(booking, { mode: 'financial' }).forEach(stay => {
      const stayStart = parseLocalDateString(stay.startDate);
      const stayEnd = parseLocalDateString(stay.endDate);

      const segmentOverlapStart = stayStart > monthOverlapStart ? stayStart : monthOverlapStart;
      const segmentOverlapEnd = stayEnd < monthOverlapEnd ? stayEnd : monthOverlapEnd;

      const overlapNights = calculateNights(segmentOverlapStart, segmentOverlapEnd);
      if (overlapNights <= 0) return;

      const deductedBreakNights = countBookingBreakNightsForRange(booking, segmentOverlapStart, segmentOverlapEnd);
      const billableNights = Math.max(0, overlapNights - deductedBreakNights);

      const rent = Number(stay.monthlyRentVnd);
      if (billableNights <= 0 || !Number.isFinite(rent) || rent <= 0) return;

      totalRent += rent * (billableNights / daysInMonth);
    });

    currentMonthStart = currentMonthEnd;
  }

  return Math.round(totalRent);
};

export const getLongStayCalendarMonthCount = (checkIn, checkOut) => {
  const start = parseLocalDateString(checkIn);
  const end = parseLocalDateString(checkOut);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return 0;

  let count = 0;
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor < end) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    if (cursor >= start && nextMonth <= end) count += 1;
    cursor = nextMonth;
  }
  return count;
};

export const normalizeBookingBreaks = (breaksInput = []) => {
  if (!Array.isArray(breaksInput)) return [];
  const normalized = breaksInput
    .map((entry) => {
      const startDate = formatDate(entry?.startDate || entry?.start || '');
      const endDate = formatDate(entry?.endDate || entry?.end || '');
      if (!startDate || !endDate) return null;
      if (endDate <= startDate) return null;
      return {
        id: entry?.id || randomId(),
        startDate,
        endDate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return normalized;
};

export const countBookingBreakNightsForRange = (booking, startDate, endDate) => {
  if (!booking?.sellRoomDuringBreak) return 0;
  const rangeStart = formatDate(startDate);
  const rangeEnd = formatDate(endDate);
  if (!rangeStart || !rangeEnd || rangeStart >= rangeEnd) return 0;

  const breaks = normalizeBookingBreaks(booking?.guestBreakPeriods || booking?.breakPeriods || booking?.breaks || []);
  if (!breaks.length) return 0;

  const coveredDates = new Set();
  breaks.forEach((brk) => {
    const overlapStart = brk.startDate > rangeStart ? brk.startDate : rangeStart;
    const overlapEnd = brk.endDate < rangeEnd ? brk.endDate : rangeEnd;
    if (overlapStart >= overlapEnd) return;
    for (let ts = new Date(overlapStart).getTime(); ts < new Date(overlapEnd).getTime(); ts += 86_400_000) {
      coveredDates.add(formatDate(new Date(ts)));
    }
  });

  return coveredDates.size;
};

export const isDateOnBookingBreak = (booking, dateStr) => {
  const breaks = normalizeBookingBreaks(booking?.guestBreakPeriods || booking?.breakPeriods || booking?.breaks || []);
  if (!breaks.length) return false;
  return breaks.some((brk) => dateStr >= brk.startDate && dateStr < brk.endDate);
};

export const bookingOccupiesDate = (booking, dateStr, roomId = null) => {
  if (!booking || !dateStr) return false;
  const occupancyCheckOut = getBookingOccupancyCheckOut(booking) || booking.checkOut;
  if (!(booking.checkIn <= dateStr && occupancyCheckOut > dateStr)) return false;
  if (roomId && getBookingRoomIdForDate(booking, dateStr) !== roomId) return false;
  return !isDateOnBookingBreak(booking, dateStr);
};

export const getBookingOccupiedDates = (booking, roomId = null) => {
  const occupied = [];
  if (!booking?.checkIn || !booking?.checkOut) return occupied;
  const startTs = new Date(booking.checkIn).getTime();
  const endTs = new Date(getBookingOccupancyCheckOut(booking) || booking.checkOut).getTime();
  if (Number.isNaN(startTs) || Number.isNaN(endTs) || startTs >= endTs) return occupied;

  for (let ts = startTs; ts < endTs; ts += 86_400_000) {
    const dateStr = formatDate(new Date(ts));
    if (bookingOccupiesDate(booking, dateStr, roomId)) occupied.push(dateStr);
  }
  return occupied;
};

export const bookingsOverlapConsideringBreaks = (bookingA, bookingB, roomId = null) => {
  if (!bookingA || !bookingB) return false;
  const overlapStartTs = Math.max(new Date(bookingA.checkIn).getTime(), new Date(bookingB.checkIn).getTime());
  const overlapEndTs = Math.min(
    new Date(getBookingOccupancyCheckOut(bookingA) || bookingA.checkOut).getTime(),
    new Date(getBookingOccupancyCheckOut(bookingB) || bookingB.checkOut).getTime()
  );
  if (Number.isNaN(overlapStartTs) || Number.isNaN(overlapEndTs) || overlapStartTs >= overlapEndTs) return false;

  for (let ts = overlapStartTs; ts < overlapEndTs; ts += 86_400_000) {
    const dateStr = formatDate(new Date(ts));
    if (bookingOccupiesDate(bookingA, dateStr, roomId) && bookingOccupiesDate(bookingB, dateStr, roomId)) return true;
  }
  return false;
};

export const getBookingFinancialDateKeys = (booking) => {
  const startDate = formatDate(booking?.checkIn || '');
  const endDate = getBookingFinancialCheckOut(booking) || formatDate(booking?.checkOut || '');
  if (!startDate || !endDate || startDate >= endDate) return [];

  const keys = [];
  for (let ts = new Date(startDate).getTime(); ts < new Date(endDate).getTime(); ts += 86_400_000) {
    keys.push(formatDate(new Date(ts)));
  }
  return keys;
};

export const getOccupiedDates = (bookings, roomId, excludeBookingId) => {
  const occupied = new Set();
  bookings.forEach((b) => {
    if (isCancelledStatus(b.status) || b.id === excludeBookingId) return;
    getBookingOccupiedDates(b, roomId).forEach((dateStr) => occupied.add(dateStr));
  });
  return occupied;
};
