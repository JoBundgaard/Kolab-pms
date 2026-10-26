import { DEFAULT_CHECKIN_TIME, DEFAULT_CHECKOUT_TIME, HOUSEKEEPING_END_TIME, HOUSEKEEPING_START_TIME } from '../config/pms.js';
import { ALL_ROOMS } from '../config/properties.js';
import { bookingOccupiesDate, expandBookingToRoomStays, isCancelledStatus } from './bookingDates.js';
import { getWeekdayKey, minutesToTime, timeToMinutes } from './dates.js';

export const getDaySummaryForDate = (dateStr, bookings) => {
  const occupancyBookings = bookings.flatMap((booking) => expandBookingToRoomStays(booking));
  const dayCheckIns = occupancyBookings.filter(
    (b) => !isCancelledStatus(b.status) && b.checkIn === dateStr
  );
  const dayCheckOuts = occupancyBookings.filter(
    (b) => !isCancelledStatus(b.status) && b.checkOut === dateStr
  );

  const earlyCheckIns = dayCheckIns.filter((b) => !!b.earlyCheckIn);

  const weekdayKey = getWeekdayKey(dateStr);
  const longTermCleans = occupancyBookings.filter((b) => {
    if (!b.isLongTerm) return false;
    if (isCancelledStatus(b.status)) return false;
    if (!b.weeklyCleaningDay) return false;
    if (b.weeklyCleaningDay !== weekdayKey) return false;
    return bookingOccupiesDate(b, dateStr, b.roomId);
  });

  const roomsToClean = dayCheckOuts.length + longTermCleans.length;

  return {
    checkIns: dayCheckIns.length,
    earlyCheckIns: earlyCheckIns.length,
    checkOuts: dayCheckOuts.length,
    longTermCleans: longTermCleans.length,
    roomsToClean,
  };
};

export function buildCleaningTasksForDate(targetDateStr, bookings, roomStatuses) {
  const occupancyBookings = bookings.flatMap((booking) => expandBookingToRoomStays(booking));
  const checkoutsForDate = occupancyBookings
    .filter((b) => b.checkOut === targetDateStr && !isCancelledStatus(b.status) && b.status !== 'checked-out');

  const checkoutRoomIds = checkoutsForDate.map((b) => b.roomId);
  const weekdayKey = getWeekdayKey(targetDateStr);

  const longTermCleaningRooms = new Set(
    occupancyBookings
      .filter((b) => {
        if (!b.isLongTerm) return false;
        if (isCancelledStatus(b.status)) return false;
        if (!b.weeklyCleaningDay) return false;
        if (b.weeklyCleaningDay !== weekdayKey) return false;
        // Only treat as weekly clean when guest is already in-house before target date.
        return b.checkIn < targetDateStr && bookingOccupiesDate(b, targetDateStr, b.roomId);
      })
      .map((b) => b.roomId)
  );

  const housekeepingStart = timeToMinutes(HOUSEKEEPING_START_TIME, 600);
  const housekeepingEnd = timeToMinutes(HOUSEKEEPING_END_TIME, 1080);
  const defaultCheckout = timeToMinutes(DEFAULT_CHECKOUT_TIME, 720);
  const defaultCheckin = timeToMinutes(DEFAULT_CHECKIN_TIME, 900);

  const priorityRank = { high: 1, normal: 2, low: 3 };

  const allRoomsData = ALL_ROOMS.map((room) => {
    const statusData = roomStatuses[room.id] || {};
    const storedStatus = statusData.status || 'clean';

    const incomingToday = bookings.find(
      (b) => b.roomId === room.id && b.checkIn === targetDateStr && !isCancelledStatus(b.status)
    );

    const isCheckout = checkoutRoomIds.includes(room.id);
    const checkoutBooking = isCheckout ? checkoutsForDate.find((b) => b.roomId === room.id) : null;
    const isLongTermClean = longTermCleaningRooms.has(room.id);
    const isArrivalOnThisDay = !!incomingToday;
    const hasEarlyCheckIn = !!(incomingToday && incomingToday.earlyCheckIn);
    const isWeeklyServiceClean = isLongTermClean;

    let earliestStartMinutes = null;
    let latestEndMinutes = null;
    let priorityLabel = 'normal';
    let needsCleaning = false;

    if (isWeeklyServiceClean) {
      needsCleaning = true;
      earliestStartMinutes = housekeepingStart;
      latestEndMinutes = housekeepingEnd;
      priorityLabel = 'low';
    } else if (isCheckout) {
      needsCleaning = true;
      const checkoutTime = timeToMinutes(checkoutBooking?.checkOutTime, defaultCheckout);
      earliestStartMinutes = Math.max(housekeepingStart, checkoutTime);
      if (incomingToday) {
        const nextCheckinTime = timeToMinutes(incomingToday.checkInTime, defaultCheckin);
        latestEndMinutes = nextCheckinTime;
      } else {
        latestEndMinutes = housekeepingEnd;
      }

      if (incomingToday && hasEarlyCheckIn) {
        priorityLabel = 'high';
      } else {
        priorityLabel = 'normal';
      }
    } else if (storedStatus === 'dirty') {
      needsCleaning = true;
      earliestStartMinutes = housekeepingStart;
      latestEndMinutes = housekeepingEnd;
      priorityLabel = 'normal';
    }

    const hasScheduleConflict = Number.isFinite(earliestStartMinutes) && Number.isFinite(latestEndMinutes)
      ? earliestStartMinutes > latestEndMinutes
      : false;

    return {
      roomId: room.id,
      roomName: room.name,
      propertyName: room.propertyName,
      roomType: room.type,
      status: isCheckout ? 'checkout_dirty' : storedStatus,
      assignedStaff: statusData.assignedStaff || 'Unassigned',
      priority: priorityRank[priorityLabel] || 2,
      priorityLabel,
      needsCleaning,
      isEarlyCheckinPrep: hasEarlyCheckIn,
      isLongTermCleaning: isLongTermClean,
      isArrivalOnThisDay,
      hasEarlyCheckIn,
      isWeeklyServiceClean,
      checkoutBooking,
      guestName: checkoutBooking?.guestName || incomingToday?.guestName || '',
      earliestStartMinutes,
      latestEndMinutes,
      earliestLabel: minutesToTime(earliestStartMinutes),
      latestLabel: minutesToTime(latestEndMinutes),
      hasScheduleConflict,
    };
  });

  return allRoomsData
    .filter((r) => r.needsCleaning)
    .sort((a, b) => (a.priority - b.priority) || (a.earliestStartMinutes ?? Infinity) - (b.earliestStartMinutes ?? Infinity) || a.roomName.localeCompare(b.roomName));
}

export function splitCleaningByPriority(cleaningTasksList = []) {
  const groups = { high: [], normal: [], low: [] };
  cleaningTasksList.forEach((task) => {
    const bucket = task.priorityLabel || 'normal';
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(task);
  });

  const sorter = (a, b) =>
    (a.priority - b.priority) || (a.earliestStartMinutes ?? Infinity) - (b.earliestStartMinutes ?? Infinity) || a.roomName.localeCompare(b.roomName);

  return {
    high: (groups.high || []).sort(sorter),
    normal: (groups.normal || []).sort(sorter),
    low: (groups.low || []).sort(sorter),
  };
}
