import { ALL_ROOMS, countAvailableRoomNights } from '../../config/properties.js';
import { KOLAB_2025_FINANCIALS, KOLAB_2025_KPIS, NEIGHBOURS_2025_FINANCIALS, NEIGHBOURS_2025_KPIS, TOWNHOUSE_2025_FINANCIALS, TOWNHOUSE_2025_KPIS } from '../../data/financialBaselines.js';
import { calculateLongTermRentForRange } from '../../lib/bookingDates.js';
import { calculateNights, formatDate } from '../../lib/dates.js';
import { useMemo } from 'react';

export default function useStatistics({ bookings, bookingsWithWithholding, getBookingStayCategory, statsRange, customStatsStart, customStatsEnd }) {
  const calculateStats = (rangeKey, customStart, customEnd) => {
    const netForBooking = (booking) => {
      const isLong = (booking.stayCategory || '').toLowerCase() === 'long' || booking.isLongTerm;
      if (isLong) {
        return calculateLongTermRentForRange(booking, rangeStart, rangeEnd);
      }
      const w = booking._withholding || {};
      if (w.status === 'computed' && Number.isFinite(w.finalCountedIncome)) return w.finalCountedIncome;
      return Number(booking.price) || 0;
    };

    const commissionForBooking = (booking) => (booking._withholding?.status === 'computed' ? booking._withholding.commissionWithheld || 0 : 0);
    const vatForBooking = (booking) => (booking._withholding?.status === 'computed' ? booking._withholding.vatWithheld || 0 : 0);
    const incomeForBooking = (booking) => (booking._withholding?.status === 'computed' ? booking._withholding.incomeTaxWithheld || 0 : 0);

    const msInDay = 86400000;
    const today = new Date();
    const todayClamp = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const currentYear = today.getFullYear();
    const startOfWeek = (d) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      const day = (copy.getDay() + 6) % 7; // Monday as start
      copy.setDate(copy.getDate() - day);
      return copy;
    };
    const addDays = (d, days) => new Date(d.getTime() + days * msInDay);
    const clampDate = (input) => {
      const d = new Date(input);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    let rangeStart;
    let rangeEnd;
    if (rangeKey === 'this-month') {
      rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
      rangeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    } else if (rangeKey === 'last-30') {
      rangeStart = addDays(today, -29);
      rangeEnd = addDays(today, 1);
    } else if (rangeKey === 'custom') {
      const cStart = clampDate(customStart);
      const cEnd = clampDate(customEnd ? addDays(new Date(customEnd), 1) : customEnd);
      rangeStart = cStart || startOfWeek(today);
      rangeEnd = cEnd && cEnd > rangeStart ? cEnd : addDays(rangeStart, 7);
    } else {
      rangeStart = startOfWeek(today);
      rangeEnd = addDays(rangeStart, 7);
    }

    const rangeDays = Math.max(1, Math.round((rangeEnd - rangeStart) / msInDay));
    const rangeStartStr = formatDate(rangeStart);
    const rangeEndStr = formatDate(addDays(rangeEnd, -1));

    const overlapNights = (booking) => {
      const checkIn = clampDate(booking.checkIn);
      const checkOut = clampDate(booking.checkOut);
      if (!checkIn || !checkOut) return 0;
      const start = checkIn > rangeStart ? checkIn : rangeStart;
      const end = checkOut < rangeEnd ? checkOut : rangeEnd;
      const diff = end - start;
      return diff > 0 ? Math.round(diff / msInDay) : 0;
    };

    const overlapping = bookingsWithWithholding
      .map((b) => ({ ...b, _overlapNights: overlapNights(b) }))
      .filter((b) => b._overlapNights > 0);

    const active = overlapping.filter((b) => b.status !== 'cancelled');
    const airbnbActive = active.filter((b) => (b.channel || '').toLowerCase() === 'airbnb');
    const withholdingComputedRange = airbnbActive.filter((b) => b._withholding?.status === 'computed');
    const withholdingUnknownRange = airbnbActive.filter((b) => b._withholding?.status === 'withholding_unknown');

    const roomNightsAvailable = Math.max(1, countAvailableRoomNights(ALL_ROOMS, rangeStartStr, formatDate(rangeEnd)));
    const roomNightsBooked = active.reduce((sum, b) => sum + (b._overlapNights || 0), 0);
    const revenue = active.reduce((sum, b) => {
    const isLong = (b.stayCategory || '').toLowerCase() === 'long' || b.isLongTerm;
    if (isLong) {
        return sum + calculateLongTermRentForRange(b, rangeStart, rangeEnd);
    }
    const totalNights = b.nights || calculateNights(b.checkIn, b.checkOut) || 1;
    const prorateFactor = b._overlapNights / totalNights;
    const w = b._withholding || {};
    const bookingValue = (w.status === 'computed' && Number.isFinite(w.finalCountedIncome))
        ? w.finalCountedIncome
        : (Number(b.price) || 0);

    return sum + (bookingValue * prorateFactor);
}, 0);
    const commissionWithheldRange = withholdingComputedRange.reduce((sum, b) => sum + commissionForBooking(b), 0);
    const vatWithheldRange = withholdingComputedRange.reduce((sum, b) => sum + vatForBooking(b), 0);
    const incomeWithheldRange = withholdingComputedRange.reduce((sum, b) => sum + incomeForBooking(b), 0);
    const totalWithheldRange = commissionWithheldRange + vatWithheldRange + incomeWithheldRange;
    const withholdingUnknownCount = withholdingUnknownRange.length;

    const groupWithholdingByProperty = (list) => {
      const map = {};
      list.forEach((b) => {
        const room = ALL_ROOMS.find((r) => r.id === b.roomId);
        const key = room?.propertyName || 'Unknown';
        if (!map[key]) map[key] = { property: key, commission: 0, vat: 0, income: 0, total: 0, computedCount: 0 };
        map[key].commission += commissionForBooking(b);
        map[key].vat += vatForBooking(b);
        map[key].income += incomeForBooking(b);
        map[key].total += commissionForBooking(b) + vatForBooking(b) + incomeForBooking(b);
        map[key].computedCount += 1;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    };

    const withholdingRangeByProperty = groupWithholdingByProperty(withholdingComputedRange);
    const avgLengthOfStay = active.length ? (roomNightsBooked / active.length).toFixed(1) : '0';
    const adr = roomNightsBooked ? revenue / roomNightsBooked : 0;
    const revPar = revenue / roomNightsAvailable;
    const occupancyRate = Math.min(100, Math.round((roomNightsBooked / roomNightsAvailable) * 100));

    const leadTimes = active
      .map((b) => {
        if (!b.createdAt || !b.checkIn) return null;
        const created = clampDate(b.createdAt);
        const checkIn = clampDate(b.checkIn);
        if (!created || !checkIn) return null;
        const diffDays = Math.max(0, Math.round((checkIn - created) / msInDay));
        return diffDays;
      })
      .filter((v) => v !== null);
    const avgLeadTime = leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0;

    const cancelled = overlapping.filter((b) => b.status === 'cancelled').length;
    const cancellationRate = overlapping.length ? Math.round((cancelled / overlapping.length) * 100) : 0;

    const dayKeys = Array.from({ length: rangeDays }, (_, i) => formatDate(addDays(rangeStart, i)));
    const checkInCounts = Object.fromEntries(dayKeys.map((d) => [d, 0]));
    const checkOutCounts = Object.fromEntries(dayKeys.map((d) => [d, 0]));

    active.forEach((b) => {
      if (checkInCounts[b.checkIn] !== undefined) checkInCounts[b.checkIn] += 1;
      if (checkOutCounts[b.checkOut] !== undefined) checkOutCounts[b.checkOut] += 1;
    });

    const turnoverDays = dayKeys.map((d) => ({
      date: d,
      checkIns: checkInCounts[d] || 0,
      checkOuts: checkOutCounts[d] || 0,
    })).map((d) => ({ ...d, total: d.checkIns + d.checkOuts }));

    const peakTurnover = turnoverDays.reduce((max, d) => (d.total > max.total ? d : max), { date: rangeStartStr, total: 0, checkIns: 0, checkOuts: 0 });
    const sameDayTurnovers = turnoverDays.filter((d) => d.checkIns > 0 && d.checkOuts > 0).length;

    const stayMix = active.reduce((acc, b) => {
      const cat = getBookingStayCategory(b);
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const channelBreakdown = active.reduce((acc, b) => {
      const ch = (b.channel || 'unknown').toLowerCase();
      acc[ch] = (acc[ch] || 0) + 1;
      return acc;
    }, {});

    const propertyLoad = ALL_ROOMS.reduce((acc, room) => {
      const key = room.propertyName || 'Unknown';
      if (!acc[key]) {
        acc[key] = { rooms: 0, nights: 0 };
      }
      acc[key].rooms += 1;
      return acc;
    }, {});

    active.forEach((b) => {
      const room = ALL_ROOMS.find((r) => r.id === b.roomId);
      const key = room?.propertyName || 'Unknown';
      if (!propertyLoad[key]) propertyLoad[key] = { rooms: 0, nights: 0 };
      propertyLoad[key].nights += b._overlapNights || 0;
    });

    const propertyLoadArray = Object.entries(propertyLoad).map(([name, data]) => {
      const propertyRooms = ALL_ROOMS.filter((room) => room.propertyName === name);
      const capacityNights = Math.max(1, countAvailableRoomNights(propertyRooms, rangeStartStr, formatDate(rangeEnd)));
      const occupancy = Math.min(100, Math.round((data.nights / capacityNights) * 100));
      return { name, occupancy, nights: data.nights, rooms: data.rooms };
    });

    // Revenue trend for context (last 6 months)
    const currentMonth = today.getMonth();
    const trendYear = today.getFullYear();
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const monthName = d.toLocaleString('default', { month: 'short' });
      const monthIdx = d.getMonth();
      const year = d.getFullYear();
      const monthlyRevenue = bookingsWithWithholding
        .filter((b) => {
          const bDate = new Date(b.checkIn);
          return bDate.getMonth() === monthIdx && bDate.getFullYear() === year && b.status !== 'cancelled';
        })
        .reduce((sum, b) => sum + netForBooking(b), 0);
      last6Months.push({ month: monthName, revenue: monthlyRevenue });
    }

    const ytdBookings = bookingsWithWithholding
      .filter((b) => {
        const checkInDate = clampDate(b.checkIn);
        if (!checkInDate) return false;
        if (checkInDate < startOfYear || checkInDate >= addDays(todayClamp, 1)) return false;
        if (b.status === 'cancelled') return false;
        return (b.channel || '').toLowerCase() === 'airbnb';
      });
    const ytdComputed = ytdBookings.filter((b) => b._withholding?.status === 'computed');
    const ytdUnknown = ytdBookings.filter((b) => b._withholding?.status === 'withholding_unknown');
    const ytdCommission = ytdComputed.reduce((s, b) => s + commissionForBooking(b), 0);
    const ytdVat = ytdComputed.reduce((s, b) => s + vatForBooking(b), 0);
    const ytdIncome = ytdComputed.reduce((s, b) => s + incomeForBooking(b), 0);
    const ytdTotalWithheld = ytdCommission + ytdVat + ytdIncome;
    const withholdingYtdByProperty = groupWithholdingByProperty(ytdComputed);

    const insights = [];
    if (occupancyRate >= 85) insights.push(`Occupancy is high at ${occupancyRate}% for ${rangeStartStr}–${rangeEndStr}. Keep an eye on turnover capacity.`);
    if (occupancyRate <= 55) insights.push(`Occupancy is softer at ${occupancyRate}%. Consider promotions or adjusting minimum stays.`);
    if (peakTurnover.total >= Math.max(4, Math.round(ALL_ROOMS.length * 0.4))) insights.push(`${peakTurnover.date} has the heaviest movement (${peakTurnover.total} moves). Plan staffing and cleaning accordingly.`);
    const shortShare = active.length ? Math.round(((stayMix.short || 0) / active.length) * 100) : 0;
    if (shortShare >= 60) insights.push(`Short stays dominate (${shortShare}%). Expect higher turnover effort.`);
    if (cancellationRate >= 15) insights.push(`Cancellations are at ${cancellationRate}%. Review channel policies and payment terms.`);
    const leadInsight = avgLeadTime <= 2 ? 'very short' : avgLeadTime <= 5 ? 'short' : null;
    if (leadInsight) insights.push(`Lead time is ${leadInsight} (avg ${avgLeadTime} days). Keep prices dynamic for late demand.`);
    if (!insights.length) insights.push('Stable period. Keep monitoring channel mix and peak turnover days.');

    const rangeLabel =
      rangeKey === 'this-month'
        ? 'This month'
        : rangeKey === 'last-30'
          ? 'Last 30 days'
          : rangeKey === 'custom'
            ? 'Custom range'
            : 'This week';

    const filterPropertyBookings = (propertyName) => {
      const rooms = ALL_ROOMS.filter((r) => r.propertyName === propertyName);
      const bookingsForProp = bookings.filter((b) => {
        const room = ALL_ROOMS.find((r) => r.id === b.roomId);
        return room?.propertyName === propertyName && b.status !== 'cancelled';
      });
      return { rooms, bookingsForProp };
    };

    const { rooms: townhouseRooms, bookingsForProp: townhouseBookings } = filterPropertyBookings('Townhouse');
    const { rooms: neighboursRooms, bookingsForProp: neighboursBookings } = filterPropertyBookings('Neighbours');

    const overlapNightsRange = (booking, start, end) => {
      const checkIn = clampDate(booking.checkIn);
      const checkOut = clampDate(booking.checkOut);
      if (!checkIn || !checkOut) return 0;
      const s = checkIn > start ? checkIn : start;
      const e = checkOut < end ? checkOut : end;
      const diff = e - s;
      return diff > 0 ? Math.round(diff / msInDay) : 0;
    };

    const buildYoy = (rooms, propBookings, finBaseline, kpiBaseline) => Array.from({ length: 12 }, (_, monthIdx) => {
      const mStart = new Date(currentYear, monthIdx, 1);
      const mEnd = new Date(currentYear, monthIdx + 1, 1);
      const daysInMonth = Math.round((mEnd - mStart) / msInDay);
      const capacityNights = Math.max(1, countAvailableRoomNights(rooms, formatDate(mStart), formatDate(mEnd)));

      let nights = 0;
      let revenueMonth = 0;
      let withheldMonth = 0;

      propBookings.forEach((b) => {
        const overlap = overlapNightsRange(b, mStart, mEnd);
        if (overlap <= 0) return;
        nights += overlap;
        const totalNights = b.nights || calculateNights(b.checkIn, b.checkOut) || 1;
        const netValue = ((b.stayCategory || '').toLowerCase() === 'long' || b.isLongTerm)
          ? calculateLongTermRentForRange(b, mStart, mEnd)
          : netForBooking(b);
        const withheldValue = b._withholding?.status === 'computed' ? (b._withholding.totalWithheld || 0) : 0;
        const prorateFactor = overlap / totalNights;
        revenueMonth += ((b.stayCategory || '').toLowerCase() === 'long' || b.isLongTerm)
          ? netValue
          : (netValue * prorateFactor);
        withheldMonth += withheldValue * prorateFactor;
      });

      const occupancy = Math.min(100, Math.round((nights / capacityNights) * 100));
      const adrMonth = nights > 0 ? Math.round(revenueMonth / nights) : 0;
      const revparMonth = Math.round(revenueMonth / capacityNights);

      const baselineFin = finBaseline.find((f) => f.monthIdx === monthIdx);
      const baselineKpi = kpiBaseline.find((k) => k.monthIdx === monthIdx);
      const baseRevenue = baselineFin?.revenue || 0;
      const revenueDeltaPct = baseRevenue ? Math.round(((revenueMonth - baseRevenue) / baseRevenue) * 100) : null;
      return {
        monthIdx,
        label: mStart.toLocaleString('default', { month: 'short' }),
        revenueCurrent: Math.round(revenueMonth),
        revenueBaseline: baseRevenue,
        revenueDeltaPct,
        occupancyCurrent: occupancy,
        occupancyBaseline: baselineKpi?.occupancyPct ?? null,
        adrCurrent: adrMonth,
        revparCurrent: revparMonth,
        baselineRevpar: baselineKpi?.revpar ?? null,
        baselineAdr: baselineKpi?.adr ?? null,
        baselineOpex: baselineFin?.opex ?? null,
        baselineEbitda: baselineFin?.ebitda ?? null,
        withheldTotal: Math.round(withheldMonth),
      };
    });

    const townhouseYoyMonths = buildYoy(townhouseRooms, townhouseBookings, TOWNHOUSE_2025_FINANCIALS, TOWNHOUSE_2025_KPIS);
    const neighboursYoyMonths = buildYoy(neighboursRooms, neighboursBookings, NEIGHBOURS_2025_FINANCIALS, NEIGHBOURS_2025_KPIS);
    const kolabRooms = [...townhouseRooms, ...neighboursRooms];
    const kolabBookings = [...townhouseBookings, ...neighboursBookings];
    const kolabYoyMonths = buildYoy(kolabRooms, kolabBookings, KOLAB_2025_FINANCIALS, KOLAB_2025_KPIS);

    const summarizeYtd = (months) => {
      const ytd = months.filter((m) => m.monthIdx <= today.getMonth());
      const revenueCurrent = ytd.reduce((s, m) => s + m.revenueCurrent, 0);
      const revenueBaseline = ytd.reduce((s, m) => s + m.revenueBaseline, 0);
      const deltaPct = revenueBaseline ? Math.round(((revenueCurrent - revenueBaseline) / revenueBaseline) * 100) : null;
      const occCurrent = ytd.length ? Math.round(ytd.reduce((s, m) => s + (m.occupancyCurrent || 0), 0) / ytd.length) : 0;
      const occBaseline = ytd.length ? Math.round(ytd.reduce((s, m) => s + (m.occupancyBaseline || 0), 0) / ytd.length) : 0;
      return { revenueCurrent, revenueBaseline, deltaPct, occCurrent, occBaseline };
    };

    const townhouseYtd = summarizeYtd(townhouseYoyMonths);
    const neighboursYtd = summarizeYtd(neighboursYoyMonths);
    const kolabYtd = summarizeYtd(kolabYoyMonths);

    return {
      rangeLabel,
      rangeStartStr,
      rangeEndStr,
      occupancyRate,
      roomNightsBooked,
      roomNightsAvailable,
      revenue,
      adr,
      revPar,
      avgLeadTime,
      cancellationRate,
      avgLengthOfStay,
      stayMix,
      channelBreakdown,
      propertyLoad: propertyLoadArray,
      turnoverDays,
      peakTurnover,
      sameDayTurnovers,
      last6Months,
      insights,
      withholding: {
        range: {
          commission: commissionWithheldRange,
          vat: vatWithheldRange,
          income: incomeWithheldRange,
          total: totalWithheldRange,
          computedCount: withholdingComputedRange.length,
          unknownCount: withholdingUnknownCount,
          totalBookings: airbnbActive.length,
          byProperty: withholdingRangeByProperty,
        },
        ytd: {
          commission: ytdCommission,
          vat: ytdVat,
          income: ytdIncome,
          total: ytdTotalWithheld,
          computedCount: ytdComputed.length,
          unknownCount: ytdUnknown.length,
          totalBookings: ytdBookings.length,
          byProperty: withholdingYtdByProperty,
        },
      },
      townhouseYoy: {
        currentYear,
        months: townhouseYoyMonths,
        ytdRevenueCurrent: townhouseYtd.revenueCurrent,
        ytdRevenueBaseline: townhouseYtd.revenueBaseline,
        ytdDeltaPct: townhouseYtd.deltaPct,
        ytdOccCurrent: townhouseYtd.occCurrent,
        ytdOccBaseline: townhouseYtd.occBaseline,
      },
      neighboursYoy: {
        currentYear,
        months: neighboursYoyMonths,
        ytdRevenueCurrent: neighboursYtd.revenueCurrent,
        ytdRevenueBaseline: neighboursYtd.revenueBaseline,
        ytdDeltaPct: neighboursYtd.deltaPct,
        ytdOccCurrent: neighboursYtd.occCurrent,
        ytdOccBaseline: neighboursYtd.occBaseline,
      },
      kolabYoy: {
        currentYear,
        months: kolabYoyMonths,
        ytdRevenueCurrent: kolabYtd.revenueCurrent,
        ytdRevenueBaseline: kolabYtd.revenueBaseline,
        ytdDeltaPct: kolabYtd.deltaPct,
        ytdOccCurrent: kolabYtd.occCurrent,
        ytdOccBaseline: kolabYtd.occBaseline,
      },
    };
  };

  // Preserve the original memoization keys while moving the calculation out of App.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const statsData = useMemo(() => calculateStats(statsRange, customStatsStart, customStatsEnd), [bookings, statsRange, customStatsStart, customStatsEnd]);
  return statsData;
}
