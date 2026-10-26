import CustomDatePicker from '../../components/common/CustomDatePicker.jsx';
import { COLORS, DEFAULT_CHECKIN_TIME, DEFAULT_CHECKOUT_TIME, SERVICE_PRESETS } from '../../config/pms.js';
import { PROPERTIES } from '../../config/properties.js';
import { computeAirbnbWithholding, deriveAirbnbGrossAmount } from '../../lib/airbnb.js';
import { bookingOccupiesDate, calculateLongTermRentForRange, expandBookingToRoomStays, getBookingEarlyCheckoutMeta, getBookingOccupiedDates, isBlockingStatus, normalizeBookingBreaks, normalizeRoomMoves } from '../../lib/bookingDates.js';
import { calendarBlockOccupiesDate, getCalendarBlockDateKeys } from '../../lib/calendarBlocks.js';
import { addDays, calculateNights, formatDate } from '../../lib/dates.js';
import { formatCurrencyVND } from '../../lib/formatting.js';
import { randomId } from '../../lib/shared.js';
import { AlertTriangle, Clock, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BookingModal = ({ isOpen, onClose, onSave, booking, rooms, allBookings, calendarBlocks, checkBookingConflict, isSaving, currentUser, onLookupGuest, onOpenCalendar }) => {
  const modalContentRef = useRef(null);
  const deriveStayCategory = useCallback((nights) => {
      if (nights >= 31) return 'long';
      if (nights >= 7) return 'medium';
      return 'short';
  }, []);

  const [formData, setFormData] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    roomId: '',
    checkIn: '',
    checkOut: '',
    checkInTime: '',
    checkOutTime: '',
    price: '',
    grossRoomRevenue: '',
    payoutFromEmail: '',
    nights: 0,
    status: 'confirmed',
    notes: '',
    earlyCheckIn: false,
    bikeParkingNeeded: false,
    bikeCount: 1,
    stayCategory: 'short',
    isLongTerm: false,
    weeklyCleaningDay: 'monday',
    channel: 'airbnb',
    paymentStatus: '',
    grossPrice: '',
    netEarningsFromEmail: '',
    airbnbBaseEarningsVnd: '',
    monthlyRentVnd: '',
    hasMultipleRoomStay: false,
    roomMoves: [],
    hasGuestBreaks: false,
    guestBreakPeriods: [],
    sellRoomDuringBreak: false,
    endedEarly: false,
    actualCheckoutDate: '',
    earlyTerminationReimbursed: false,
  });

  const [nights, setNights] = useState(0);
  const [conflictError, setConflictError] = useState(null);
  const [categoryManual, setCategoryManual] = useState(false);
  const [services, setServices] = useState([]);
  const [customService, setCustomService] = useState({ name: '', price: '', qty: 1, notes: '' });
  const [returningInfo, setReturningInfo] = useState(null);
  const [checkingReturning, setCheckingReturning] = useState(false);
  const [returningError, setReturningError] = useState(null);

  const normalizeServiceEntry = useCallback(
    (s) => {
      const price = Math.max(0, Math.round(Number(s?.price) || 0));
      const qty = Math.max(1, parseInt(s?.qty, 10) || 1);
      return {
        id: s?.id || randomId(),
        name: (s?.name || '').trim() || 'Unnamed service',
        price,
        qty,
        createdAt: s?.createdAt || new Date().toISOString(),
        createdBy: s?.createdBy || currentUser?.uid || currentUser?.email || 'system',
        presetKey: s?.presetKey || null,
        notes: s?.notes || '',
      };
    },
    [currentUser]
  );

  const servicesTotal = useMemo(
    () =>
      services.reduce(
        (sum, s) => sum + (Math.max(0, Math.round(Number(s.price) || 0)) * Math.max(1, parseInt(s.qty, 10) || 1)),
        0
      ),
    [services]
  );

  const longStayEstimatedTotal = useMemo(() => {
    if (formData.stayCategory !== 'long' || !nights) return 0;
    return calculateLongTermRentForRange(
      {
        checkIn: formData.checkIn,
        checkOut: formData.checkOut,
        roomId: formData.roomId,
        monthlyRentVnd: formData.monthlyRentVnd,
        roomMoves: formData.hasMultipleRoomStay ? formData.roomMoves : [],
        guestBreakPeriods: formData.hasGuestBreaks ? formData.guestBreakPeriods : [],
        sellRoomDuringBreak: !!formData.sellRoomDuringBreak,
      },
      formData.checkIn,
      formData.checkOut
    );
  }, [formData.checkIn, formData.checkOut, formData.guestBreakPeriods, formData.hasGuestBreaks, formData.hasMultipleRoomStay, formData.monthlyRentVnd, formData.roomId, formData.roomMoves, formData.sellRoomDuringBreak, formData.stayCategory, nights]);

  const bookingBaseAmount = useMemo(() => {
    if (['long'].includes(formData.stayCategory)) {
      return longStayEstimatedTotal;
    }
    if (formData.channel === 'airbnb') {
      const computed = computeAirbnbWithholding({
        channel: formData.channel,
        checkIn: formData.checkIn,
        grossPrice: formData.grossPrice,
        airbnbBaseEarningsVnd: formData.airbnbBaseEarningsVnd,
        price: formData.price,
      });
      if (computed.status === 'computed' && Number.isFinite(computed.finalCountedIncome)) {
        return computed.finalCountedIncome;
      }
    }
    return Number(formData.price) || 0;
  }, [formData.airbnbBaseEarningsVnd, formData.channel, formData.checkIn, formData.grossPrice, formData.price, formData.stayCategory, longStayEstimatedTotal]);

  const bookingTotalWithServices = useMemo(() => bookingBaseAmount + servicesTotal, [bookingBaseAmount, servicesTotal]);

  const withholdingPreview = useMemo(() => {
    if (formData.channel !== 'airbnb') return null;
    return computeAirbnbWithholding({
      channel: formData.channel,
      checkIn: formData.checkIn,
      grossPrice: formData.grossPrice,
      airbnbBaseEarningsVnd: formData.airbnbBaseEarningsVnd,
      price: formData.price,
    });
  }, [formData.channel, formData.checkIn, formData.grossPrice, formData.airbnbBaseEarningsVnd, formData.price]);

  useEffect(() => {
    if (booking) {
      const bookingNights = booking.nights || calculateNights(booking.checkIn, booking.checkOut);
      const inferredCategory = booking.stayCategory || deriveStayCategory(bookingNights);
      setFormData({
        ...booking,
        guestEmail: booking.guestEmail || booking.email || '',
        guestPhone: booking.guestPhone || booking.phone || '',
        checkInTime: booking.checkInTime || '',
        checkOutTime: booking.checkOutTime || '',
        earlyCheckIn: !!booking.earlyCheckIn,
        bikeParkingNeeded: !!booking.bikeParkingNeeded,
        bikeCount: booking.bikeCount || 1,
        stayCategory: inferredCategory,
        isLongTerm: ['medium', 'long'].includes(inferredCategory) || !!booking.isLongTerm,
        weeklyCleaningDay: booking.weeklyCleaningDay || 'monday',
        channel: booking.channel || 'airbnb',
        paymentStatus: booking.channel === 'direct' ? (booking.paymentStatus || '') : '',
        grossPrice: booking.grossPrice ?? deriveAirbnbGrossAmount(booking) ?? '',
        netEarningsFromEmail: booking.netEarningsFromEmail ?? '',
        airbnbBaseEarningsVnd: booking.grossPrice ?? booking.airbnbBaseEarningsVnd ?? booking.netEarningsFromEmail ?? deriveAirbnbGrossAmount(booking) ?? '',
        monthlyRentVnd: booking.monthlyRentVnd ?? booking.price ?? '',
        hasMultipleRoomStay: !!booking.hasMultipleRoomStay || (Array.isArray(booking.roomMoves) && booking.roomMoves.length > 0),
        roomMoves: normalizeRoomMoves(booking.roomMoves || [], {
          stayStart: booking.checkIn,
          stayEnd: booking.checkOut,
          fallbackRent: booking.monthlyRentVnd ?? booking.price ?? null,
        }),
        hasGuestBreaks: !!booking.hasGuestBreaks || normalizeBookingBreaks(booking.guestBreakPeriods || booking.breakPeriods || []).length > 0,
        guestBreakPeriods: normalizeBookingBreaks(booking.guestBreakPeriods || booking.breakPeriods || []),
        sellRoomDuringBreak: !!booking.sellRoomDuringBreak,
        endedEarly: getBookingEarlyCheckoutMeta(booking).endedEarly,
        actualCheckoutDate: getBookingEarlyCheckoutMeta(booking).actualCheckoutDate,
        earlyTerminationReimbursed: getBookingEarlyCheckoutMeta(booking).reimbursed,
      });
      setCategoryManual(!!booking.stayCategory);
      const normalizedServices = Array.isArray(booking.services) ? booking.services.map(normalizeServiceEntry) : [];
      setServices(normalizedServices);
    } else {
      const defaultCheckIn = formatDate(new Date());
      const defaultCheckOut = formatDate(new Date(Date.now() + 86400000));
      const defaultNights = calculateNights(defaultCheckIn, defaultCheckOut);
      const inferredCategory = deriveStayCategory(defaultNights);
      setFormData({
        guestName: '',
        guestEmail: '',
        guestPhone: '',
        roomId: rooms[0]?.id || '',
        checkIn: defaultCheckIn,
        checkOut: defaultCheckOut,
        checkInTime: '',
        checkOutTime: '',
        price: '',
        nights: defaultNights,
        status: 'confirmed',
        notes: '',
        earlyCheckIn: false,
        bikeParkingNeeded: false,
        bikeCount: 1,
        stayCategory: inferredCategory,
        isLongTerm: ['medium', 'long'].includes(inferredCategory),
        weeklyCleaningDay: 'monday',
        channel: 'airbnb',
        paymentStatus: '',
        grossPrice: '',
        netEarningsFromEmail: '',
        airbnbBaseEarningsVnd: '',
        monthlyRentVnd: '',
        hasMultipleRoomStay: false,
        roomMoves: [],
        hasGuestBreaks: false,
        guestBreakPeriods: [],
        sellRoomDuringBreak: false,
        endedEarly: false,
        actualCheckoutDate: '',
        earlyTerminationReimbursed: false,
      });
      setCategoryManual(false);
      setServices([]);
    }
    setConflictError(null);
    setCustomService({ name: '', price: '', qty: 1, notes: '' });
    setReturningInfo(booking?.isReturningGuest ? { isReturningGuest: true, returningReason: booking.returningReason || 'existingBooking', guest: { stayCount: booking.stayCount } } : null);
    setReturningError(null);
    setCheckingReturning(false);
  }, [booking, isOpen, rooms, deriveStayCategory]);

  useEffect(() => {
    if (formData.checkIn && formData.checkOut) {
      const calculatedNights = calculateNights(formData.checkIn, formData.checkOut);
      setNights(calculatedNights);
      setFormData(prev => ({ ...prev, nights: calculatedNights }));
      if (!categoryManual) {
        const inferredCategory = deriveStayCategory(calculatedNights);
        setFormData(prev => ({
          ...prev,
          stayCategory: inferredCategory,
          isLongTerm: ['medium', 'long'].includes(inferredCategory),
          weeklyCleaningDay: ['medium', 'long'].includes(inferredCategory) ? prev.weeklyCleaningDay || 'monday' : '',
        }));
      }
      setConflictError(null);
    } else {
      setNights(0);
      setFormData(prev => ({ ...prev, nights: 0 }));
    }
  }, [formData.checkIn, formData.checkOut, categoryManual, deriveStayCategory]);

  useEffect(() => {
    if (!onLookupGuest) return;
    const email = formData.guestEmail;
    const phone = formData.guestPhone;
    if (!email && !phone) {
      setReturningInfo(null);
      setReturningError(null);
      return;
    }

    setCheckingReturning(true);
    const handle = setTimeout(async () => {
      try {
        const result = await onLookupGuest({
          guestEmail: email,
          guestPhone: phone,
          guestName: formData.guestName,
          checkIn: formData.checkIn,
        });
        setReturningInfo(result);
        setReturningError(null);
      } catch (err) {
        console.error('[booking-modal] returning lookup failed', err);
        setReturningError('Could not check returning guest.');
        setReturningInfo(null);
      } finally {
        setCheckingReturning(false);
      }
    }, 450);

    return () => clearTimeout(handle);
  }, [formData.guestEmail, formData.guestPhone, formData.guestName, formData.checkIn, onLookupGuest]);

  useEffect(() => {
    if (formData.channel !== 'airbnb') return;
    setFormData((prev) => {
      const base = Number(prev.grossPrice ?? prev.airbnbBaseEarningsVnd);
      const hasBase = Number.isFinite(base) && base > 0;
      const computed = hasBase ? computeAirbnbWithholding({ channel: 'airbnb', checkIn: prev.checkIn, grossPrice: base, airbnbBaseEarningsVnd: base, price: prev.price }) : null;
      const nextNet = hasBase ? base : '';
      const nextGross = hasBase ? base : '';
      const nextPrice = hasBase ? computed?.finalCountedIncome ?? '' : '';
      if (prev.netEarningsFromEmail === nextNet && prev.grossPrice === nextGross && prev.price === nextPrice) return prev;
      return { ...prev, grossPrice: nextGross, netEarningsFromEmail: nextNet, price: nextPrice };
    });
  }, [formData.channel, formData.checkIn, formData.grossPrice, formData.airbnbBaseEarningsVnd]);

  useEffect(() => {
    if (formData.channel !== 'airbnb') return;
    setFormData((prev) => {
      if (prev.airbnbBaseEarningsVnd || prev.grossPrice) return prev;
      const fallbackBase = deriveAirbnbGrossAmount(prev);
      if (!Number.isFinite(fallbackBase) || fallbackBase <= 0) return prev;
      return { ...prev, grossPrice: fallbackBase, airbnbBaseEarningsVnd: fallbackBase, netEarningsFromEmail: fallbackBase };
    });
  }, [formData.channel]);

  const blockedDatesForRoom = useMemo(() => {
    const checkInBlocked = new Set();
    const checkOutBlocked = new Set();

    allBookings.flatMap((entry) => expandBookingToRoomStays(entry)).forEach((b) => {
      if (b.roomId !== formData.roomId) return;
      if (!isBlockingStatus(b.status)) return;
      if (booking && (b.sourceBookingId || b.id) === booking.id) return;
      const occupiedDates = getBookingOccupiedDates(b);
      const occupiedSet = new Set(occupiedDates);
      occupiedDates.forEach((dateStr) => {
        checkInBlocked.add(dateStr);
        if (!formData.hasMultipleRoomStay && occupiedSet.has(addDays(dateStr, -1))) {
          // For check-out selection, allow boundaries where occupancy starts.
          checkOutBlocked.add(dateStr);
        }
      });
    });

    calendarBlocks.forEach((block) => {
      if (block.roomId !== formData.roomId) return;
      if (booking && block.id === booking.id) return;
      const blockDates = getCalendarBlockDateKeys(block);
      const blockSet = new Set(blockDates);
      blockDates.forEach((dateStr) => {
        checkInBlocked.add(dateStr);
        if (!formData.hasMultipleRoomStay && blockSet.has(addDays(dateStr, -1))) {
          checkOutBlocked.add(dateStr);
        }
      });
    });

    return { checkInBlocked, checkOutBlocked };
  }, [allBookings, calendarBlocks, formData.hasMultipleRoomStay, formData.roomId, booking]);

  const availableRoomOptions = useMemo(() => {
    const roomBookings = allBookings.flatMap((entry) => expandBookingToRoomStays(entry)).reduce((acc, b) => {
      if (isBlockingStatus(b.status)) {
        if (!acc[b.roomId]) acc[b.roomId] = [];
        acc[b.roomId].push(b);
      }
      return acc;
    }, {});

    const today = formatDate(new Date());

    return rooms.map(room => {
      const bookingsForRoom = roomBookings[room.id] || [];
      const isOccupiedToday = bookingsForRoom.some(b =>
        bookingOccupiesDate(b, today, room.id) && (!booking || (b.sourceBookingId || b.id) !== booking.id)
      );

      let displayStatus = '';
      if (isOccupiedToday) displayStatus = ' (Occupied)';
      else if ((calendarBlocks || []).some((block) => block.roomId === room.id && calendarBlockOccupiesDate(block, today, room.id))) displayStatus = ' (PMS Block)';
      else if (bookingsForRoom.length > 0) displayStatus = ' (Future Bookings)';
      else displayStatus = ' (Open)';

      return { ...room, displayStatus, isOccupied: isOccupiedToday };
    });
  }, [allBookings, rooms, booking, calendarBlocks]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setConflictError(null);

    if (nights <= 0) {
        console.warn("Check-out must be after check-in. Nights calculation is 0.");
        return;
    }



    const draftBreaks = Array.isArray(formData.guestBreakPeriods) ? formData.guestBreakPeriods : [];
    if (formData.hasGuestBreaks && draftBreaks.some((brk) => !brk?.startDate || !brk?.endDate || brk.endDate <= brk.startDate)) {
      setConflictError('Each break must have an away date and a later return date.');
      return;
    }

    const rawBreaks = formData.hasGuestBreaks ? normalizeBookingBreaks(draftBreaks) : [];
    const normalizedActualCheckoutDate = formData.endedEarly ? formatDate(formData.actualCheckoutDate || '') : '';
    if (formData.endedEarly && !normalizedActualCheckoutDate) {
      setConflictError('Enter the actual move-out date for an early-ended stay.');
      return;
    }
    if (formData.endedEarly && !(formData.checkIn < normalizedActualCheckoutDate && normalizedActualCheckoutDate < formData.checkOut)) {
      setConflictError(`Actual move-out date must be after ${formData.checkIn} and before ${formData.checkOut}.`);
      return;
    }
    for (const brk of rawBreaks) {
      if (brk.startDate < formData.checkIn || brk.endDate >= formData.checkOut) {
        setConflictError(`Break ${brk.startDate} → ${brk.endDate} must be within the stay (${formData.checkIn} → ${addDays(formData.checkOut, -1)}).`);
        return;
      }
      if (normalizedActualCheckoutDate && brk.endDate >= normalizedActualCheckoutDate) {
        setConflictError(`Break ${brk.startDate} → ${brk.endDate} must end before the actual move-out date (${normalizedActualCheckoutDate}).`);
        return;
      }
    }

    const isLongStay = formData.stayCategory === 'long';
    const rawRoomMoves = formData.hasMultipleRoomStay ? (Array.isArray(formData.roomMoves) ? formData.roomMoves : []) : [];
    if (formData.hasMultipleRoomStay && rawRoomMoves.length === 0) {
      setConflictError('Add at least one room move or untick multiple room stay.');
      return;
    }
    if (rawRoomMoves.some((move) => !move?.moveDate || !move?.roomId)) {
      setConflictError('Each room move needs both a move date and destination room.');
      return;
    }
    if (isLongStay && rawRoomMoves.some((move) => move?.useDifferentMonthlyRent && (move.monthlyRentVnd === '' || move.monthlyRentVnd === null || Number(move.monthlyRentVnd) < 0))) {
      setConflictError('Each rent change needs a valid new monthly rent.');
      return;
    }
    if (rawRoomMoves.some((move) => move?.useDifferentChannel && !move?.channel)) {
      setConflictError('Each channel change needs a channel selected.');
      return;
    }


    const rawRoomMovesWithIds = rawRoomMoves.map((move) => ({ ...move, id: move.id || randomId() }));
    const normalizedRoomMoves = normalizeRoomMoves(rawRoomMovesWithIds, {
      stayStart: formData.checkIn,
      stayEnd: formData.checkOut,
      fallbackRent: formData.monthlyRentVnd,
    });
    if (rawRoomMovesWithIds.length !== normalizedRoomMoves.length) {
      setConflictError(`Room move dates must be inside the stay (${formData.checkIn} → ${addDays(formData.checkOut, -1)}), with valid rooms, rent changes, and channel details.`);
      return;
    }
    for (let i = 1; i < normalizedRoomMoves.length; i += 1) {
      if (normalizedRoomMoves[i - 1].moveDate === normalizedRoomMoves[i].moveDate) {
        setConflictError('Room move dates must be unique.');
        return;
      }
    }
    if (normalizedActualCheckoutDate && normalizedRoomMoves.some((move) => move.moveDate >= normalizedActualCheckoutDate)) {
      setConflictError(`Room changes must happen before the actual move-out date (${normalizedActualCheckoutDate}).`);
      return;
    }

    const conflictResult = checkBookingConflict(
      {
        ...formData,
        hasGuestBreaks: formData.hasGuestBreaks,
        guestBreakPeriods: rawBreaks,
        hasMultipleRoomStay: normalizedRoomMoves.length > 0,
        roomMoves: normalizedRoomMoves,
      },
      booking ? booking.id : null
    );

    if (conflictResult.conflict) {
        setConflictError(conflictResult.reason);
        return;
    }

    const sanitizedServices = services
      .map((s) => normalizeServiceEntry(s))
      .filter((s) => s.name && !Number.isNaN(s.price) && s.qty >= 1);

    const sanitizedCheckInTime = (formData.checkInTime || '').trim();
    const sanitizedCheckOutTime = (formData.checkOutTime || '').trim();
    const finalCheckInTime = sanitizedCheckInTime || DEFAULT_CHECKIN_TIME;
    const finalCheckOutTime = sanitizedCheckOutTime || DEFAULT_CHECKOUT_TIME;

    const grossPrice = formData.channel === 'airbnb'
      ? (formData.airbnbBaseEarningsVnd === '' ? null : Number(formData.airbnbBaseEarningsVnd))
      : null;
    const airbnbBaseEarningsVnd = grossPrice;
    const netEarningsFromEmail = formData.channel === 'airbnb' ? grossPrice : null;
    const monthlyRentVnd = ['long'].includes(formData.stayCategory)
      ? (formData.monthlyRentVnd === '' ? null : Number(formData.monthlyRentVnd))
      : null;

    const inferredCategory = formData.stayCategory || deriveStayCategory(formData.nights);
    const isLongTermCategory = ['medium', 'long'].includes(inferredCategory);
    const finalWeeklyDay = isLongTermCategory ? formData.weeklyCleaningDay || 'monday' : '';
    const normalizedBikeCount = formData.bikeParkingNeeded
      ? Math.max(1, Math.min(5, Number(formData.bikeCount) || 1))
      : null;

    onSave({
      ...formData,
      stayCategory: inferredCategory,
      isLongTerm: isLongTermCategory,
      weeklyCleaningDay: finalWeeklyDay,
      channel: formData.channel || 'airbnb',
      paymentStatus: formData.channel === 'direct' ? formData.paymentStatus : null,
      bikeParkingNeeded: !!formData.bikeParkingNeeded,
      bikeCount: normalizedBikeCount,
      checkInTime: finalCheckInTime,
      checkOutTime: finalCheckOutTime,
      services: sanitizedServices,
      grossPrice,
      airbnbBaseEarningsVnd,
      netEarningsFromEmail,
      monthlyRentVnd,
      hasMultipleRoomStay: normalizedRoomMoves.length > 0,
      roomMoves: normalizedRoomMoves,
      hasGuestBreaks: !!formData.hasGuestBreaks && rawBreaks.length > 0,
      guestBreakPeriods: rawBreaks,
      sellRoomDuringBreak: !!formData.hasGuestBreaks && rawBreaks.length > 0 && !!formData.sellRoomDuringBreak,
      endedEarly: !!formData.endedEarly && !!normalizedActualCheckoutDate,
      actualCheckoutDate: normalizedActualCheckoutDate || null,
      earlyTerminationReimbursed: !!formData.endedEarly && !!normalizedActualCheckoutDate && !!formData.earlyTerminationReimbursed,
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (['price', 'grossPrice', 'netEarningsFromEmail', 'airbnbBaseEarningsVnd', 'monthlyRentVnd'].includes(name)) {
      const numericValue = value === '' ? '' : Number(value);
      if (formData.channel === 'airbnb' && ['grossPrice', 'netEarningsFromEmail', 'airbnbBaseEarningsVnd'].includes(name)) {
        setFormData(prev => ({
          ...prev,
          grossPrice: numericValue,
          netEarningsFromEmail: numericValue,
          airbnbBaseEarningsVnd: numericValue,
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name]: numericValue,
        }));
      }
    } else if (name === 'stayCategory') {
      const nextCategory = value;
      const isLongTermCategory = ['medium', 'long'].includes(nextCategory);
      setCategoryManual(true);
      setFormData(prev => ({
        ...prev,
        stayCategory: nextCategory,
        isLongTerm: isLongTermCategory,
        weeklyCleaningDay: isLongTermCategory ? prev.weeklyCleaningDay || 'monday' : '',
      }));
      } else if (name === 'hasGuestBreaks') {
      setFormData((prev) => ({
        ...prev,
        hasGuestBreaks: checked,
        sellRoomDuringBreak: checked ? prev.sellRoomDuringBreak : false,
      }));
    } else if (name === 'endedEarly') {
      setFormData((prev) => {
        const suggestedActualCheckoutDate =
          prev.checkOut && addDays(prev.checkOut, -1) > prev.checkIn
            ? addDays(prev.checkOut, -1)
            : '';
        return {
          ...prev,
          endedEarly: checked,
          actualCheckoutDate: checked ? (prev.actualCheckoutDate || suggestedActualCheckoutDate) : '',
          earlyTerminationReimbursed: checked ? prev.earlyTerminationReimbursed : false,
        };
      });
    } else if (name === 'channel') {
      const nextChannel = value;
        setFormData(prev => ({
        ...prev,
        channel: nextChannel,
        paymentStatus: nextChannel === 'direct' ? prev.paymentStatus || '' : '',
      }));
    } else if (name === 'paymentStatus') {
        setFormData(prev => ({
        ...prev,
        paymentStatus: value,
      }));
    } else if (name === 'bikeCount') {
      const numeric = Math.max(1, Math.min(5, Number(value) || 1));
      setFormData((prev) => ({ ...prev, bikeCount: numeric }));
    } else if (name === 'hasMultipleRoomStay') {
      setFormData((prev) => ({
        ...prev,
        hasMultipleRoomStay: checked,
        roomMoves: checked
          ? ((Array.isArray(prev.roomMoves) && prev.roomMoves.length > 0)
              ? prev.roomMoves
              : [{
                  id: randomId(),
                  moveDate: '',
                  roomId: '',
                  useDifferentMonthlyRent: false,
                  useDifferentChannel: false,
                  channel: '',
                  paymentStatus: '',
                  monthlyRentVnd: prev.monthlyRentVnd || '',
                }])
          : [],
      }));
    } else {
      setFormData(prev => ({
          ...prev,
          [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const addGuestBreakPeriod = () => {
    setFormData((prev) => ({
      ...prev,
      hasGuestBreaks: true,
      guestBreakPeriods: [
        ...(Array.isArray(prev.guestBreakPeriods) ? prev.guestBreakPeriods : []),
        { id: randomId(), startDate: '', endDate: '' },
      ],
    }));
  };

  const updateGuestBreakPeriod = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      guestBreakPeriods: (Array.isArray(prev.guestBreakPeriods) ? prev.guestBreakPeriods : []).map((period) =>
        period.id === id ? { ...period, [field]: value } : period
      ),
    }));
  };

  const removeGuestBreakPeriod = (id) => {
    setFormData((prev) => ({
      ...prev,
      guestBreakPeriods: (Array.isArray(prev.guestBreakPeriods) ? prev.guestBreakPeriods : []).filter((period) => period.id !== id),
      sellRoomDuringBreak: (Array.isArray(prev.guestBreakPeriods) ? prev.guestBreakPeriods : []).filter((period) => period.id !== id).length > 0
        ? prev.sellRoomDuringBreak
        : false,
    }));
  };

  const addRoomMove = () => {
    setFormData((prev) => ({
      ...prev,
      hasMultipleRoomStay: true,
      roomMoves: [
        ...(Array.isArray(prev.roomMoves) ? prev.roomMoves : []),
        {
          id: randomId(),
          moveDate: '',
          roomId: '',
          useDifferentMonthlyRent: false,
          useDifferentChannel: false,
          channel: '',
          paymentStatus: '',
          monthlyRentVnd: prev.monthlyRentVnd || '',
        },
      ],
    }));
  };

  const updateRoomMove = (id, patch) => {
    setFormData((prev) => ({
      ...prev,
      roomMoves: (Array.isArray(prev.roomMoves) ? prev.roomMoves : []).map((move) => (
        move.id === id ? { ...move, ...patch } : move
      )),
    }));
  };

  const removeRoomMove = (id) => {
    setFormData((prev) => ({
      ...prev,
      roomMoves: (Array.isArray(prev.roomMoves) ? prev.roomMoves : []).filter((move) => move.id !== id),
    }));
  };

  const addServiceFromPreset = (preset) => {
    const price = Math.max(0, Math.round(Number(preset.price) || 0));
    setServices((prev) => {
      const existingIdx = prev.findIndex((s) => s.name === preset.name);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        updated[existingIdx] = {
          ...existing,
          qty: Math.max(1, (parseInt(existing.qty, 10) || 1) + 1),
        };
        return updated;
      }
      return [
        ...prev,
        normalizeServiceEntry({
          id: randomId(),
          name: preset.name,
          price,
          qty: 1,
          presetKey: preset.key,
          createdAt: new Date().toISOString(),
        }),
      ];
    });
  };

  const handleCustomServiceChange = (e) => {
    const { name, value } = e.target;
    setCustomService((prev) => ({ ...prev, [name]: name === 'qty' || name === 'price' ? value : value }));
  };

  const addCustomService = () => {
    const name = (customService.name || '').trim();
    const price = Math.max(0, Math.round(Number(customService.price) || 0));
    const qty = Math.max(1, parseInt(customService.qty, 10) || 1);

    if (!name) {
      setConflictError('Service name is required for custom services.');
      return;
    }
    if (!price) {
      setConflictError('Service price must be greater than 0.');
      return;
    }

    setConflictError(null);

    setServices((prev) => {
      const existingIdx = prev.findIndex((s) => s.name.toLowerCase() === name.toLowerCase() && Number(s.price) === price);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        updated[existingIdx] = {
          ...existing,
          qty: Math.max(1, (parseInt(existing.qty, 10) || 1) + qty),
        };
        return updated;
      }
      return [
        ...prev,
        normalizeServiceEntry({ id: randomId(), name, price, qty, createdAt: new Date().toISOString(), notes: customService.notes || '' }),
      ];
    });

    setCustomService({ name: '', price: '', qty: 1, notes: '' });
  };

  const removeService = (id) => {
    if (!confirm('Remove service?')) return;
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDateChange = (field, dateStr) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: dateStr };
      if (field === 'checkOut' && prev.endedEarly && prev.actualCheckoutDate && prev.actualCheckoutDate >= dateStr) {
        next.actualCheckoutDate = dateStr && addDays(dateStr, -1) > prev.checkIn ? addDays(dateStr, -1) : '';
      }
      if (field === 'checkIn' && prev.endedEarly && prev.actualCheckoutDate && prev.actualCheckoutDate <= dateStr) {
        next.actualCheckoutDate = prev.checkOut && addDays(prev.checkOut, -1) > dateStr ? addDays(prev.checkOut, -1) : '';
      }
      return next;
    });
  };

  const selectedRoom = availableRoomOptions.find((room) => room.id === formData.roomId);
  const stayCategoryLabel = formData.stayCategory === 'short'
    ? 'Short Term'
    : formData.stayCategory === 'medium'
      ? 'Medium Term'
      : 'Long Term';
  const channelLabel = formData.channel === 'coliving'
    ? 'Coliving.com'
    : formData.channel
      ? formData.channel.charAt(0).toUpperCase() + formData.channel.slice(1)
      : 'Not set';
  const statusLabel = formData.status
    ? formData.status.replace(/\b\w/g, (char) => char.toUpperCase()).replace('-', ' ')
    : 'Not set';
  const summaryDateLabel = formData.checkIn && formData.checkOut
    ? `${formatDate(formData.checkIn)} - ${formatDate(formData.checkOut)}`
    : 'Select dates';
  const guestBreakCount = Array.isArray(formData.guestBreakPeriods) ? formData.guestBreakPeriods.length : 0;
  const panelClassName = 'rounded-[28px] border border-[#d8dfd2] bg-white/92 shadow-[0_14px_32px_rgba(38,64,46,0.08)] backdrop-blur-sm';
  const sectionEyebrowClassName = 'text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div
        className="bg-white rounded-[32px] shadow-2xl w-full max-w-7xl flex flex-col"
        data-modal-root
        ref={modalContentRef}
        style={{ maxHeight: '90vh', overflow: 'hidden', position: 'relative' }}
      >
        <div
          className="px-6 py-5 border-b flex items-center justify-between gap-4 sticky top-0 z-10"
          style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}
        >
          <div>
            <h3 className="font-serif font-bold text-2xl text-white">
              {booking ? 'Edit Booking' : 'New Reservation'}
            </h3>
            <p className="mt-1 text-sm text-white/70">
              Keep the booking flow in order: who, where, when, then money and exceptions.
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto overflow-x-hidden" style={{ backgroundColor: COLORS.cream, maxHeight: 'calc(90vh - 92px)' }}>
          <form onSubmit={handleSubmit} className="space-y-6">
            {conflictError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative flex items-start space-x-3">
                <AlertTriangle size={20} className="mt-1 flex-shrink-0" />
                <div>
                  <p className="font-bold">Booking Conflict</p>
                  <p className="text-sm mt-1">{conflictError}</p>
                </div>
              </div>
            )}

            <section className="rounded-[30px] border border-[#26402E]/12 bg-[linear-gradient(135deg,rgba(38,64,46,0.96),rgba(58,87,66,0.92))] px-6 py-6 text-white shadow-[0_18px_44px_rgba(38,64,46,0.18)]">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-2xl">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">Reservation Overview</div>
                  <div className="mt-3 text-2xl font-semibold">
                    {formData.guestName || 'New guest'}
                  </div>
                  <div className="mt-2 text-sm text-white/72">
                    {selectedRoom?.name || 'Room not selected'} • {summaryDateLabel}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">Stay</div>
                    <div className="mt-1 font-semibold">{nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : 'Select dates'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">Category</div>
                    <div className="mt-1 font-semibold">{stayCategoryLabel}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">Channel</div>
                    <div className="mt-1 font-semibold">{channelLabel}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">Booking Total</div>
                    <div className="mt-1 font-semibold">{formatCurrencyVND(bookingTotalWithServices)}</div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] items-start">
              <div className="space-y-5">
                <section className={panelClassName}>
                  <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                    <div className={sectionEyebrowClassName}>Reservation Basics</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Capture the person, room, status, and booking source first.
                    </p>
                  </div>
                  <div className="p-5 space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)] gap-5">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: COLORS.darkGreen }}>Guest Name</label>
                          <input
                            required
                            type="text"
                            name="guestName"
                            className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all"
                            value={formData.guestName}
                            onChange={handleChange}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: COLORS.darkGreen }}>Email</label>
                            <input
                              type="email"
                              name="guestEmail"
                              placeholder="guest@email.com"
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all"
                              value={formData.guestEmail}
                              onChange={handleChange}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: COLORS.darkGreen }}>Phone</label>
                            <input
                              type="tel"
                              name="guestPhone"
                              placeholder="Digits only"
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all"
                              value={formData.guestPhone}
                              onChange={handleChange}
                            />
                          </div>
                        </div>

                        {(returningInfo?.isReturningGuest || returningError) && (
                          <div className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${returningError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                            <AlertTriangle size={18} className="mt-0.5" />
                            <div>
                              <div className="font-semibold text-sm">
                                {returningError ? 'Lookup issue' : 'Returning guest detected'}
                              </div>
                              <div className="text-xs mt-1 text-slate-700">
                                {returningError && returningError}
                                {!returningError && (
                                  <>
                                    Stayed {returningInfo?.guest?.stayCount ?? 1} time{(returningInfo?.guest?.stayCount || 1) !== 1 ? 's' : ''}.{returningInfo?.guest?.lastStayEnd ? ` Last stay ended ${formatDate(returningInfo.guest.lastStayEnd)}.` : ''}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        {checkingReturning && !returningError && (
                          <div className="text-xs text-slate-500">Checking returning guest…</div>
                        )}
                      </div>

                      {booking?.id && (
                        <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
                          <h3 className="font-bold text-slate-800">Move or swap rooms</h3>
                          <p className="text-sm text-slate-600">In the calendar, drag this guest’s room segment to another room. Review and confirm all affected guests, including multiple guests and stays with room changes.</p>
                          <button type="button" disabled={isSaving} onClick={onOpenCalendar} className="px-4 py-2 rounded-xl bg-slate-800 text-white disabled:opacity-50">Open calendar</button>
                        </div>
                      )}

                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: COLORS.darkGreen }}>Room</label>
                            <select
                              name="roomId"
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                              value={formData.roomId}
                              onChange={handleChange}
                            >
                              {PROPERTIES.map((prop) => (
                                <optgroup key={prop.id} label={prop.name}>
                                  {availableRoomOptions
                                    .filter((room) => room.propertyId === prop.id)
                                    .map((room) => (
                                      <option key={room.id} value={room.id}>
                                        {room.name}{room.displayStatus}
                                      </option>
                                    ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: COLORS.darkGreen }}>Status</label>
                            <select
                              name="status"
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                              value={formData.status}
                              onChange={handleChange}
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="pending">Pending</option>
                              <option value="checked-in">Checked In</option>
                              <option value="checked-out">Checked Out</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.darkGreen }}>Channel</label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { value: 'airbnb', label: 'Airbnb' },
                              { value: 'direct', label: 'Direct' },
                              { value: 'coliving', label: 'Coliving.com' },
                            ].map((opt) => {
                              const active = formData.channel === opt.value;
                              return (
                                <button
                                  type="button"
                                  key={opt.value}
                                  onClick={() => handleChange({ target: { name: 'channel', value: opt.value } })}
                                  className={`w-full text-left px-3.5 py-3 rounded-2xl border transition-all ${active ? 'border-[#26402E] bg-[#E2F05D]/25 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-semibold text-sm" style={{ color: COLORS.darkGreen }}>{opt.label}</span>
                                    <span className={`w-3.5 h-3.5 rounded-full border ${active ? 'bg-[#26402E] border-[#26402E]' : 'border-slate-300'}`}></span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-600">
                          {formData.channel === 'airbnb'
                            ? 'Accommodation is prepaid through Airbnb. Payouts and withholding are shown in the pricing panel.'
                            : 'Set up the 25% reservation payment and 75% arrival balance in Guests & CRM after saving. For monthly stays, this applies to the first month.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={panelClassName}>
                  <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className={sectionEyebrowClassName}>Stay & Availability</div>
                      <p className="mt-1 text-sm text-slate-500">
                        Set the dates and routine details first, then only use the exception tools if the stay changes.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 border ${nights > 0 ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50 text-red-600'}`}>
                        <Clock size={14} />
                        {nights} night{nights !== 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {stayCategoryLabel}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Stay Dates</div>
                        <div className="text-xs text-slate-500 mt-1">These dates drive occupancy, housekeeping timing, and category rules.</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <CustomDatePicker
                            label="Check In"
                            value={formData.checkIn}
                            onChange={(e) => handleDateChange('checkIn', e.target.value)}
                            blockedDates={blockedDatesForRoom.checkInBlocked}
                            boundaryRef={modalContentRef}
                          />
                        </div>
                        <div>
                          <CustomDatePicker
                            label="Check Out"
                            value={formData.checkOut}
                            onChange={(e) => handleDateChange('checkOut', e.target.value)}
                            blockedDates={blockedDatesForRoom.checkOutBlocked}
                            minDate={formData.checkIn}
                            boundaryRef={modalContentRef}
                          />
                          {formData.hasMultipleRoomStay && (
                            <p className="text-xs text-slate-500 mt-1">Use the full stay end date here. Room changes below decide when the guest leaves room 1.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Expected Check-out Time <span className="text-[11px] font-normal text-slate-500">(optional)</span></label>
                          <input
                            type="time"
                            name="checkOutTime"
                            value={formData.checkOutTime || ''}
                            onChange={handleChange}
                            placeholder={DEFAULT_CHECKOUT_TIME}
                            className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] text-sm bg-white shadow-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">Blank defaults to 12:00. Used for scheduling and housekeeping.</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Expected Check-in Time <span className="text-[11px] font-normal text-slate-500">(optional)</span></label>
                          <input
                            type="time"
                            name="checkInTime"
                            value={formData.checkInTime || ''}
                            onChange={handleChange}
                            placeholder={DEFAULT_CHECKIN_TIME}
                            className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] text-sm bg-white shadow-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">Blank defaults to 15:00. Helpful for housekeeping timing.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white p-4 space-y-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Stay Rules</div>
                        <div className="text-xs text-slate-500 mt-1">Choose the stay type and any routine operational needs.</div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.darkGreen }}>Stay Category</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {[
                            { value: 'short', label: 'Short Term', helper: '1-6 nights' },
                            { value: 'medium', label: 'Medium Term', helper: '7-30 nights' },
                            { value: 'long', label: 'Long Term', helper: '31+ nights' },
                          ].map((opt) => {
                            const active = formData.stayCategory === opt.value;
                            return (
                              <button
                                type="button"
                                key={opt.value}
                                onClick={() => handleChange({ target: { name: 'stayCategory', value: opt.value, type: 'radio' } })}
                                className={`w-full text-left px-3.5 py-3 rounded-2xl border transition-all ${active ? 'border-[#26402E] bg-[#E2F05D]/25 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm" style={{ color: COLORS.darkGreen }}>{opt.label}</span>
                                  <span className={`w-3.5 h-3.5 rounded-full border ${active ? 'bg-[#26402E] border-[#26402E]' : 'border-slate-300'}`}></span>
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{opt.helper}</div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-xs text-slate-500 mt-2">Medium and long stays follow weekly cleaning and laundry, without a turnover unless dates overlap with another guest.</div>
                      </div>

                      {formData.isLongTerm && (
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>
                            Weekly cleaning day
                          </label>
                          <select
                            name="weeklyCleaningDay"
                            className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm text-sm"
                            value={formData.weeklyCleaningDay}
                            onChange={handleChange}
                          >
                            <option value="monday">Monday</option>
                            <option value="tuesday">Tuesday</option>
                            <option value="wednesday">Wednesday</option>
                            <option value="thursday">Thursday</option>
                            <option value="friday">Friday</option>
                            <option value="saturday">Saturday</option>
                            <option value="sunday">Sunday</option>
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            id="earlyCheckIn"
                            name="earlyCheckIn"
                            checked={formData.earlyCheckIn}
                            onChange={handleChange}
                            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-lime focus:ring-lime"
                            style={{ color: COLORS.darkGreen, accentColor: COLORS.darkGreen }}
                          />
                          <span>
                            <span className="font-semibold block" style={{ color: COLORS.darkGreen }}>Request Early Check-in</span>
                            <span className="text-xs text-slate-500">Marks the stay as needing room priority.</span>
                          </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            name="bikeParkingNeeded"
                            checked={!!formData.bikeParkingNeeded}
                            onChange={handleChange}
                            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-lime focus:ring-lime"
                            style={{ color: COLORS.darkGreen, accentColor: COLORS.darkGreen }}
                          />
                          <span>
                            <span className="font-semibold block" style={{ color: COLORS.darkGreen }}>Bike parking needed</span>
                            <span className="text-xs text-slate-500">Track whether the guest will park a bike at the house.</span>
                          </span>
                        </label>
                      </div>

                      {formData.bikeParkingNeeded && (
                        <div className="w-full sm:w-1/2">
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>How many bikes?</label>
                          <input
                            type="number"
                            name="bikeCount"
                            min="1"
                            max="5"
                            value={formData.bikeCount || 1}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white p-4 space-y-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Exception Tools</div>
                        <div className="text-xs text-slate-500 mt-1">Only use these if the original stay changes and the calendar should behave differently.</div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Multiple Room Stay</div>
                            <div className="text-xs text-slate-500 mt-1">Use this if the guest starts in one room and continues the stay in another.</div>
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              name="hasMultipleRoomStay"
                              checked={!!formData.hasMultipleRoomStay}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-slate-300"
                              style={{ accentColor: COLORS.darkGreen }}
                            />
                            Enable
                          </label>
                        </div>

                        {formData.hasMultipleRoomStay && (
                          <div className="space-y-3">
                            <div className="text-xs text-slate-500">
                              The room selected in Reservation Basics is room 1. Each move date starts the next room segment.
                            </div>
                            {(formData.roomMoves || []).map((move, idx) => (
                              <div key={move.id || idx} className="rounded-xl border border-slate-200 p-3 bg-white space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    {idx === 0 ? 'Room 2' : `Room ${idx + 2}`}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeRoomMove(move.id)}
                                    className="px-3 py-1.5 rounded-full border border-red-200 text-red-700 text-xs font-semibold bg-white hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                                      {idx === 0 ? 'Room 2' : `Room ${idx + 2}`}
                                    </label>
                                    <select
                                      value={move.roomId || ''}
                                      onChange={(e) => updateRoomMove(move.id, { roomId: e.target.value })}
                                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                    >
                                      <option value="">Select room</option>
                                      {PROPERTIES.map((prop) => (
                                        <optgroup key={prop.id} label={prop.name}>
                                          {availableRoomOptions
                                            .filter((room) => room.propertyId === prop.id)
                                            .map((room) => (
                                              <option key={room.id} value={room.id}>
                                                {room.name}{room.displayStatus}
                                              </option>
                                            ))}
                                        </optgroup>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                                      {idx === 0 ? 'Move to room 2 on' : `Move to room ${idx + 2} on`}
                                    </label>
                                    <input
                                      type="date"
                                      value={move.moveDate || ''}
                                      min={formData.checkIn ? addDays(formData.checkIn, 1) : undefined}
                                      max={formData.checkOut ? addDays(formData.checkOut, -1) : undefined}
                                      onChange={(e) => updateRoomMove(move.id, { moveDate: e.target.value })}
                                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                    />
                                  </div>
                                </div>

                                {formData.stayCategory === 'long' && (
                                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={!!move.useDifferentMonthlyRent}
                                      onChange={(e) => updateRoomMove(move.id, {
                                        useDifferentMonthlyRent: e.target.checked,
                                        monthlyRentVnd: e.target.checked ? (move.monthlyRentVnd || formData.monthlyRentVnd || '') : (formData.monthlyRentVnd || ''),
                                      })}
                                      className="h-4 w-4 rounded border-slate-300"
                                      style={{ accentColor: COLORS.darkGreen }}
                                    />
                                    Different monthly rent from this move date
                                  </label>
                                )}

                                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={!!move.useDifferentChannel}
                                    onChange={(e) => updateRoomMove(move.id, {
                                      useDifferentChannel: e.target.checked,
                                      channel: e.target.checked ? (move.channel || formData.channel || 'airbnb') : '',
                                      paymentStatus: e.target.checked
                                        ? ((move.channel || formData.channel || 'airbnb') === 'direct' ? (move.paymentStatus || formData.paymentStatus || '') : '')
                                        : '',
                                    })}
                                    className="h-4 w-4 rounded border-slate-300"
                                    style={{ accentColor: COLORS.darkGreen }}
                                  />
                                  Different channel from this move date
                                </label>

                                {move.useDifferentChannel && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                                        {idx === 0 ? 'Channel Room 2' : `Channel Room ${idx + 2}`}
                                      </label>
                                      <select
                                        value={move.channel || ''}
                                        onChange={(e) => updateRoomMove(move.id, {
                                          channel: e.target.value,
                                          paymentStatus: e.target.value === 'direct' ? (move.paymentStatus || formData.paymentStatus || '') : '',
                                        })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                      >
                                        <option value="airbnb">Airbnb</option>
                                        <option value="direct">Direct</option>
                                        <option value="coliving">Coliving.com</option>
                                      </select>
                                    </div>
                                    {move.channel === 'direct' && <p className="text-xs text-slate-500">Direct rent and received payments are tracked in Guests & CRM from this date.</p>}
                                  </div>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={addRoomMove}
                              className="px-3 py-2 rounded-full border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50"
                            >
                              + Add another room change
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Early Contract End</div>
                            <div className="text-xs text-slate-500 mt-1">Use this when a guest or tenant moves out before the original contract end date.</div>
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              name="endedEarly"
                              checked={!!formData.endedEarly}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-slate-300"
                              style={{ accentColor: COLORS.darkGreen }}
                            />
                            Enable
                          </label>
                        </div>

                        {formData.endedEarly && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                                  Actual move-out date
                                </label>
                                <input
                                  type="date"
                                  value={formData.actualCheckoutDate || ''}
                                  min={formData.checkIn ? addDays(formData.checkIn, 1) : undefined}
                                  max={formData.checkOut ? addDays(formData.checkOut, -1) : undefined}
                                  onChange={(e) => setFormData((prev) => ({ ...prev, actualCheckoutDate: e.target.value }))}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                />
                                <div className="text-xs text-slate-500 mt-1">Calendar availability and checkout cleaning will use this date instead of the booked contract end.</div>
                              </div>
                            </div>

                            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                name="earlyTerminationReimbursed"
                                checked={!!formData.earlyTerminationReimbursed}
                                onChange={handleChange}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                style={{ accentColor: COLORS.darkGreen }}
                              />
                              <span>
                                <span className="font-semibold text-slate-800">Reimburse the unused days</span>
                                <span className="block text-xs text-slate-500 mt-1">
                                  On: financials stop on the actual move-out date. Off: the room opens in the calendar, but the original booked financials remain.
                                </span>
                              </span>
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Guest Breaks</div>
                            <div className="text-xs text-slate-500 mt-1">Use this for temporary absences that should free dates for other bookings.</div>
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              name="hasGuestBreaks"
                              checked={!!formData.hasGuestBreaks}
                              onChange={handleChange}
                              className="h-4 w-4 rounded border-slate-300"
                              style={{ accentColor: COLORS.darkGreen }}
                            />
                            Enable
                          </label>
                        </div>

                        {formData.hasGuestBreaks && (
                          <div className="space-y-2">
                            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                name="sellRoomDuringBreak"
                                checked={!!formData.sellRoomDuringBreak}
                                onChange={handleChange}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                style={{ accentColor: COLORS.darkGreen }}
                              />
                              <span>
                                <span className="font-semibold text-slate-800">Guest wants to sell rooms during break</span>
                                <span className="block text-xs text-slate-500 mt-1">When enabled, break days stay available to sell and rent is reduced using the actual number of days in each calendar month.</span>
                              </span>
                            </label>
                            {guestBreakCount === 0 ? (
                              <div className="text-xs text-slate-500">No breaks added yet.</div>
                            ) : (
                              (formData.guestBreakPeriods || []).map((period, idx) => (
                                <div key={period.id || idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                                  <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Away from</label>
                                    <input
                                      type="date"
                                      value={period.startDate || ''}
                                      min={formData.checkIn || undefined}
                                      max={formData.checkOut ? addDays(formData.checkOut, -1) : undefined}
                                      onChange={(e) => updateGuestBreakPeriod(period.id, 'startDate', e.target.value)}
                                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Returns on</label>
                                    <input
                                      type="date"
                                      value={period.endDate || ''}
                                      min={period.startDate ? addDays(period.startDate, 1) : formData.checkIn || undefined}
                                      max={formData.checkOut ? addDays(formData.checkOut, -1) : undefined}
                                      onChange={(e) => updateGuestBreakPeriod(period.id, 'endDate', e.target.value)}
                                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeGuestBreakPeriod(period.id)}
                                    className="px-3 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-semibold bg-white hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))
                            )}
                            <button
                              type="button"
                              onClick={addGuestBreakPeriod}
                              className="px-3 py-2 rounded-full border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50"
                            >
                              + Add break dates
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className={panelClassName}>
                  <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                    <div className={sectionEyebrowClassName}>Booking Notes</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Internal context for staff: preferences, issues, payment notes, or follow-up reminders.
                    </p>
                  </div>
                  <div className="p-5">
                    <textarea
                      name="notes"
                      value={formData.notes || ''}
                      onChange={handleChange}
                      rows={5}
                      placeholder="Add internal notes for this reservation..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all resize-y min-h-[140px]"
                    />
                  </div>
                </section>
              </div>

              <aside className="space-y-5 xl:sticky xl:top-0">
                <section className="rounded-[28px] border border-[#26402E] bg-[linear-gradient(180deg,rgba(38,64,46,0.98),rgba(46,75,55,0.96))] px-5 py-5 text-white shadow-[0_18px_40px_rgba(38,64,46,0.22)]">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/65">Snapshot</div>
                  <div className="mt-4">
                    <div className="text-lg font-semibold">{formData.guestName || 'New guest'}</div>
                    <div className="mt-1 text-sm text-white/70">{summaryDateLabel}</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white/8 px-3 py-3">
                      <div className="text-white/60 text-[11px] uppercase tracking-wide">Room</div>
                      <div className="mt-1 font-semibold">{selectedRoom?.name || 'Not set'}</div>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-3 py-3">
                      <div className="text-white/60 text-[11px] uppercase tracking-wide">Status</div>
                      <div className="mt-1 font-semibold">{statusLabel}</div>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-3 py-3">
                      <div className="text-white/60 text-[11px] uppercase tracking-wide">Channel</div>
                      <div className="mt-1 font-semibold">{channelLabel}</div>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-3 py-3">
                      <div className="text-white/60 text-[11px] uppercase tracking-wide">Category</div>
                      <div className="mt-1 font-semibold">{stayCategoryLabel}</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-white/72">
                    {formData.endedEarly && formData.actualCheckoutDate && (
                      <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2">
                        Calendar reopens after {formatDate(formData.actualCheckoutDate)}.
                      </div>
                    )}
                    {formData.hasGuestBreaks && guestBreakCount > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2">
                        {guestBreakCount} guest break period{guestBreakCount !== 1 ? 's' : ''} recorded.
                      </div>
                    )}
                    {formData.hasMultipleRoomStay && (
                      <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2">
                        Multiple room stay enabled.
                      </div>
                    )}
                  </div>
                </section>

                <section className={panelClassName}>
                  <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                    <div className={sectionEyebrowClassName}>Pricing</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Set the main booking value here before adding any paid services.
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Current Total</div>
                          <div className="mt-2 text-2xl font-semibold" style={{ color: COLORS.darkGreen }}>
                            {formatCurrencyVND(bookingTotalWithServices)}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>Base: {formatCurrencyVND(bookingBaseAmount)}</div>
                          <div className="mt-1">Services: {formatCurrencyVND(servicesTotal)}</div>
                        </div>
                      </div>
                    </div>

                    {formData.channel === 'airbnb' && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Airbnb Withholding (Vietnam)</div>
                          <p className="text-xs text-slate-500 mt-1">Enter the guest-paid gross amount. The Airbnb host fee is deducted automatically; VAT and income tax apply only to stays before 19 July 2026.</p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Gross amount (₫)</label>
                          <input
                            type="number"
                            name="airbnbBaseEarningsVnd"
                            value={formData.airbnbBaseEarningsVnd}
                            onChange={handleChange}
                            required
                            min="0"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] bg-white"
                            placeholder="Guest-paid gross amount before Airbnb host fee and taxes"
                          />
                          <div className="text-[11px] text-slate-500 mt-1">Legacy field names stay the same internally, but this input now represents gross room revenue.</div>
                        </div>

                        <div className="text-xs text-slate-600">
                          {withholdingPreview?.status === 'computed' ? (
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-800">Gross amount: {formatCurrencyVND(withholdingPreview.airbnbBaseEarningsVnd || withholdingPreview.netEarningsFromEmail || 0)}</div>
                              {withholdingPreview.taxExempt && (
                                <div className="font-semibold text-emerald-700">No Airbnb VAT or income tax withholding (check-in on or after 19 July 2026).</div>
                              )}
                              <div className="grid grid-cols-1 gap-1 text-slate-600">
                                <span>Host fee (15.5% + VAT): {formatCurrencyVND(withholdingPreview.commissionWithheld)}</span>
                                <span>VAT 5%{withholdingPreview.taxExempt ? ' (not withheld)' : ''}: {formatCurrencyVND(withholdingPreview.vatWithheld)}</span>
                                <span>Income tax 2%{withholdingPreview.taxExempt ? ' (not withheld)' : ''}: {formatCurrencyVND(withholdingPreview.incomeTaxWithheld)}</span>
                                <span>Total deductions: {formatCurrencyVND(withholdingPreview.totalWithheld)}</span>
                                <span className="font-semibold text-slate-800">Final counted income: {formatCurrencyVND(withholdingPreview.finalCountedIncome)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-600">
                              Enter the gross amount. Without it, the booking is marked withholding-unknown and excluded from totals.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {formData.stayCategory === 'long' ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Monthly Rent (VND)</label>
                          <input
                            required
                            type="number"
                            name="monthlyRentVnd"
                            className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                            value={formData.monthlyRentVnd}
                            onChange={handleChange}
                            min="0"
                          />
                          <p className="text-xs text-slate-500 mt-1">Full calendar months are charged at this exact rate. Partial months use the actual number of days in that month.</p>
                          <p className="text-xs font-semibold text-slate-600 mt-1">Estimated total for selected dates: {formatCurrencyVND(longStayEstimatedTotal)}</p>
                        </div>

                        {formData.hasMultipleRoomStay && (formData.roomMoves || []).map((move, idx) => (
                          move.useDifferentMonthlyRent ? (
                            <div key={`${move.id || idx}_rent`}>
                              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>
                                {idx === 0 ? 'Monthly Rent Room 2 (VND)' : `Monthly Rent Room ${idx + 2} (VND)`}
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={move.monthlyRentVnd ?? ''}
                                onChange={(e) => updateRoomMove(move.id, { monthlyRentVnd: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                Applies from {move.moveDate || `the move into room ${idx + 2}`} onward.
                              </p>
                            </div>
                          ) : null
                        ))}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Total Price (VND)</label>
                        <input
                          required
                          type="number"
                          name="price"
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                          value={formData.price}
                          onChange={handleChange}
                          readOnly={formData.channel === 'airbnb'}
                          disabled={formData.channel === 'airbnb'}
                        />
                        {formData.channel === 'airbnb' && (
                          <p className="text-xs text-slate-500 mt-1">Auto-calculated after Airbnb host fee, VAT, and income tax deductions.</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <section className={panelClassName}>
                  <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex flex-wrap items-start gap-3">
                    <div>
                      <div className={sectionEyebrowClassName}>Services</div>
                      <p className="mt-1 text-sm text-slate-500">
                        Add paid extras after the base booking value is correct.
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-600 ml-auto min-w-[160px] break-words">
                      <div className="font-semibold">Services total: {formatCurrencyVND(servicesTotal)}</div>
                      <div className="text-[11px]">Booking total: {formatCurrencyVND(bookingTotalWithServices)}</div>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex flex-wrap gap-2 items-start min-w-0">
                      {SERVICE_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => addServiceFromPreset(preset)}
                          className="px-3 py-2 text-xs font-semibold rounded-full border border-slate-200 bg-[#E2F05D]/40 text-slate-800 hover:shadow-sm max-w-full whitespace-normal break-words text-left"
                        >
                          {preset.name} ({formatCurrencyVND(preset.price)})
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Other / Custom</label>
                        <input
                          type="text"
                          name="name"
                          placeholder="Service name"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          value={customService.name}
                          onChange={handleCustomServiceChange}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Price (₫)</label>
                        <input
                          type="number"
                          name="price"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          value={customService.price}
                          onChange={handleCustomServiceChange}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Qty</label>
                        <input
                          type="number"
                          name="qty"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          value={customService.qty}
                          onChange={handleCustomServiceChange}
                          min="1"
                        />
                      </div>
                      <div className="flex md:justify-end">
                        <button
                          type="button"
                          onClick={addCustomService}
                          className="w-full md:w-auto px-4 py-2 rounded-full text-sm font-semibold border border-[#26402E] text-[#26402E] bg-[#E2F05D]/50 hover:bg-[#E2F05D] transition-colors"
                        >
                          Add service
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Service</th>
                            <th className="px-3 py-2 text-right">Price</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Line total</th>
                            <th className="px-3 py-2 text-right">Added</th>
                            <th className="px-3 py-2 text-right">Remove</th>
                          </tr>
                        </thead>
                        <tbody>
                          {services.length === 0 ? (
                            <tr>
                              <td colSpan="6" className="px-4 py-4 text-center text-slate-500">No services added.</td>
                            </tr>
                          ) : (
                            services.map((s) => {
                              const lineTotal = Math.max(0, Math.round(Number(s.price) || 0)) * Math.max(1, parseInt(s.qty, 10) || 1);
                              return (
                                <tr key={s.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2">
                                    <div className="font-semibold text-slate-800">{s.name}</div>
                                    {s.notes && <div className="text-xs text-slate-500">{s.notes}</div>}
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrencyVND(s.price)}</td>
                                  <td className="px-3 py-2 text-right text-slate-700">{s.qty}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrencyVND(lineTotal)}</td>
                                  <td className="px-3 py-2 text-right text-[11px] text-slate-500">{s.createdAt ? new Date(s.createdAt).toLocaleString() : ''}</td>
                                  <td className="px-3 py-2 text-right">
                                    <button type="button" onClick={() => removeService(s.id)} className="p-2 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50">
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </aside>
            </div>

            <div className="sticky bottom-0 -mx-6 mt-2 border-t border-[#d8dfd2] bg-[#F9F8F2]/95 px-6 py-4 backdrop-blur-sm">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-full font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={nights <= 0 || isSaving}
                  className={`px-6 py-2.5 rounded-full font-medium shadow-sm transition-all transform hover:-translate-y-0.5 ${(nights <= 0 || isSaving) ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  style={{ backgroundColor: COLORS.darkGreen, color: COLORS.white }}
                >
                  {isSaving ? 'Saving…' : booking ? 'Update Reservation' : 'Create Reservation'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookingModal;
