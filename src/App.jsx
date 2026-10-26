import Chatbot from './components/Chatbot.jsx';
// Keep the original CSS order while loading the CRM screen code on demand.
import './components/GuestCRM.css';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import { COLORS, DUE_SOON_DAYS, HOUSEKEEPING_START_TIME } from './config/pms.js';
import { ALL_LOCATIONS, ALL_ROOMS, PROPERTIES, getPropertyForRoom, isRoomOpenOnDate } from './config/properties.js';
import LoginView from './features/auth/LoginView.jsx';
import BookingModal from './features/bookings/BookingModal.jsx';
import RoomNightExportModal from './features/bookings/RoomNightExportModal.jsx';
import CalendarBlockModal from './features/calendar/CalendarBlockModal.jsx';
// Calendar layout effects in the shell need its timeline to mount immediately.
import CalendarView from './features/calendar/CalendarView.jsx';
import InvoiceModal from './features/invoices/InvoiceModal.jsx';
import MaintenanceModal from './features/maintenance/MaintenanceModal.jsx';
import RecurringTaskModal from './features/maintenance/RecurringTaskModal.jsx';
import useStatistics from './features/statistics/useStatistics.js';
import { auth, db } from './firebase.js';
import useGuestCrm from './hooks/useGuestCrm.js';
import usePmsSubscriptions from './hooks/usePmsSubscriptions.js';
import { AIRBNB_PAYOUT_RATE, computeAirbnbWithholding, deriveAirbnbGrossAmount, getDisplayPriceForBooking } from './lib/airbnb.js';
import { getFirebaseAuthHint } from './lib/authErrors.js';
import { bookingOccupiesDate, bookingsOverlapConsideringBreaks, calculateLongTermRentForRange, doDateRangesOverlap, expandBookingToRoomStays, getBookingFinancialDateKeys, getBookingOccupancyCheckOut, getBookingOccupiedDates, getBookingRoomIdForDate, getBookingRoomStays, getBookingSegmentForDate, getBookingStaySegments, isBlockingStatus, isCancelledStatus, isHousekeepingBooking, normalizeBookingBreaks, normalizeRoomMoves } from './lib/bookingDates.js';
import { calendarBlockOccupiesDate, getCalendarBlockLabel, normalizeCalendarBlock } from './lib/calendarBlocks.js';
import { addDays, calculateNights, formatDate, getDateRangeDays, getDaysArray, getMonthBounds, getWeekMonday } from './lib/dates.js';
import { normalizeHousekeepingTasks } from './lib/housekeeping.js';
import { buildCleaningTasksForDate, splitCleaningByPriority } from './lib/housekeepingSchedule.js';
import { buildRecurringGroupKey, computeDuplicateIssues, getNextRecurringDueDate } from './lib/maintenance.js';
import { buildRoomNightWorkbookXml, formatExportRangeLabel } from './lib/roomNightExport.js';
import { randomId, withTimeout } from './lib/shared.js';
import { removeBooking, upsertBooking } from './services/bookingsService.js';
import { previewReturningGuest, resolveGuestForBooking, updateGuestStatsFromBooking } from './services/guestResolver.js';
import { buildRoomTransferPlan } from './services/roomTransfers.js';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import { Menu, Plus, RefreshCcw } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const DashboardView = lazy(() => import('./features/dashboard/DashboardView.jsx'));
const BookingsView = lazy(() => import('./features/bookings/BookingsView.jsx'));
const HousekeepingView = lazy(() => import('./features/housekeeping/HousekeepingView.jsx'));
const MaintenanceView = lazy(() => import('./features/maintenance/MaintenanceView.jsx'));
const StatisticsView = lazy(() => import('./features/statistics/StatisticsView.jsx'));
const InvoicesView = lazy(() => import('./features/invoices/InvoicesView.jsx'));
const GuestCRM = lazy(() => import('./components/GuestCRM.jsx'));

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data initialized as empty - will be populated by Firestore real-time listeners
  const [bookings, setBookings] = useState([]);
  const [calendarBlocks, setCalendarBlocks] = useState([]);
  const [guests, setGuests] = useState([]);
  const crm = useGuestCrm(db, user);
  const [roomStatuses, setRoomStatuses] = useState({});
  const [maintenanceIssues, setMaintenanceIssues] = useState([]);
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [recurringCleaningTasks, setRecurringCleaningTasks] = useState([]);
  const [loadingRecurring, setLoadingRecurring] = useState(true);
  const [dataError, setDataError] = useState(null); // surfaces listener/auth errors
  const [bookingCategoryFilter, setBookingCategoryFilter] = useState('all');
  const [bookingTimeFilter, setBookingTimeFilter] = useState('current'); // 'current' | 'future' | 'past'
  const [loginHint, setLoginHint] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [savingBookingId, setSavingBookingId] = useState(null);
  const [roomTransfer, setRoomTransfer] = useState(null);
  const [roomTransferError, setRoomTransferError] = useState('');
  const draggedRoomStay = useRef(null);
  const roomTransferSaving = useRef(false);
  const [activeIssue, setActiveIssue] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const undoTimerRef = useRef(null);
  const [recurringModalMode, setRecurringModalMode] = useState('single');
  const [expandedRecurringGroups, setExpandedRecurringGroups] = useState({});
  const [issueFilters, setIssueFilters] = useState({ status: 'open', property: 'all', search: '', dateRange: 'all', recurringOnly: false });
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [bulkAssignValue, setBulkAssignValue] = useState('Needs assignment');
  const processedRecurringRef = useRef(new Set());
  const [housekeepingDate, setHousekeepingDate] = useState(() => formatDate(new Date()));
  const [housekeepingStartTime, setHousekeepingStartTime] = useState(HOUSEKEEPING_START_TIME);
  const [housekeepingView, setHousekeepingView] = useState('daily'); // 'daily' | 'weekly'
  const [weekPlanningStart, setWeekPlanningStart] = useState(() => getWeekMonday(new Date()));
  const [housekeepingOverrides, setHousekeepingOverrides] = useState({});
  const [recurringCleaningDraft, setRecurringCleaningDraft] = useState(() => ({
    selectedRoomIds: ALL_ROOMS?.[0]?.id ? [ALL_ROOMS[0].id] : [],
    description: '',
    frequency: 'weekly',
    nextDue: formatDate(new Date()),
    priority: 2,
    assignedTo: 'Unassigned',
  }));
  const [expandedRecurringCleaningGroups, setExpandedRecurringCleaningGroups] = useState({});
  const [bookingSearchTerm, setBookingSearchTerm] = useState('');
  const autoCheckoutProcessedRef = useRef(new Set());
  const autoCheckinProcessedRef = useRef(new Set());
  const [statsRange, setStatsRange] = useState('this-week'); // 'this-week' | 'this-month' | 'last-30' | 'custom'
  const [customStatsStart, setCustomStatsStart] = useState(formatDate(new Date()));
  const [customStatsEnd, setCustomStatsEnd] = useState(formatDate(new Date()));
  const [calendarView, setCalendarView] = useState('guestName');

  const deriveStayCategory = useCallback((nights) => {
    if (nights >= 31) return 'long';
    if (nights >= 7) return 'medium';
    return 'short';
  }, []);

  const getBookingStayCategory = useCallback((b) => {
    const nights = b?.nights || calculateNights(b?.checkIn, b?.checkOut);
    if (b?.stayCategory) return b.stayCategory;
    if (b?.isLongTerm) {
      // Backward compat: legacy long-term flag follows updated thresholds.
      if (nights >= 31) return 'long';
      if (nights >= 7) return 'medium';
    }
    return deriveStayCategory(nights);
  }, [deriveStayCategory]);

  const formatStayCategoryLabel = (cat) => {
    if (cat === 'medium') return 'Medium Term';
    if (cat === 'long') return 'Long Term';
    return 'Short Term';
  };

  const pushAlert = useCallback((alert) => {
    const id = Math.random().toString(36).substr(2, 9);
    const entry = { id, title: alert.title || 'Error', message: alert.message || '', code: alert.code, tone: alert.tone || 'error' };
    console.error('[app-alert]', entry.code, entry.message, alert.raw || '');
    setAlerts((prev) => [...prev.slice(-9), entry]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 6000);
  }, []);

  const formatChannelLabel = (channel) => {
    if (channel === 'mixed') return 'Mixed';
    if (channel === 'direct') return 'Direct';
    if (channel === 'coliving') return 'Coliving.com';
    return 'Airbnb';
  };

  const formatIssueAge = (reportedAt) => {
    if (!reportedAt) return '–';
    const then = new Date(reportedAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - then);
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins || 1}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const assignedLabel = (val) => (!val || val === 'Unassigned' ? 'Needs assignment' : val);
  const isResolvedStatus = (status) => status === 'resolved' || status === 'completed';

  const openIssuePanel = (issue) => {
    if (!issue) return;
    setActiveIssue({ panelType: 'issue', ...issue });
  };

  const openRoomPanel = (locId, mode = 'room') => {
    const loc = ALL_LOCATIONS.find((l) => l.id === locId);
    if (!loc) {
      pushAlert({ title: 'Could not open room', message: 'Missing location data', tone: 'error' });
      return;
    }
    const locIssues = maintenanceIssues.filter((i) => i.locationId === loc.id && !isResolvedStatus(i.status));
    setActiveIssue({
      panelType: mode,
      locationId: loc.id,
      locationName: loc.name,
      propertyName: loc.propertyName,
      issues: locIssues,
    });
  };

  const startUndo = (action) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(action);
    undoTimerRef.current = setTimeout(() => {
      setUndoAction(null);
    }, 8000);
  };

  const handleUndo = async () => {
    if (!undoAction) return;
    try {
      if (undoAction.type === 'delete' && undoAction.issue) {
        await setDoc(doc(db, 'maintenance', undoAction.issue.id), undoAction.issue);
        pushAlert({ title: 'Delete undone', message: 'Issue restored', tone: 'success' });
      }
      if (undoAction.type === 'resolve' && undoAction.issue) {
        await setDoc(doc(db, 'maintenance', undoAction.issue.id), undoAction.issue, { merge: true });
        pushAlert({ title: 'Resolution undone', message: 'Issue re-opened', tone: 'success' });
      }
    } catch (error) {
      pushAlert({ title: 'Undo failed', message: error?.message || 'Unable to undo', code: error?.code, raw: error });
    } finally {
      setUndoAction(null);
    }
  };

  const handleSaveCrmProfile = useCallback(async ({ guest, booking, notes, tags }) => {
    let guestId = guest?.id;
    if (!guestId && booking) {
      const resolved = await resolveGuestForBooking({ db, bookingDraft: booking });
      guestId = resolved.guestId;
      await setDoc(doc(db, 'bookings', booking.id), { guestId }, { merge: true });
    }
    if (!guestId) throw new Error('Create a booking before saving a new guest profile.');
    await setDoc(doc(db, 'guests', guestId), { notes, tags, updatedAt: new Date().toISOString() }, { merge: true });
  }, []);

  const openBookingForGuest = useCallback((guest) => {
    if (!guest) return;
    const today = formatDate(new Date());
    const tomorrow = formatDate(new Date(Date.now() + 86400000));
    setEditingBooking({
      guestName: guest.fullName || '',
      guestEmail: guest.email || '',
      guestPhone: guest.phone || '',
      checkIn: today,
      checkOut: tomorrow,
      roomId: ALL_ROOMS?.[0]?.id || '',
      status: 'confirmed',
      price: 0,
      services: [],
      channel: (guest.sourceChannels && guest.sourceChannels[0]) || 'airbnb',
    });
    setIsModalOpen(true);
    setActiveTab('bookings');
  }, [setActiveTab]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-mark past stays as checked-out the day after departure.
  useEffect(() => {
    if (!bookings.length) return;
    const todayStr = formatDate(new Date());
    const todayTs = new Date(todayStr).getTime();

    const overdue = bookings.filter((b) => {
      const occupancyCheckOut = getBookingOccupancyCheckOut(b);
      if (!b?.id || !occupancyCheckOut) return false;
      if (['cancelled', 'checked-out'].includes(b.status)) return false;
      if (autoCheckoutProcessedRef.current.has(b.id)) return false;
      const checkoutTs = new Date(occupancyCheckOut).getTime();
      if (!Number.isFinite(checkoutTs)) return false;
      return checkoutTs < todayTs;
    });

    if (!overdue.length) return;

    overdue.forEach((b) => {
      const nowIso = new Date().toISOString();
      const payload = { status: 'checked-out', autoCheckedOut: true, autoCheckedOutAt: nowIso, updatedAt: nowIso };

      setDoc(doc(db, 'bookings', b.id), payload, { merge: true })
        .then(() => {
          autoCheckoutProcessedRef.current.add(b.id);
          setBookings((prev) => prev.map((bk) => (bk.id === b.id ? { ...bk, ...payload } : bk)));
        })
        .catch((err) => {
          console.error('[auto-checkout] failed', err);
        });
    });
  }, [bookings, db]);

  // Auto-mark overdue arrivals as checked-in the day after their check-in date.
  useEffect(() => {
    if (!bookings.length) return;
    const todayStr = formatDate(new Date());
    const todayTs = new Date(todayStr).getTime();

    const overdueArrivals = bookings.filter((b) => {
      if (!b?.id || !b.checkIn) return false;
      if (['cancelled', 'checked-in', 'checked-out'].includes(b.status)) return false;
      if (autoCheckinProcessedRef.current.has(b.id)) return false;
      const checkinTs = new Date(b.checkIn).getTime();
      if (!Number.isFinite(checkinTs)) return false;
      return checkinTs < todayTs;
    });

    if (!overdueArrivals.length) return;

    overdueArrivals.forEach((b) => {
      const nowIso = new Date().toISOString();
      const payload = { status: 'checked-in', autoCheckedIn: true, autoCheckedInAt: nowIso, updatedAt: nowIso };

      setDoc(doc(db, 'bookings', b.id), payload, { merge: true })
        .then(() => {
          autoCheckinProcessedRef.current.add(b.id);
          setBookings((prev) => prev.map((bk) => (bk.id === b.id ? { ...bk, ...payload } : bk)));
        })
        .catch((err) => {
          console.error('[auto-checkin] failed', err);
        });
    });
  }, [bookings, db]);

  usePmsSubscriptions({
    pushAlert,
    setAuthLoading,
    setBookings,
    setCalendarBlocks,
    setDataError,
    setGuests,
    setHousekeepingOverrides,
    setLoading,
    setLoadingRecurring,
    setMaintenanceIssues,
    setRecurringCleaningTasks,
    setRecurringTasks,
    setRoomStatuses,
    setUser,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [isCalendarBlockModalOpen, setIsCalendarBlockModalOpen] = useState(false);
  const [editingCalendarBlock, setEditingCalendarBlock] = useState(null);
  const [isSavingCalendarBlock, setIsSavingCalendarBlock] = useState(false);
  const [calendarCreateMode, setCalendarCreateMode] = useState('booking');

  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [editingMaintenanceIssue, setEditingMaintenanceIssue] = useState(null);
  const [isSavingMaintenanceIssue, setIsSavingMaintenanceIssue] = useState(false);
  const [pendingMaintenancePrefill, setPendingMaintenancePrefill] = useState(null);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurringTask, setEditingRecurringTask] = useState(null);
  const [pendingRecurringPrefill, setPendingRecurringPrefill] = useState(null);

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isRoomNightExportModalOpen, setIsRoomNightExportModalOpen] = useState(false);
  const [roomNightExportMode, setRoomNightExportMode] = useState('month');
  const [roomNightExportMonth, setRoomNightExportMonth] = useState(() => formatDate(new Date()).slice(0, 7));
  const [roomNightExportStart, setRoomNightExportStart] = useState(() => formatDate(new Date()));
  const [roomNightExportEnd, setRoomNightExportEnd] = useState(() => formatDate(new Date()));

  const bookingsWithWithholding = useMemo(
    () => bookings.map((b) => ({ ...b, _withholding: computeAirbnbWithholding(b) })),
    [bookings]
  );

  const backfillRunningRef = useRef(false);

  useEffect(() => {
    if (!bookingsWithWithholding.length) return;
    if (backfillRunningRef.current) return;

    const toUpdate = bookingsWithWithholding
      .filter((b) => (b.channel || '').toLowerCase() === 'airbnb')
      .map((b) => {
        const hasWithholdingFields =
          b.grossPrice != null ||
          b.commissionWithheld != null ||
          b.vatWithheld != null ||
          b.incomeTaxWithheld != null ||
          b.totalWithheld != null ||
          b.finalCountedIncome != null ||
          b.withholdingStatus != null;

        const normalizedBase = deriveAirbnbGrossAmount(b);
        const w = computeAirbnbWithholding({
          ...b,
          grossPrice: normalizedBase,
          airbnbBaseEarningsVnd: normalizedBase,
        });
        const targetPrice =
          w.status === 'computed' && Number.isFinite(w.payoutBeforeTax)
            ? w.payoutBeforeTax
            : b.price;
        const differs =
          (b.withholdingStatus || 'not_applicable') !== (w.status || 'not_applicable') ||
          (b.grossPrice ?? null) !== (normalizedBase ?? null) ||
          (b.commissionWithheld ?? null) !== (w.commissionWithheld ?? null) ||
          (b.vatWithheld ?? null) !== (w.vatWithheld ?? null) ||
          (b.incomeTaxWithheld ?? null) !== (w.incomeTaxWithheld ?? null) ||
          (b.totalWithheld ?? null) !== (w.totalWithheld ?? null) ||
          (b.finalCountedIncome ?? null) !== (w.finalCountedIncome ?? null) ||
          (b.netEarningsFromEmail ?? null) !== (w.netEarningsFromEmail ?? null) ||
          (b.airbnbBaseEarningsVnd ?? null) !== (normalizedBase ?? null) ||
          (b.price ?? null) !== (targetPrice ?? null);

        if (!differs) return null;

        return {
          id: b.id,
          payload: {
            grossPrice: normalizedBase,
            airbnbBaseEarningsVnd: normalizedBase,
            netEarningsFromEmail: normalizedBase,
            commissionWithheld: w.commissionWithheld ?? null,
            vatWithheld: w.vatWithheld ?? null,
            incomeTaxWithheld: w.incomeTaxWithheld ?? null,
            totalWithheld: w.totalWithheld ?? null,
            finalCountedIncome: w.finalCountedIncome ?? null,
            withholdingStatus: w.status || 'not_applicable',
            price: targetPrice,
          },
        };
      })
      .filter(Boolean);

    if (!toUpdate.length) return;

    backfillRunningRef.current = true;
    (async () => {
      for (const { id, payload } of toUpdate) {
        try {
          await setDoc(doc(db, 'bookings', id), payload, { merge: true });
          setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...payload } : b)));
        } catch (error) {
          console.error('[withholding-backfill] failed', { id, error });
        }
      }
      backfillRunningRef.current = false;
    })();
  }, [bookingsWithWithholding, db]);

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      setLoginHint('');
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Google sign-in failed:', err?.code, err?.message, err);
      setLoginHint(getFirebaseAuthHint(err));
      pushAlert({ title: 'Sign-in failed', message: err?.message, code: err?.code || 'auth-error', raw: err });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setBookings([]);
      setCalendarBlocks([]);
      setRoomStatuses({});
      setMaintenanceIssues([]);
      setRecurringTasks([]);
      setRecurringCleaningTasks([]);
      setLoadingRecurring(true);
      processedRecurringRef.current = new Set();
    } catch (err) {
      console.error('Sign-out failed:', err);
      alert('Sign-out failed. Please try again.');
    }
  };

  // Ensure Bookings List defaults to "Current" each time it is opened
  useEffect(() => {
    if (activeTab === 'bookings') {
      setBookingTimeFilter('current');
    }
  }, [activeTab]);

  // Calendar helpers and selection
  const TODAY_STR = formatDate(new Date());
  const TOMORROW_STR = formatDate(new Date(new Date().setDate(new Date().getDate() + 1)));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(TODAY_STR);
  const [hoveredCalendarDate, setHoveredCalendarDate] = useState(null);
  const [calendarDebug] = useState(() => {
    const stored = localStorage.getItem('calendarDebug');
    if (stored === 'false') return false;
    return true; // default on for now to capture crash context
  });
  const calendarLastActionRef = useRef({ event: 'init', ts: new Date().toISOString() });
  const calendarLastErrorRef = useRef(null);
  const lastScrollLogRef = useRef(0);
  const [visibleStartDate, setVisibleStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [visibleEndDate, setVisibleEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d;
  });
  const [pendingCenterDate, setPendingCenterDate] = useState(null);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const timelineRef = useRef(null);
  const dayWidthRef = useRef(48);
  const extendLockRef = useRef(false);
  const calendarInitRef = useRef(false);
  const dates = useMemo(() => getDaysArray(new Date(visibleStartDate), new Date(visibleEndDate)), [visibleStartDate, visibleEndDate]);

  const logCalendar = useCallback((event, payload = {}) => {
    const entry = { event, payload, ts: new Date().toISOString() };
    calendarLastActionRef.current = entry;
    if (calendarDebug) {
      console.debug('[calendar]', event, payload);
    }
  }, [calendarDebug]);

  useEffect(() => {
    if (!timelineRef.current) return;
    const firstDayCell = timelineRef.current.querySelector('[data-day-cell]');
    if (firstDayCell) {
      const w = firstDayCell.getBoundingClientRect().width;
      if (w) dayWidthRef.current = w;
    }
  }, [dates.length]);

  const EXTEND_DAYS = 7;

  const extendRangeLeft = useCallback(() => {
    const deltaPx = dayWidthRef.current * EXTEND_DAYS;
    setVisibleStartDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - EXTEND_DAYS);
      return next;
    });
    requestAnimationFrame(() => {
      if (timelineRef.current) {
        timelineRef.current.scrollLeft += deltaPx;
      }
      extendLockRef.current = false;
    });
  }, []);

  const extendRangeRight = useCallback(() => {
    setVisibleEndDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + EXTEND_DAYS);
      return next;
    });
    requestAnimationFrame(() => {
      extendLockRef.current = false;
    });
  }, []);

  const handleTimelineScroll = useCallback((e) => {
    const el = e.currentTarget;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const threshold = Math.max(dayWidthRef.current * 2, 80);
    setTimelineScrollLeft(scrollLeft);

    const now = Date.now();
    if (now - lastScrollLogRef.current > 1000) {
      logCalendar('horizontal scroll', { scrollLeft, clientWidth, scrollWidth });
      lastScrollLogRef.current = now;
    }

    if (!extendLockRef.current && scrollLeft < threshold) {
      extendLockRef.current = true;
      extendRangeLeft();
    } else if (!extendLockRef.current && scrollLeft + clientWidth > scrollWidth - threshold) {
      extendLockRef.current = true;
      extendRangeRight();
    }
  }, [extendRangeLeft, extendRangeRight]);

  const scrollTimelineByViewport = useCallback((direction = 1) => {
    if (!timelineRef.current) return;
    const el = timelineRef.current;
    const delta = el.clientWidth * 0.9 * (direction === -1 ? -1 : 1);
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  const scrollToDate = useCallback((dateStr) => {
    if (!timelineRef.current) return;
    const idx = dates.findIndex(d => formatDate(d) === dateStr);
    if (idx === -1) return;
    const el = timelineRef.current;
    const target = idx * dayWidthRef.current - (el.clientWidth - 224) / 2 + dayWidthRef.current / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [dates]);

  const ensureDateVisible = useCallback((dateStr, reason = 'ensure') => {
    console.debug('[calendar] schedule center', { dateStr, reason });
    setPendingCenterDate(dateStr);
    const target = new Date(dateStr);
    setVisibleStartDate((prev) => {
      if (target < prev) {
        const next = new Date(target);
        next.setDate(next.getDate() - 30);
        return next.getTime() === prev.getTime() ? prev : next;
      }
      return prev;
    });
    setVisibleEndDate((prev) => {
      if (target > prev) {
        const next = new Date(target);
        next.setDate(next.getDate() + 30);
        return next.getTime() === prev.getTime() ? prev : next;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 'calendar') {
      calendarInitRef.current = false;
      return;
    }

    if (calendarInitRef.current) return;

    const todayStart = new Date(TODAY_STR);

    setVisibleStartDate(() => {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - 30);
      return d;
    });
    setVisibleEndDate(() => {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + 60);
      return d;
    });

    setSelectedCalendarDate(TODAY_STR);
    setPendingCenterDate(TODAY_STR); // center once per activation

    logCalendar('calendar mounted', { visibleStartDate: formatDate(new Date(todayStart.getTime() - 30 * 86400000)), visibleEndDate: formatDate(new Date(todayStart.getTime() + 60 * 86400000)) });

    calendarInitRef.current = true;
  }, [activeTab, TODAY_STR]);

  useLayoutEffect(() => {
    if (activeTab !== 'calendar') return;
    if (!pendingCenterDate) return;
    if (!timelineRef.current || dates.length === 0) return;

    const idx = dates.findIndex((d) => formatDate(d) === pendingCenterDate);
    if (idx === -1) {
      console.debug('[calendar] pending center date not in range yet', { pendingCenterDate, visibleStartDate, visibleEndDate });
      return;
    }

    requestAnimationFrame(() => {
      const el = timelineRef.current;
      const cell = el?.querySelector(`[data-day-cell][data-date="${pendingCenterDate}"]`);
      const rect = cell?.getBoundingClientRect();
      const width = rect?.width || dayWidthRef.current;
      if (width) dayWidthRef.current = width;
      const offset = cell?.offsetLeft ?? idx * dayWidthRef.current;
      const target = offset - (el.clientWidth - 224) / 2 + dayWidthRef.current / 2;
      console.debug('[calendar] center perform', {
        pendingCenterDate,
        idx,
        target,
        offset,
        dayWidth: dayWidthRef.current,
        scrollLeftBefore: el.scrollLeft,
        clientWidth: el.clientWidth,
        cellFound: !!cell,
      });
      el.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
      setSelectedCalendarDate(pendingCenterDate);
      setPendingCenterDate(null); // clear after first center to avoid repeated snapping while scrolling
      logCalendar('centered date', { date: pendingCenterDate, index: idx, target });
    });
  }, [activeTab, pendingCenterDate, dates, visibleStartDate, visibleEndDate]);

  const calendarBookings = useMemo(() => {
    try {
      return bookingsWithWithholding
        .flatMap((b) => expandBookingToRoomStays(b))
        .map((b) => {
          const normalizedCheckIn = formatDate(b.checkIn);
          const normalizedCheckOut = formatDate(b.checkOut);
          return {
            ...b,
            checkIn: normalizedCheckIn,
            checkOut: normalizedCheckOut,
            _withholding: b._withholding || computeAirbnbWithholding(b),
          };
        })
        .filter((b) => {
          if (isCancelledStatus(b.status)) return false;
          if (!b.roomId) {
            console.warn('[calendar] skipping booking without roomId', { id: b.id });
            return false;
          }
          if (!b.checkIn || !b.checkOut) return false;
          const checkInDate = new Date(b.checkIn);
          const checkOutDate = new Date(b.checkOut);
          const valid = !isNaN(checkInDate) && !isNaN(checkOutDate) && checkOutDate > checkInDate;
          if (!valid) {
            console.warn('[calendar] skipping booking with invalid dates', {
              id: b.id,
              checkIn: b.checkIn,
              checkOut: b.checkOut,
            });
          }
          return valid;
        });
    } catch (err) {
      console.error('[calendar] failed to normalize bookings', err);
      return [];
    }
  }, [bookings]);

  const propertyRoomsMap = useMemo(() => {
    const map = {};
    PROPERTIES.forEach((prop) => {
      map[prop.name] = new Set((prop.rooms || []).map((r) => r.id));
    });
    return map;
  }, []);

  const getBikesCountForDate = useCallback(
    (propertyName, dateStr) => {
      const roomsForProperty = propertyRoomsMap[propertyName];
      if (!roomsForProperty || roomsForProperty.size === 0) return 0;

      return calendarBookings.reduce((sum, booking) => {
        if (!booking || booking.status === 'cancelled') return sum;
        if (!roomsForProperty.has(booking.roomId)) return sum;
        if (!bookingOccupiesDate(booking, dateStr, booking.roomId)) return sum;

        if (!booking.bikeParkingNeeded) return sum;
        const bikes = Number(booking.bikeCount);
        const count = Number.isFinite(bikes) && bikes > 0 ? bikes : 1;
        return sum + count;
      }, 0);
    },
    [calendarBookings, propertyRoomsMap]
  );

  const neighboursBikeCountMap = useMemo(() => {
    const targetProp = 'Neighbours';
    if (!dates.length || !propertyRoomsMap[targetProp]) return {};
    const map = {};
    dates.forEach((date) => {
      const dateStr = formatDate(date);
      map[dateStr] = getBikesCountForDate(targetProp, dateStr);
    });
    return map;
  }, [dates, getBikesCountForDate, propertyRoomsMap]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    logCalendar('data loaded', { bookings: calendarBookings.length, dates: dates.length, visibleRange: { start: formatDate(visibleStartDate), end: formatDate(visibleEndDate) } });
  }, [calendarBookings.length, dates.length, activeTab, logCalendar, visibleStartDate, visibleEndDate]);

  const openRoomNightExportModal = useCallback(() => {
    const focusDate = selectedCalendarDate || formatDate(visibleStartDate) || TODAY_STR;
    const defaultMonth = (focusDate || TODAY_STR).slice(0, 7);
    const { startDate, endDate } = getMonthBounds(defaultMonth);
    setRoomNightExportMode('month');
    setRoomNightExportMonth(defaultMonth);
    setRoomNightExportStart(startDate || TODAY_STR);
    setRoomNightExportEnd(endDate || TODAY_STR);
    setIsRoomNightExportModalOpen(true);
  }, [selectedCalendarDate, visibleStartDate, TODAY_STR]);

  const getExportNightValueForBooking = useCallback((booking, dateStr) => {
    if (!booking || !dateStr) return null;
    if (getBookingStayCategory(booking) === 'long') {
      return calculateLongTermRentForRange(booking, dateStr, addDays(dateStr, 1)) || null;
    }

    const financialDates = getBookingFinancialDateKeys(booking);
    const financialIndex = financialDates.indexOf(dateStr);
    if (financialIndex === -1 || financialDates.length === 0) return null;

    const total = Math.round(getDisplayPriceForBooking(booking));
    const baseNightValue = Math.floor(total / financialDates.length);
    const remainder = total - (baseNightValue * financialDates.length);
    return baseNightValue + (financialIndex < remainder ? 1 : 0);
  }, [getBookingStayCategory]);

  const handleExportRoomNights = useCallback(() => {
    const resolvedRange = roomNightExportMode === 'month'
      ? getMonthBounds(roomNightExportMonth)
      : { startDate: roomNightExportStart, endDate: roomNightExportEnd };

    const { startDate, endDate } = resolvedRange;
    if (!startDate || !endDate || endDate < startDate) {
      pushAlert({ title: 'Export failed', message: 'Choose a valid month or date range.', tone: 'error' });
      return;
    }

    const dayKeys = getDateRangeDays(startDate, endDate);
    if (!dayKeys.length) {
      pushAlert({ title: 'Export failed', message: 'No days found in the selected range.', tone: 'error' });
      return;
    }

    const bookingsById = new Map(bookingsWithWithholding.map((booking) => [booking.id, booking]));
    const occupiedRoomDateKeys = new Set();
    const financialBookingsByRoomDate = new Map();

    calendarBookings.forEach((segment) => {
      if (!segment?.roomId || isCancelledStatus(segment.status)) return;
      const sourceBooking = bookingsById.get(segment.sourceBookingId || segment.id) || segment;
      getBookingOccupiedDates(sourceBooking, segment.roomId).forEach((dateStr) => {
        if (dateStr < startDate || dateStr > endDate) return;
        occupiedRoomDateKeys.add(`${segment.roomId}|${dateStr}`);
      });
    });

    bookingsWithWithholding.forEach((booking) => {
      if (!booking?.roomId || isCancelledStatus(booking.status)) return;
      getBookingStaySegments(booking, { mode: 'financial' }).forEach((segment) => {
        if (!segment?.roomId || !segment.startDate || !segment.endDate) return;
        for (let ts = new Date(segment.startDate).getTime(); ts < new Date(segment.endDate).getTime(); ts += 86_400_000) {
          const dateStr = formatDate(new Date(ts));
          if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
          const key = `${segment.roomId}|${dateStr}`;
          const existing = financialBookingsByRoomDate.get(key) || [];
          financialBookingsByRoomDate.set(key, [...existing, booking]);
        }
      });
    });

    const sheets = PROPERTIES.map((property) => {
      const roomRows = property.rooms.map((room) => ({
        label: room.name,
        values: dayKeys.map((dateStr) => {
          const bookingsForDate = financialBookingsByRoomDate.get(`${room.id}|${dateStr}`) || [];
          if (!bookingsForDate.length) return null;
          const totalValue = bookingsForDate.reduce((sum, booking) => {
            const nightValue = getExportNightValueForBooking(booking, dateStr);
            return sum + (Number.isFinite(nightValue) ? nightValue : 0);
          }, 0);
          return totalValue || null;
        }),
      }));

      const occupancy = dayKeys.map((dateStr) => {
        const occupiedCount = property.rooms.reduce((sum, room) => (
          occupiedRoomDateKeys.has(`${room.id}|${dateStr}`) ? sum + 1 : sum
        ), 0);
        const ratio = property.rooms.length > 0 ? Math.round((occupiedCount / property.rooms.length) * 100) : 0;
        return `${ratio}%`;
      });

      return {
        name: property.name,
        title: `${property.name} - ${formatExportRangeLabel(startDate, endDate)}`,
        days: dayKeys,
        rows: roomRows,
        occupancy,
      };
    });

    const workbookXml = buildRoomNightWorkbookXml({ sheets });
    const fileToken = roomNightExportMode === 'month' && roomNightExportMonth
      ? roomNightExportMonth
      : `${startDate}_to_${endDate}`;
    const filename = `room-nights-${fileToken}.xls`;
    const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);

    setIsRoomNightExportModalOpen(false);
    pushAlert({
      title: 'Export ready',
      message: `Downloaded ${filename} with ${dayKeys.length} day${dayKeys.length === 1 ? '' : 's'}.`,
      tone: 'success',
    });
  }, [
    bookingsWithWithholding,
    calendarBookings,
    getExportNightValueForBooking,
    pushAlert,
    roomNightExportEnd,
    roomNightExportMode,
    roomNightExportMonth,
    roomNightExportStart,
  ]);

  // --- Memoized Data for Dashboard and Housekeeping ---

  const bookingsForDate = useMemo(() => {
    const dateStr = housekeepingDate || '';
    if (!dateStr) return [];
    return (bookings || []).flatMap((booking) => expandBookingToRoomStays(booking)).filter((b) => {
      if (!b || b.status === 'cancelled') return false;
      const checkIn = formatDate(b.checkIn);
      const checkOut = formatDate(b.checkOut);
      return checkIn && checkOut && checkIn <= dateStr && checkOut >= dateStr;
    });
  }, [bookings, housekeepingDate]);

  const checkoutsForDate = useMemo(
    () => (bookings || []).flatMap((booking) => expandBookingToRoomStays(booking)).filter((b) => isHousekeepingBooking(b) && formatDate(b.checkOut) === housekeepingDate),
    [bookings, housekeepingDate]
  );

  const checkinsForDate = useMemo(
    () => (bookings || []).flatMap((booking) => expandBookingToRoomStays(booking)).filter((b) => isHousekeepingBooking(b) && formatDate(b.checkIn) === housekeepingDate),
    [bookings, housekeepingDate]
  );

  const roomsNeedingCleaning = useMemo(() => {
    const checkoutRoomIds = new Set(checkoutsForDate.map((b) => b.roomId));
    return ALL_ROOMS.filter((room) => checkoutRoomIds.has(room.id));
  }, [checkoutsForDate]);

  const bookingHousekeepingTasks = useMemo(
    () =>
      normalizeHousekeepingTasks({
        bookings: (bookings || []).filter(isHousekeepingBooking).flatMap((booking) => expandBookingToRoomStays(booking)),
        rooms: ALL_ROOMS,
        targetDate: housekeepingDate,
        overrides: housekeepingOverrides,
      }),
    [bookings, housekeepingDate, housekeepingOverrides]
  );

  const recurringHousekeepingDueTasks = useMemo(() => {
    if (!housekeepingDate) return [];
    return (recurringCleaningTasks || [])
      .filter((task) => task?.roomId && task?.nextDue && task.nextDue <= housekeepingDate)
      .map((task) => {
        const room = ALL_ROOMS.find((r) => r.id === task.roomId);
        const dueKey = formatDate(task.nextDue);
        const occurrenceId = `hk_rec_${task.id}_${dueKey}`;
        const override = housekeepingOverrides[occurrenceId] || {};
        return {
          id: occurrenceId,
          recurringTemplateId: task.id,
          recurringDueDateKey: dueKey,
          roomId: task.roomId,
          roomLabel: room?.name || task.roomId,
          propertyName: room?.propertyName || 'Unknown property',
          type: 'recurring',
          description: task.description || 'Recurring cleaning task',
          dueDate: dueKey,
          status: override.status || 'dirty',
          priority: override.priority ?? task.priority ?? 2,
          assignedTo: override.assignedTo ?? task.assignedTo ?? 'Unassigned',
        };
      });
  }, [recurringCleaningTasks, housekeepingDate, housekeepingOverrides]);

  const recurringDueByRoomId = useMemo(() => {
    const map = {};
    recurringHousekeepingDueTasks.forEach((task) => {
      if (!task?.roomId) return;
      if (!map[task.roomId]) map[task.roomId] = [];
      map[task.roomId].push(task);
    });
    Object.keys(map).forEach((roomId) => {
      map[roomId] = map[roomId].sort((a, b) => {
        const pa = Number(a.priority) || 99;
        const pb = Number(b.priority) || 99;
        if (pa !== pb) return pa - pb;
        return (a.description || '').localeCompare(b.description || '');
      });
    });
    return map;
  }, [recurringHousekeepingDueTasks]);

  const housekeepingTasks = useMemo(
    () => bookingHousekeepingTasks,
    [bookingHousekeepingTasks]
  );

  const cleaningTasks = useMemo(
    () => buildCleaningTasksForDate(TODAY_STR, bookings, roomStatuses),
    [bookings, roomStatuses, TODAY_STR]
  );

  const cleaningTasksTomorrow = useMemo(
    () => buildCleaningTasksForDate(TOMORROW_STR, bookings, roomStatuses),
    [bookings, roomStatuses, TOMORROW_STR]
  );

  const recurringCompletionMap = useMemo(() => {
    const map = {};
    maintenanceIssues.forEach((issue) => {
      if (!issue.templateId) return;
      if (!isResolvedStatus(issue.status)) return;
      const completedAt = issue.resolvedAt || issue.updatedAt || issue.reportedAt;
      if (!completedAt) return;
      const ts = new Date(completedAt).getTime();
      if (!map[issue.templateId] || ts > new Date(map[issue.templateId]).getTime()) {
        map[issue.templateId] = completedAt;
      }
    });
    return map;
  }, [maintenanceIssues]);

  const groupedRecurringTasks = useMemo(() => {
    const today = new Date(TODAY_STR);
    const groups = {};

    recurringTasks.forEach((task) => {
      const key = buildRecurringGroupKey(task);
      const location = ALL_LOCATIONS.find((l) => l.id === task.locationId);
      const nextDue = task.nextDue || '';

      const statusMeta = (() => {
        const dueDate = new Date(nextDue);
        if (!nextDue || isNaN(dueDate.getTime())) {
          return { status: 'unknown', label: 'No date', color: 'bg-slate-100 text-slate-600 border-slate-200' };
        }
        const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { status: 'overdue', label: `Overdue by ${Math.abs(diffDays)}d`, color: 'bg-red-50 text-red-700 border-red-200' };
        if (diffDays <= DUE_SOON_DAYS) return { status: 'soon', label: `Due in ${diffDays}d`, color: 'bg-amber-50 text-amber-800 border-amber-200' };
        return { status: 'ok', label: `Due in ${diffDays}d`, color: 'bg-green-50 text-green-700 border-green-200' };
      })();

      if (!groups[key]) {
        groups[key] = {
          key,
          description: task.description || 'Untitled task',
          frequency: task.frequency || 'monthly',
          tasks: [],
        };
      }

      groups[key].tasks.push({
        ...task,
        locationName: location?.name || 'Unknown',
        propertyName: location?.propertyName || 'Unknown property',
        statusMeta,
        lastDone: recurringCompletionMap[task.id] || task.lastCompleted || null,
        nextDue,
      });
    });

    return Object.values(groups)
      .map((group) => {
        const nextDue = group.tasks.reduce((prev, cur) => {
          if (!cur.nextDue) return prev;
          if (!prev) return cur.nextDue;
          return new Date(cur.nextDue) < new Date(prev) ? cur.nextDue : prev;
        }, null);
        const overdueCount = group.tasks.filter((t) => t.statusMeta.status === 'overdue').length;
        const dueSoonCount = group.tasks.filter((t) => t.statusMeta.status === 'soon').length;
        return { ...group, nextDue, overdueCount, dueSoonCount, roomCount: group.tasks.length };
      })
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [recurringTasks, recurringCompletionMap, TODAY_STR]);

  const {
    high: tomorrowHighPriorityRooms,
    normal: tomorrowNormalPriorityRooms,
    low: tomorrowLowPriorityRooms,
  } = useMemo(
    () => splitCleaningByPriority(cleaningTasksTomorrow),
    [cleaningTasksTomorrow]
  );

  const checkCalendarBlockConflict = useCallback((blockDraft, excludeBlockId = null) => {
    const normalized = normalizeCalendarBlock(blockDraft);
    if (!normalized.roomId || !normalized.startDate || !normalized.endDate) {
      return { conflict: true, reason: 'Room and dates are required.' };
    }
    if (normalized.startDate >= normalized.endDate) {
      return { conflict: true, reason: 'End date must be after start date.' };
    }

    const existingBooking = bookings.find((booking) => {
      if (!booking?.id || isCancelledStatus(booking.status)) return false;
      if (!doDateRangesOverlap(normalized.startDate, normalized.endDate, booking.checkIn, getBookingOccupancyCheckOut(booking) || booking.checkOut)) return false;
      return getBookingOccupiedDates(booking, normalized.roomId).some((dateStr) => dateStr >= normalized.startDate && dateStr < normalized.endDate);
    });

    if (existingBooking) {
      return {
        conflict: true,
        reason: `Room is already booked by ${existingBooking.guestName} from ${existingBooking.checkIn} to ${getBookingOccupancyCheckOut(existingBooking) || existingBooking.checkOut}.`,
      };
    }

    const existingBlock = calendarBlocks.find((block) => {
      if (!block?.id || block.id === excludeBlockId) return false;
      if (block.roomId !== normalized.roomId) return false;
      return doDateRangesOverlap(normalized.startDate, normalized.endDate, block.startDate, block.endDate);
    });

    if (existingBlock) {
      return {
        conflict: true,
        reason: `Room already has a PMS block (${getCalendarBlockLabel(existingBlock)}) from ${existingBlock.startDate} to ${addDays(existingBlock.endDate, -1)}.`,
      };
    }

    return { conflict: false };
  }, [bookings, calendarBlocks]);

  const checkBookingConflict = useCallback((newBookingData, excludeBookingId = null) => {
    // Treat check-in as inclusive and check-out as exclusive to allow true back-to-back stays.
    const newCheckIn = new Date(newBookingData.checkIn).getTime();
    const newCheckOut = new Date(newBookingData.checkOut).getTime();
    const newRoomId = newBookingData.roomId;

    if (newCheckIn >= newCheckOut) {
      return { conflict: true, reason: "Check-out date must be strictly after the Check-in date." };
    }

    const newRoomStays = getBookingRoomStays(newBookingData);
    const stayBeforePropertyOpening = newRoomStays.find((stay) => !isRoomOpenOnDate(stay.roomId, stay.startDate));
    if (stayBeforePropertyOpening) {
      const property = getPropertyForRoom(stayBeforePropertyOpening.roomId);
      return {
        conflict: true,
        reason: `${property?.name || 'This property'} opens on ${property?.openingDate}. Choose a check-in date on or after opening day.`,
      };
    }
    const conflictingBooking = bookings.find((existingBooking) => {
      if (existingBooking.id === excludeBookingId) return false;
      if (!isBlockingStatus(existingBooking.status)) return false;

      return newRoomStays.some((newStay) => (
        bookingsOverlapConsideringBreaks(existingBooking, {
          ...newBookingData,
          roomId: newStay.roomId,
          checkIn: newStay.startDate,
          checkOut: newStay.endDate,
        }, newStay.roomId)
      ));
    });

    if (conflictingBooking) {
      console.warn('[booking-conflict]', {
        newBooking: {
          roomId: newRoomId,
          checkIn: newBookingData.checkIn,
          checkOut: newBookingData.checkOut,
          nights: newBookingData.nights ?? calculateNights(newBookingData.checkIn, newBookingData.checkOut),
        },
        conflicting: {
          id: conflictingBooking.id,
          roomId: conflictingBooking.roomId,
          checkIn: conflictingBooking.checkIn,
          checkOut: conflictingBooking.checkOut,
        },
        overlapCheck: {
          newCheckIn,
          newCheckOut,
          existingCheckIn: new Date(conflictingBooking.checkIn).getTime(),
          existingCheckOut: new Date(conflictingBooking.checkOut).getTime(),
          formula: 'bookingsOverlapConsideringBreaks(existingBooking, newBookingData)',
        },
      });
      return {
        conflict: true,
        reason: `Room is booked by ${conflictingBooking.guestName} from ${conflictingBooking.checkIn} to ${getBookingOccupancyCheckOut(conflictingBooking) || conflictingBooking.checkOut}.`,
        conflictingBooking
      };
    }

    const conflictingBlock = calendarBlocks.find((block) => {
      if (!block?.id) return false;
      return newRoomStays.some((stay) => (
        block.roomId === stay.roomId &&
        doDateRangesOverlap(stay.startDate, stay.endDate, block.startDate, block.endDate)
      ));
    });

    if (conflictingBlock) {
      return {
        conflict: true,
        reason: `Room has a PMS block (${getCalendarBlockLabel(conflictingBlock)}) from ${conflictingBlock.startDate} to ${addDays(conflictingBlock.endDate, -1)}.`,
        conflictingBlock,
      };
    }

    return { conflict: false };
  }, [bookings, calendarBlocks]);

  const planRoomTransfer = (inventory, transfer) => buildRoomTransferPlan(inventory, transfer, {
    roomAtDate: getBookingRoomIdForDate,
    occupiedDates: getBookingOccupiedDates,
    isBlocking: isBlockingStatus,
  });

  const validateRoomTransfer = (inventory, blocks, plan) => {
    const updatedById = new Map(plan.map((entry) => [entry.after.id, entry.after]));
    const finalInventory = inventory.map((booking) => updatedById.get(booking.id) || booking);
    for (const { after } of plan) {
      for (const stay of getBookingRoomStays(after)) {
        if (!ALL_ROOMS.some((room) => room.id === stay.roomId) || !isRoomOpenOnDate(stay.roomId, stay.startDate)) throw new Error('A destination room is closed during this stay.');
      }
      for (const date of getBookingOccupiedDates(after)) {
        const roomId = getBookingRoomIdForDate(after, date);
        const conflict = finalInventory.find((other) => other.id !== after.id && isBlockingStatus(other.status) && bookingOccupiesDate(other, date, roomId));
        if (conflict) throw new Error(`Cannot move ${after.guestName}: room is occupied by ${conflict.guestName} on ${date}.`);
        if (blocks.some((block) => calendarBlockOccupiesDate(block, date, roomId))) throw new Error(`Cannot move ${after.guestName}: room has a PMS block on ${date}.`);
      }
    }
  };

  const prepareRoomTransfer = (roomId, payload) => {
    if (!payload || savingBookingId || roomTransferSaving.current || payload.fromRoomId === roomId) return;
    try {
      const source = bookings.find((booking) => booking.id === payload.bookingId);
      const stay = source && getBookingSegmentForDate(source, payload.date);
      if (!stay || stay.roomId !== payload.fromRoomId) throw new Error('This booking changed. Please drag it again.');
      const transfer = { bookingId: source.id, fromRoomId: stay.roomId, toRoomId: roomId, startDate: stay.startDate, endDate: stay.endDate };
      const plan = planRoomTransfer(bookings, transfer);
      validateRoomTransfer(bookings, calendarBlocks, plan);
      setRoomTransferError('');
      setRoomTransfer({ ...transfer, plan });
    } catch (error) {
      pushAlert({ title: 'Room move unavailable', message: error.message, tone: 'error' });
    }
  };

  const confirmRoomTransfer = async () => {
    if (!roomTransfer || roomTransferSaving.current) return;
    roomTransferSaving.current = true;
    setSavingBookingId(roomTransfer.bookingId);
    setRoomTransferError('');
    try {
      const [bookingSnapshot, blockSnapshot] = await Promise.all([getDocs(collection(db, 'bookings')), getDocs(collection(db, 'calendarBlocks'))]);
      const updated = await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all([...bookingSnapshot.docs, ...blockSnapshot.docs].map((entry) => transaction.get(entry.ref)));
        const inventory = snapshots.slice(0, bookingSnapshot.size).filter((entry) => entry.exists()).map((entry) => ({ ...entry.data(), id: entry.id }));
        const blocks = snapshots.slice(bookingSnapshot.size).filter((entry) => entry.exists()).map((entry) => ({ ...entry.data(), id: entry.id }));
        const plan = planRoomTransfer(inventory, roomTransfer);
        const stable = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
        if (stable(plan) !== stable(roomTransfer.plan)) throw new Error('Bookings changed since this preview. Cancel and drag again to review the updated moves.');
        validateRoomTransfer(inventory, blocks, plan);
        const updatedAt = new Date().toISOString();
        return plan.map(({ after }) => {
          const patch = { roomId: after.roomId, roomMoves: after.roomMoves, hasMultipleRoomStay: after.hasMultipleRoomStay, updatedAt };
          transaction.update(doc(db, 'bookings', after.id), patch);
          return { ...after, ...patch };
        });
      });
      setBookings((prev) => prev.map((booking) => updated.find((entry) => entry.id === booking.id) || booking));
      setRoomTransfer(null);
      pushAlert({ title: 'Rooms updated', message: `${updated.length} booking${updated.length === 1 ? '' : 's'} moved successfully.`, tone: 'success' });
    } catch (error) {
      setRoomTransferError(error.message || 'Could not move rooms. Please try again.');
    } finally {
      roomTransferSaving.current = false;
      setSavingBookingId(null);
    }
  };

  const handleSaveCalendarBlock = useCallback(async (blockData) => {
    const normalized = normalizeCalendarBlock(blockData);
    const conflictResult = checkCalendarBlockConflict(normalized, normalized.id || null);
    if (conflictResult.conflict) {
      throw new Error(conflictResult.reason);
    }

    const nowIso = new Date().toISOString();
    const targetId = normalized.id || randomId();
    const payload = {
      id: targetId,
      roomId: normalized.roomId,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      blockType: normalized.blockType || 'long_term_priority',
      title: normalized.title || '',
      notes: normalized.notes || '',
      createdAt: normalized.createdAt || nowIso,
      updatedAt: nowIso,
      createdBy: normalized.createdBy || user?.email || user?.uid || 'system',
    };

    setIsSavingCalendarBlock(true);
    try {
      await setDoc(doc(db, 'calendarBlocks', targetId), payload, { merge: true });
      setEditingCalendarBlock(null);
      setIsCalendarBlockModalOpen(false);
      setCalendarCreateMode('booking');
      pushAlert({
        title: normalized.id ? 'PMS block updated' : 'PMS block created',
        message: `${getCalendarBlockLabel(payload)} · ${payload.startDate} to ${addDays(payload.endDate, -1)}`,
        tone: 'success',
      });
    } finally {
      setIsSavingCalendarBlock(false);
    }
  }, [checkCalendarBlockConflict, db, pushAlert, user]);

  const handleDeleteCalendarBlock = useCallback(async (block) => {
    if (!block?.id) return;
    if (!confirm(`Delete PMS block "${getCalendarBlockLabel(block)}"?`)) return;
    setIsSavingCalendarBlock(true);
    try {
      await deleteDoc(doc(db, 'calendarBlocks', block.id));
      setEditingCalendarBlock(null);
      setIsCalendarBlockModalOpen(false);
      setCalendarCreateMode('booking');
      pushAlert({ title: 'PMS block deleted', message: getCalendarBlockLabel(block), tone: 'success' });
    } catch (error) {
      console.error('Error deleting calendar block:', error);
      pushAlert({ title: 'Delete failed', message: error?.message || 'Unable to delete PMS block', code: error?.code, raw: error });
    } finally {
      setIsSavingCalendarBlock(false);
    }
  }, [db, pushAlert]);

  const lookupReturningGuest = useCallback(async ({ guestEmail, guestPhone, guestName, checkIn }) => {
    try {
      const result = await previewReturningGuest({
        db,
        guestEmail,
        guestPhone,
        guestName,
        checkIn,
        allowNameMatch: false,
      });
      return result;
    } catch (err) {
      console.error('[returning-guest] lookup failed', err);
      throw err;
    }
  }, []);

  // Auto-create recurring maintenance tasks when due
  useEffect(() => {
    const today = formatDate(new Date());

    const ensureRecurringIssues = async () => {
      for (const task of recurringTasks) {
        const dueDateStr = formatDate(task.nextDue);
        if (!dueDateStr) continue;
        if (dueDateStr > today) continue; // only create when due or overdue

        const processKey = `${task.id}|${dueDateStr}`;
        if (processedRecurringRef.current.has(processKey)) continue;

        const hasExisting = maintenanceIssues.some(
          (i) =>
            (i.templateId === task.id || i.recurringTaskId === task.id) &&
            (i.recurringDueDateKey === dueDateStr || i.dueDate === dueDateStr)
        );
        if (hasExisting) {
          processedRecurringRef.current.add(processKey);
          continue;
        }

        processedRecurringRef.current.add(processKey);

        const locationInfo = ALL_LOCATIONS.find((loc) => loc.id === task.locationId);
        if (!locationInfo) {
          console.warn('[recurring] skipped task with unknown location', task);
          processedRecurringRef.current.delete(processKey);
          continue;
        }

        const issueId = `${task.id}_${dueDateStr}_${task.locationId}`.replace(/\//g, '_');
        const newIssue = {
          id: issueId,
          locationId: task.locationId,
          locationName: locationInfo?.name,
          propertyName: locationInfo?.propertyName,
          description: task.description,
          status: 'open',
          assignedStaff: 'Unassigned',
          reportedAt: new Date().toISOString(),
          templateId: task.id,
          recurringTaskId: task.id,
          recurringDueDateKey: dueDateStr,
          isRecurring: true,
          dueDate: dueDateStr,
        };

        try {
          await setDoc(doc(db, 'maintenance', issueId), newIssue);
          const nextDue = getNextRecurringDueDate(dueDateStr, task.frequency);
          await setDoc(doc(db, 'recurringTasks', task.id), { nextDue }, { merge: true });
          console.log(`Created recurring maintenance issue from task ${task.id}`);
        } catch (err) {
          console.error('Recurring task generation error:', err);
          processedRecurringRef.current.delete(processKey);
        }
      }
    };

    ensureRecurringIssues();
  }, [recurringTasks, maintenanceIssues]);

  // --- Local State Update Actions ---

  const updateHousekeepingField = async (roomId, field, value, actingUser = user) => {
    try {
      let nextStatus = null;

      setRoomStatuses((prev) => {
        const existing = prev[roomId] || {};
        nextStatus = {
          ...existing,
          [field]: value,
          updatedAt: new Date().toISOString(),
        };

        return {
          ...prev,
          [roomId]: nextStatus,
        };
      });

      if (nextStatus) {
        await setDoc(doc(db, 'roomStatuses', roomId), nextStatus, { merge: true });
      }
    } catch (error) {
      console.error('Error updating room status:', error);
    }
  };

  const markRoomClean = async (roomId, actingUser = user) => {
    try {
      const cleanStatus = {
        status: 'clean',
        assignedStaff: 'Unassigned',
        priority: 3,
        updatedAt: new Date().toISOString(),
      };

      setRoomStatuses((prev) => ({
        ...prev,
        [roomId]: cleanStatus,
      }));

      await setDoc(doc(db, 'roomStatuses', roomId), cleanStatus, { merge: true });
    } catch (error) {
      console.error('Error marking room clean:', error);
    }
  };

  const findNextRoomCleaningDate = useCallback((roomId, afterDateStr) => {
    if (!roomId || !afterDateStr) return '';
    const start = new Date(afterDateStr);
    if (isNaN(start.getTime())) return '';
    for (let dayOffset = 1; dayOffset <= 120; dayOffset += 1) {
      const candidate = new Date(start);
      candidate.setDate(candidate.getDate() + dayOffset);
      const candidateStr = formatDate(candidate);
      const tasksForCandidate = buildCleaningTasksForDate(candidateStr, bookings, roomStatuses);
      if (tasksForCandidate.some((t) => t.roomId === roomId)) {
        return candidateStr;
      }
    }
    return '';
  }, [bookings, roomStatuses]);

  const handleHousekeepingTaskUpdate = useCallback(async (taskId, patch, taskMeta = null, actingUser = user) => {
    if (!taskId || !patch) return;
    const nowIso = new Date().toISOString();
    const resolvedTask = taskMeta || housekeepingTasks.find((t) => t.id === taskId) || null;
    const payload = {
      ...patch,
      updatedAt: nowIso,
      updatedBy: actingUser?.uid || actingUser?.email || 'unknown',
    };

    setHousekeepingOverrides((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev?.[taskId] || {}),
        ...payload,
      },
    }));

    try {
      await setDoc(doc(db, 'housekeepingOverrides', taskId), payload, { merge: true });

      // Keep recurring cleaning template settings in sync with daily ordering/assignment.
      const recurringTemplateId = resolvedTask?.recurringTemplateId;
      if (recurringTemplateId) {
        const template = recurringCleaningTasks.find((t) => t.id === recurringTemplateId);
        if (template) {
          if (patch.priority != null || patch.assignedTo != null) {
            await setDoc(
              doc(db, 'recurringCleaningTasks', recurringTemplateId),
              {
                ...(patch.priority != null ? { priority: Number(patch.priority) || 1 } : {}),
                ...(patch.assignedTo != null ? { assignedTo: patch.assignedTo || 'Unassigned' } : {}),
                updatedAt: nowIso,
                updatedBy: actingUser?.uid || actingUser?.email || 'unknown',
              },
              { merge: true }
            );
          }

          if (patch.status === 'clean') {
            const dueKey = formatDate(resolvedTask?.recurringDueDateKey || template.nextDue || nowIso);
            const nextDue = getNextRecurringDueDate(dueKey, template.frequency || 'weekly');
            const currentNextDue = formatDate(template.nextDue);
            if (!currentNextDue || new Date(nextDue).getTime() > new Date(currentNextDue).getTime()) {
              await setDoc(
                doc(db, 'recurringCleaningTasks', recurringTemplateId),
                { nextDue, lastCompleted: nowIso, updatedAt: nowIso, updatedBy: actingUser?.uid || actingUser?.email || 'unknown' },
                { merge: true }
              );
            }
          }
        }
      }

      // If today's room clean is completed and recurring room todos were not checked, defer them to next cleaning day.
      const cleanedNonRecurringTask = patch.status === 'clean' && !resolvedTask?.recurringTemplateId && resolvedTask?.roomId;
      if (cleanedNonRecurringTask) {
        const dueRoomTodos = (recurringDueByRoomId[resolvedTask.roomId] || []).filter((t) => t?.recurringTemplateId);
        if (dueRoomTodos.length) {
          const baselineDate = formatDate(housekeepingDate || nowIso);
          const nextRoomCleaningDate = findNextRoomCleaningDate(resolvedTask.roomId, baselineDate);
          for (const dueTodo of dueRoomTodos) {
            const template = recurringCleaningTasks.find((t) => t.id === dueTodo.recurringTemplateId);
            if (!template) continue;
            const fallbackNext = getNextRecurringDueDate(baselineDate, template.frequency || 'weekly');
            const nextDue = nextRoomCleaningDate || fallbackNext;
            await setDoc(
              doc(db, 'recurringCleaningTasks', template.id),
              {
                nextDue,
                updatedAt: nowIso,
                updatedBy: actingUser?.uid || actingUser?.email || 'unknown',
              },
              { merge: true }
            );
          }
        }
      }
    } catch (error) {
      console.error('Error updating housekeeping override:', { taskId, patch, error });
      pushAlert({ title: 'Housekeeping update failed', message: error?.message || 'Could not save housekeeping status', code: error?.code, raw: error });
    }
  }, [user, pushAlert, housekeepingTasks, recurringCleaningTasks, recurringDueByRoomId, housekeepingDate, findNextRoomCleaningDate]);

  const handleChangeWeeklyCleaningDay = useCallback(async (sourceBookingId, newDayKey) => {
    if (!sourceBookingId || !newDayKey) return;
    const booking = bookings.find((b) => b.id === sourceBookingId);
    if (!booking) return;
    const result = await upsertBooking({ db, data: { weeklyCleaningDay: newDayKey }, existingId: sourceBookingId });
    if (!result.ok) {
      pushAlert({ title: 'Reschedule failed', message: result.message || 'Could not update cleaning day', code: result.code, tone: 'error' });
    } else {
      pushAlert({ title: 'Cleaning day updated', message: `${booking.guestName || 'Guest'} · weekly clean moved to ${newDayKey}`, tone: 'success' });
    }
  }, [bookings, db, pushAlert]);

  const expandedHousekeepingBookings = useMemo(
    () => (bookings || []).filter(isHousekeepingBooking).flatMap((b) => expandBookingToRoomStays(b)),
    [bookings]
  );

  const handleCompleteRecurringRoomTodo = useCallback(async (todoTask, actingUser = user) => {
    if (!todoTask?.recurringTemplateId) return;
    const template = recurringCleaningTasks.find((t) => t.id === todoTask.recurringTemplateId);
    if (!template) return;
    const nowIso = new Date().toISOString();
    const nextDue = getNextRecurringDueDate(formatDate(housekeepingDate || nowIso), template.frequency || 'weekly');
    try {
      await setDoc(
        doc(db, 'recurringCleaningTasks', template.id),
        {
          nextDue,
          lastCompleted: nowIso,
          updatedAt: nowIso,
          updatedBy: actingUser?.uid || actingUser?.email || 'unknown',
        },
        { merge: true }
      );
      pushAlert({ title: 'Recurring todo completed', message: `${template.roomName || template.roomId} · ${template.description}`, tone: 'success' });
    } catch (error) {
      console.error('Error completing recurring room todo:', error);
      pushAlert({ title: 'Recurring update failed', message: error?.message || 'Could not complete recurring todo', code: error?.code, raw: error });
    }
  }, [recurringCleaningTasks, housekeepingDate, user, pushAlert]);

  const handleSkipRecurringRoomTodo = useCallback(async (todoTask, actingUser = user) => {
    if (!todoTask?.recurringTemplateId) return;
    const template = recurringCleaningTasks.find((t) => t.id === todoTask.recurringTemplateId);
    if (!template) return;
    const nowIso = new Date().toISOString();
    const roomId = template.roomId;
    const baselineDate = formatDate(housekeepingDate || nowIso);
    const nextRoomCleaningDate = findNextRoomCleaningDate(roomId, baselineDate);
    const fallbackNext = getNextRecurringDueDate(baselineDate, template.frequency || 'weekly');
    const nextDue = nextRoomCleaningDate || fallbackNext;
    try {
      await setDoc(
        doc(db, 'recurringCleaningTasks', template.id),
        {
          nextDue,
          updatedAt: nowIso,
          updatedBy: actingUser?.uid || actingUser?.email || 'unknown',
        },
        { merge: true }
      );
      pushAlert({ title: 'Deferred to next cleaning', message: `${template.roomName || template.roomId} · ${nextDue}`, tone: 'success' });
    } catch (error) {
      console.error('Error deferring recurring room todo:', error);
      pushAlert({ title: 'Recurring update failed', message: error?.message || 'Could not defer recurring todo', code: error?.code, raw: error });
    }
  }, [recurringCleaningTasks, housekeepingDate, findNextRoomCleaningDate, user, pushAlert]);

  const handleCreateRecurringCleaningTask = async (actingUser = user) => {
    const selectedRoomIds = Array.from(new Set(recurringCleaningDraft.selectedRoomIds || []));
    const description = (recurringCleaningDraft.description || '').trim();
    const frequency = recurringCleaningDraft.frequency || 'weekly';
    const nextDue = formatDate(recurringCleaningDraft.nextDue || '');
    const priority = Math.max(1, Number(recurringCleaningDraft.priority) || 2);
    const assignedTo = recurringCleaningDraft.assignedTo || 'Unassigned';

    if (!selectedRoomIds.length || !description || !nextDue) {
      pushAlert({ title: 'Recurring cleaning not saved', message: 'Select at least one room, plus description and next due date.', tone: 'error' });
      return;
    }

    const nowIso = new Date().toISOString();

    try {
      const results = { success: [], failed: [] };

      for (const roomId of selectedRoomIds) {
        const room = ALL_ROOMS.find((r) => r.id === roomId);
        const id = Math.random().toString(36).substr(2, 9);
        const payload = {
          id,
          roomId,
          roomName: room?.name || roomId,
          propertyName: room?.propertyName || 'Unknown property',
          description,
          frequency,
          nextDue,
          priority,
          assignedTo,
          createdAt: nowIso,
          createdBy: actingUser?.uid || actingUser?.email || 'unknown',
        };

        try {
          await setDoc(doc(db, 'recurringCleaningTasks', id), payload);
          results.success.push(payload.roomName);
        } catch (err) {
          console.error('[recurring-cleaning] failed room', roomId, err);
          results.failed.push(roomId);
        }
      }

      setRecurringCleaningDraft((prev) => ({
        ...prev,
        description: '',
        nextDue: formatDate(new Date()),
      }));

      if (results.failed.length) {
        pushAlert({
          title: 'Partial recurring save',
          message: `Created ${results.success.length}/${selectedRoomIds.length}. Failed: ${results.failed.join(', ')}`,
          tone: 'error',
        });
      } else {
        pushAlert({
          title: 'Recurring cleaning added',
          message: `Created for ${results.success.length} room${results.success.length === 1 ? '' : 's'}`,
          tone: 'success',
        });
      }
    } catch (error) {
      console.error('Error saving recurring cleaning task:', error);
      pushAlert({ title: 'Recurring cleaning save failed', message: error?.message || 'Please try again', code: error?.code, raw: error });
    }
  };

  const handleDeleteRecurringCleaningTask = async (id) => {
    if (!id) return;
    if (!confirm('Delete this recurring cleaning task?')) return;
    try {
      await deleteDoc(doc(db, 'recurringCleaningTasks', id));
      pushAlert({ title: 'Recurring cleaning deleted', tone: 'success' });
    } catch (error) {
      console.error('Error deleting recurring cleaning task:', error);
      pushAlert({ title: 'Delete failed', message: error?.message || 'Unable to delete recurring cleaning task', code: error?.code, raw: error });
    }
  };

  const handleSaveBooking = async (bookingData, actingUser = user) => {
    const targetId = editingBooking?.id || Math.random().toString(36).substr(2, 9);
    setSavingBookingId(targetId);
    try {
      const guestEmailValue = bookingData.guestEmail?.trim?.() || '';
      const guestPhoneValue = bookingData.guestPhone?.trim?.() || '';
      const normalizedChannel = bookingData.channel || 'airbnb';
      const normalizedPrice = Number(bookingData.price) || 0;
      const normalizedGrossPriceInput = Number(bookingData.airbnbBaseEarningsVnd ?? bookingData.grossPrice ?? bookingData.netEarningsFromEmail);
      const hasWithholdingFields =
        bookingData.grossPrice != null ||
        bookingData.commissionWithheld != null ||
        bookingData.vatWithheld != null ||
        bookingData.incomeTaxWithheld != null ||
        bookingData.totalWithheld != null ||
        bookingData.finalCountedIncome != null ||
        bookingData.withholdingStatus != null;

      const normalizedAirbnbBase = normalizedChannel !== 'airbnb'
        ? null
        : (() => {
            if (Number.isFinite(normalizedGrossPriceInput) && normalizedGrossPriceInput > 0) return Math.round(normalizedGrossPriceInput);
            const explicitBase = Number(bookingData.airbnbBaseEarningsVnd);
            if (Number.isFinite(explicitBase) && explicitBase > 0) return explicitBase;
            const emailBase = Number(bookingData.netEarningsFromEmail);
            if (Number.isFinite(emailBase) && emailBase > 0) return emailBase;
            if (Number.isFinite(normalizedPrice) && normalizedPrice > 0) return Math.round(normalizedPrice / AIRBNB_PAYOUT_RATE);
            return hasWithholdingFields ? null : null;
          })();
      const normalizedPaymentStatus = normalizedChannel === 'direct' ? (bookingData.paymentStatus || null) : null;
      const nowIso = new Date().toISOString();
      const normalizedActualCheckoutDate = bookingData.endedEarly ? formatDate(bookingData.actualCheckoutDate || '') : '';
      const endedEarly = !!bookingData.endedEarly && !!normalizedActualCheckoutDate;
      const earlyTerminationReimbursed = endedEarly && !!bookingData.earlyTerminationReimbursed;
      const withholding = computeAirbnbWithholding({
        ...bookingData,
        channel: normalizedChannel,
        grossPrice: normalizedAirbnbBase,
        price: normalizedPrice,
        airbnbBaseEarningsVnd: normalizedAirbnbBase,
      });
      const isLongStayCategory = ['long'].includes(bookingData.stayCategory);
      const monthlyRentVnd = isLongStayCategory && Number.isFinite(Number(bookingData.monthlyRentVnd)) ? Number(bookingData.monthlyRentVnd) : null;
      const hasMultipleRoomStay = !!bookingData.hasMultipleRoomStay || (Array.isArray(bookingData.roomMoves) && bookingData.roomMoves.length > 0);
      const roomMoves = hasMultipleRoomStay
        ? normalizeRoomMoves(bookingData.roomMoves || [], {
            stayStart: bookingData.checkIn,
            stayEnd: bookingData.checkOut,
            fallbackRent: monthlyRentVnd,
          })
        : [];
      const estimatedLongTotal = isLongStayCategory
        ? calculateLongTermRentForRange({
            ...bookingData,
            monthlyRentVnd,
            roomMoves,
            guestBreakPeriods: bookingData.hasGuestBreaks ? bookingData.guestBreakPeriods || [] : [],
            sellRoomDuringBreak: !!bookingData.sellRoomDuringBreak,
            endedEarly,
            actualCheckoutDate: normalizedActualCheckoutDate || null,
            earlyTerminationReimbursed,
          }, bookingData.checkIn, bookingData.checkOut)
        : null;
      const normalizedGuestBreakPeriods = bookingData.hasGuestBreaks
        ? normalizeBookingBreaks(bookingData.guestBreakPeriods || [])
        : [];

      const priceForBooking = (() => {
        if (isLongStayCategory && estimatedLongTotal !== null) return estimatedLongTotal;
        if (normalizedChannel === 'airbnb' && withholding.status === 'computed' && Number.isFinite(withholding.payoutBeforeTax)) {
          return withholding.payoutBeforeTax;
        }
        return normalizedPrice;
      })();
      const normalizedNights = calculateNights(bookingData.checkIn, bookingData.checkOut);

      const guestResolution = await withTimeout(
        resolveGuestForBooking({
          db,
          bookingDraft: {
            ...bookingData,
            guestEmail: guestEmailValue || null,
            guestPhone: guestPhoneValue || null,
            startDate: bookingData.checkIn,
            endDate: bookingData.checkOut,
            channel: normalizedChannel,
          },
        }),
        6000,
        'Guest lookup timed out. Check Firestore/network and retry.'
      );

      const normalizedData = {
        ...bookingData,
        guestEmail: guestEmailValue || null,
        guestPhone: guestPhoneValue || null,
        email: guestEmailValue || null,
        phone: guestPhoneValue || null,
        guestEmailNorm: guestResolution?.normalized?.emailNorm || null,
        guestPhoneNorm: guestResolution?.normalized?.phoneNorm || null,
        startDate: bookingData.checkIn,
        endDate: bookingData.checkOut,
        price: priceForBooking,
        nights: normalizedNights,
        channel: normalizedChannel,
        paymentStatus: normalizedPaymentStatus,
        grossPrice: normalizedAirbnbBase,
        airbnbBaseEarningsVnd: normalizedAirbnbBase,
        netEarningsFromEmail: normalizedAirbnbBase,
        monthlyRentVnd: monthlyRentVnd,
        hasMultipleRoomStay: roomMoves.length > 0,
        roomMoves,
        hasGuestBreaks: !!bookingData.hasGuestBreaks,
        guestBreakPeriods: normalizedGuestBreakPeriods,
        breakPeriods: normalizedGuestBreakPeriods,
        breaks: normalizedGuestBreakPeriods,
        sellRoomDuringBreak: !!bookingData.hasGuestBreaks && !!bookingData.sellRoomDuringBreak,
        endedEarly,
        actualCheckoutDate: normalizedActualCheckoutDate || null,
        earlyTerminationReimbursed,
        commissionWithheld: withholding.commissionWithheld,
        vatWithheld: withholding.vatWithheld,
        incomeTaxWithheld: withholding.incomeTaxWithheld,
        totalWithheld: withholding.totalWithheld,
        finalCountedIncome: withholding.finalCountedIncome,
        withholdingStatus: withholding.status,
        guestId: guestResolution?.guestId || null,
        isReturningGuest: !!guestResolution?.isReturningGuest,
        returningReason: guestResolution?.returningReason || null,
      };

      const payload = editingBooking
        ? {
            ...normalizedData,
            id: editingBooking.id,
            createdAt: editingBooking.createdAt || nowIso,
            updatedAt: nowIso,
          }
        : {
            ...normalizedData,
            id: targetId,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

      const result = await upsertBooking({ db, data: payload, existingId: editingBooking?.id, timeoutMs: 6000 });
      if (!result.ok) {
        pushAlert({ title: 'Save failed', message: result.message, code: result.code, raw: result.raw });
        return;
      }

      const upserted = result.data || payload;
      setBookings((prev) => {
        const existing = prev.find((b) => b.id === upserted.id);
        if (existing) return prev.map((b) => (b.id === upserted.id ? { ...existing, ...upserted } : b));
        return [...prev, upserted];
      });

      const statusCompleted = ['checked-out', 'completed'].includes(upserted.status);
      const wasCompleted = editingBooking ? ['checked-out', 'completed'].includes(editingBooking.status) : false;
      if (statusCompleted && !wasCompleted && upserted.guestId) {
        const statsResult = await updateGuestStatsFromBooking({ db, booking: upserted });
        if (!statsResult.ok) {
          console.warn('[guest-stats]', statsResult.message || 'Failed to update guest stats');
        }
      }

      setIsModalOpen(false);
      setEditingBooking(null);
      pushAlert({ title: 'Booking saved', message: `${upserted.guestName || 'Guest'} updated`, tone: 'success' });
    } catch (error) {
      console.error('Error saving booking:', error);
      pushAlert({ title: 'Save failed', message: error?.message || 'Unknown error', code: error?.code, raw: error });
    } finally {
      setSavingBookingId(null);
    }
  };

  const openBookingDetails = useCallback(
    (bookingId) => {
      if (!bookingId) return;
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) return;
      setEditingBooking(booking);
      setIsModalOpen(true);
    },
    [bookings]
  );

  const updateLongTermOps = useCallback(async (booking, patch, successMessage) => {
    if (!booking?.id) return;
    const nowIso = new Date().toISOString();
    const payload = await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'bookings', booking.id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('This booking no longer exists.');
      const next = {
        longTermOps: { ...(snapshot.data().longTermOps || {}), ...patch, updatedAt: nowIso, updatedBy: user?.uid || 'unknown' },
        updatedAt: nowIso,
        ...(Object.hasOwn(patch, 'cleaningDay') ? { weeklyCleaningDay: patch.cleaningDay } : {}),
      };
      transaction.set(ref, next, { merge: true });
      return next;
    });
    setBookings((prev) => prev.map((entry) => entry.id === booking.id ? { ...entry, ...payload } : entry));
    if (successMessage) pushAlert({ title: 'Guest stay updated', message: successMessage, tone: 'success' });
  }, [db, user, pushAlert]);

  const handleDeleteBooking = async (id) => {
    if (!id) return;
    const action = window.prompt(
      'Type DELETE to permanently remove this booking.\nType CANCEL to mark it as cancelled but keep it in the PMS.\nLeave blank to abort.'
    );
    const normalizedAction = (action || '').trim().toUpperCase();
    if (!normalizedAction) return;

    setSavingBookingId(id);
    try {
      if (normalizedAction === 'DELETE') {
        const financialAccount = await getDoc(doc(db, 'crmAccounts', id));
        if (financialAccount.exists()) {
          pushAlert({ title: 'Keep payment history', message: 'This booking has guest financial records. Use CANCEL to retain its payments, balances and deposits.', tone: 'error' });
          return;
        }
        if (!confirm('Permanently delete this booking from the PMS? This cannot be undone.')) return;

        const result = await removeBooking({ db, id, timeoutMs: 6000 });
        if (!result.ok) {
          pushAlert({ title: 'Delete failed', message: result.message, code: result.code, raw: result.raw });
          return;
        }

        setBookings((prev) => prev.filter((b) => b.id !== id));
        if (editingBooking?.id === id) {
          setEditingBooking(null);
          setIsModalOpen(false);
        }

        pushAlert({ title: 'Booking deleted', message: 'The booking was permanently removed from the PMS.', tone: 'success' });
        return;
      }

      if (normalizedAction === 'CANCEL') {
        const nowIso = new Date().toISOString();
        const payload = { status: 'cancelled', cancelledAt: nowIso, updatedAt: nowIso };
        await setDoc(doc(db, 'bookings', id), payload, { merge: true });

        setBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, ...payload } : b))
        );

        if (editingBooking?.id === id) {
          setEditingBooking(null);
          setIsModalOpen(false);
        }

        pushAlert({ title: 'Booking cancelled', message: 'The booking remains in the list for history.', tone: 'success' });
        return;
      }

      pushAlert({
        title: 'No action taken',
        message: 'Use DELETE to remove permanently or CANCEL to keep it as cancelled.',
        tone: 'error',
      });
    } catch (error) {
      console.error('Error removing booking:', error);
      pushAlert({ title: 'Remove failed', message: error?.message || 'Unknown error', code: error?.code, raw: error });
    } finally {
      setSavingBookingId(null);
    }
  };

  const advanceRecurringTaskForResolvedIssue = async (issue, resolvedAtIso = new Date().toISOString()) => {
    const recurringTaskId = issue?.recurringTaskId || issue?.templateId;
    if (!recurringTaskId) return { attempted: false, advanced: false };

    const recurringTask = recurringTasks.find((task) => task.id === recurringTaskId);
    if (!recurringTask) {
      console.warn('[recurring] linked task not found for resolved issue', { issueId: issue?.id, recurringTaskId });
      return { attempted: false, advanced: false };
    }

    const referenceDue = formatDate(issue?.recurringDueDateKey || issue?.dueDate || recurringTask.nextDue || resolvedAtIso);
    if (!referenceDue) return { attempted: true, advanced: false };

    const nextDue = getNextRecurringDueDate(referenceDue, recurringTask.frequency);
    const currentNextDue = formatDate(recurringTask.nextDue);
    if (currentNextDue) {
      const currentTs = new Date(currentNextDue).getTime();
      const nextTs = new Date(nextDue).getTime();
      if (!Number.isNaN(currentTs) && !Number.isNaN(nextTs) && currentTs >= nextTs) {
        return { attempted: true, advanced: false };
      }
    }

    await setDoc(
      doc(db, 'recurringTasks', recurringTaskId),
      { nextDue, lastCompleted: resolvedAtIso, updatedAt: resolvedAtIso },
      { merge: true }
    );
    return { attempted: true, advanced: true, nextDue };
  };

  const handleSaveMaintenanceIssue = async (issueData, actingUser = user) => {
    try {
      setIsSavingMaintenanceIssue(true);
      const payload = {
        ...issueData,
        assignedStaff: issueData.assignedStaff || 'Needs assignment',
        severity: issueData.severity || 'normal',
      };
      if (editingMaintenanceIssue) {
        const resolvedNow = isResolvedStatus(payload.status) && !isResolvedStatus(editingMaintenanceIssue.status);
        const resolvedAtIso = payload.resolvedAt || new Date().toISOString();
        const updatedIssue = {
          ...payload,
          id: editingMaintenanceIssue.id,
          reportedAt: editingMaintenanceIssue.reportedAt,
          updatedAt: new Date().toISOString(),
          ...(resolvedNow && !payload.resolvedAt ? { resolvedAt: resolvedAtIso } : {}),
        };
        // Save to Firestore - real-time listener will update state
        await setDoc(doc(db, 'maintenance', editingMaintenanceIssue.id), updatedIssue, { merge: true });
        if (resolvedNow) {
          await advanceRecurringTaskForResolvedIssue({ ...editingMaintenanceIssue, ...updatedIssue }, resolvedAtIso);
        }
      } else {
        const newIssue = {
            ...payload,
            id: Math.random().toString(36).substr(2, 9),
            reportedAt: new Date().toISOString()
        };
        // Save to Firestore - real-time listener will update state
        await setDoc(doc(db, 'maintenance', newIssue.id), newIssue);
      }
      setIsMaintenanceModalOpen(false);
      setEditingMaintenanceIssue(null);
      setPendingMaintenancePrefill(null);
      pushAlert({ title: 'Issue reported', message: issueData.locationName ? `Issue logged for ${issueData.locationName}` : 'Maintenance issue saved', tone: 'success' });
    } catch (error) {
      console.error('Error saving maintenance issue:', { error, issueData, user: actingUser?.uid || actingUser?.email || 'unknown' });
      pushAlert({ title: 'Save failed', message: error?.message || 'Unable to save issue', code: error?.code, raw: error });
    } finally {
      setIsSavingMaintenanceIssue(false);
    }
  };

  const handleSaveRecurringTask = async (taskData, actingUser = user) => {
    try {
      if (editingRecurringTask) {
        const updatedTask = { ...taskData, id: editingRecurringTask.id };
        await setDoc(doc(db, 'recurringTasks', editingRecurringTask.id), updatedTask, { merge: true });
        pushAlert({ title: 'Recurring updated', message: updatedTask.description || 'Task saved', tone: 'success' });
        setIsRecurringModalOpen(false);
        setEditingRecurringTask(null);
        setPendingRecurringPrefill(null);
        return;
      }

      if (taskData.appliesTo === 'multiple') {
        const deduped = Array.from(new Set(taskData.selectedRoomIds || []));
        if (deduped.length === 0) {
          pushAlert({ title: 'Recurring save failed', message: 'Select at least 1 room.', tone: 'error' });
          return;
        }

        console.log('[recurring-bulk] Saving recurring task for rooms:', deduped);
        const results = { success: [], failed: [] };
        for (const roomId of deduped) {
          const task = {
            description: taskData.description,
            frequency: taskData.frequency,
            nextDue: taskData.nextDue,
            locationId: roomId,
            appliesTo: 'single',
            createdFrom: 'bulk',
            id: Math.random().toString(36).substr(2, 9),
          };
          try {
            await setDoc(doc(db, 'recurringTasks', task.id), task);
            results.success.push(roomId);
            console.log('[recurring-bulk] Saved room', roomId, '✅');
          } catch (err) {
            console.error('[recurring-bulk] Failed room', roomId, '❌ error:', err);
            results.failed.push({ roomId, err });
          }
        }

        if (results.success.length === deduped.length) {
          pushAlert({ title: 'Recurring created', message: `Created for ${results.success.length} room${results.success.length === 1 ? '' : 's'}`, tone: 'success' });
          setIsRecurringModalOpen(false);
          setEditingRecurringTask(null);
          setPendingRecurringPrefill(null);
        } else {
          const savedCount = results.success.length;
          const failed = results.failed[0];
          pushAlert({ title: 'Partial save', message: `Saved ${savedCount}/${deduped.length}. Failed on room ${failed?.roomId || ''}. Check console.`, tone: 'error' });
          // Keep modal open so user can retry; do not clear editing state
        }
        return;
      }

      const newTask = {
        ...taskData,
        appliesTo: 'single',
        id: Math.random().toString(36).substr(2, 9),
      };
      await setDoc(doc(db, 'recurringTasks', newTask.id), newTask);
      pushAlert({ title: 'Recurring created', message: 'Task saved', tone: 'success' });
      setIsRecurringModalOpen(false);
      setEditingRecurringTask(null);
      setPendingRecurringPrefill(null);
    } catch (error) {
      console.error('Error saving recurring task:', error);
      pushAlert({ title: 'Recurring save failed', message: error?.message || 'Please try again', code: error?.code, raw: error });
    }
  };

  const handleDeleteRecurringTask = async (id, options = {}) => {
    const { roomName } = options;
    if (!id) return;
    const message = roomName ? `Delete recurring task for ${roomName}?` : 'Delete this recurring task template?';
    if (!confirm(`${message} This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'recurringTasks', id));
      pushAlert({ title: 'Recurring deleted', message: roomName ? `Removed for ${roomName}` : 'Template removed', tone: 'success' });
    } catch (error) {
      console.error('Error deleting recurring task:', error);
      pushAlert({ title: 'Delete failed', message: error?.message || 'Unable to delete recurring task', code: error?.code, raw: error });
    }
  };

  const handleBulkDeleteRecurringGroup = async (groupKey) => {
    const tasksInGroup = recurringTasks.filter((t) => buildRecurringGroupKey(t) === groupKey);
    if (!tasksInGroup.length) {
      pushAlert({ title: 'Delete failed', message: 'No tasks found for this group', tone: 'error' });
      return;
    }

    const groupLabel = tasksInGroup[0]?.description || 'Recurring task';
    if (!confirm(`Delete "${groupLabel}" for ${tasksInGroup.length} room(s)? This cannot be undone.`)) return;

    pushAlert({ title: 'Deleting recurring group', message: `Removing ${tasksInGroup.length} room template${tasksInGroup.length === 1 ? '' : 's'}…`, tone: 'info' });

    const failures = [];
    for (const task of tasksInGroup) {
      try {
        await deleteDoc(doc(db, 'recurringTasks', task.id));
      } catch (error) {
        console.error('Error deleting recurring task', task.id, error);
        failures.push({ task, error });
      }
    }

    if (failures.length) {
      const failedRooms = failures
        .map((f) => ALL_LOCATIONS.find((l) => l.id === f.task.locationId)?.name || f.task.locationId)
        .join(', ');
      pushAlert({ title: 'Partial delete', message: `Failed for ${failures.length}/${tasksInGroup.length} room(s): ${failedRooms}`, tone: 'error' });
      return;
    }

    pushAlert({ title: 'Recurring deleted', message: `Deleted for ${tasksInGroup.length} room(s)`, tone: 'success' });
  };

  const handleDeleteMaintenanceIssue = async (id) => {
      const issue = maintenanceIssues.find((i) => i.id === id);
      try {
        // Delete from Firestore - real-time listener will update state
        await deleteDoc(doc(db, 'maintenance', id));
        pushAlert({ title: 'Issue deleted', message: 'Maintenance issue removed', tone: 'success' });
        if (issue) startUndo({ type: 'delete', issue });
      } catch (error) {
        console.error('Error deleting maintenance issue:', error);
        pushAlert({ title: 'Delete failed', message: error?.message || 'Unable to delete issue', code: error?.code, raw: error });
      }
  };

  const handleBulkDeleteIssues = async (ids) => {
    if (!ids || ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected issue${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const failures = [];
    for (const id of ids) {
      try {
        await deleteDoc(doc(db, 'maintenance', id));
      } catch (error) {
        console.error('Bulk delete failed for issue', id, error);
        failures.push({ id, error });
      }
    }
    setSelectedIssues((prev) => prev.filter((id) => !ids.includes(id)));
    if (failures.length) {
      pushAlert({ title: 'Partial delete', message: `Failed to delete ${failures.length}/${ids.length} issues`, tone: 'error' });
    } else {
      pushAlert({ title: 'Issues deleted', message: `Deleted ${ids.length} issue${ids.length === 1 ? '' : 's'}`, tone: 'success' });
    }
  };

  const handleBulkResolveIssues = async (ids) => {
    if (!ids || ids.length === 0) return;
    const now = new Date().toISOString();
    const failures = [];
    const renewalFailures = [];
    for (const id of ids) {
      try {
        const issue = maintenanceIssues.find((i) => i.id === id);
        const wasResolved = isResolvedStatus(issue?.status);
        await setDoc(doc(db, 'maintenance', id), { status: 'resolved', resolvedAt: now, updatedAt: now }, { merge: true });
        if (issue && !wasResolved) {
          try {
            await advanceRecurringTaskForResolvedIssue({ ...issue, status: 'resolved', resolvedAt: now }, now);
          } catch (renewError) {
            console.error('Recurring auto-renew failed during bulk resolve', id, renewError);
            renewalFailures.push({ id, renewError });
          }
        }
      } catch (error) {
        console.error('Bulk resolve failed for issue', id, error);
        failures.push({ id, error });
      }
    }
    if (failures.length) {
      pushAlert({ title: 'Partial close', message: `Closed ${ids.length - failures.length}/${ids.length}. Some failed.`, tone: 'error' });
    } else if (renewalFailures.length) {
      pushAlert({ title: 'Issues closed', message: `Closed ${ids.length} issue${ids.length === 1 ? '' : 's'}, but ${renewalFailures.length} recurring schedule update${renewalFailures.length === 1 ? '' : 's'} failed.`, tone: 'error' });
    } else {
      pushAlert({ title: 'Issues closed', message: `Closed ${ids.length} issue${ids.length === 1 ? '' : 's'}`, tone: 'success' });
    }
  };

  const handleBulkAssignIssues = async (ids, staff) => {
    if (!ids || ids.length === 0) return;
    const failures = [];
    for (const id of ids) {
      try {
        await setDoc(doc(db, 'maintenance', id), { assignedStaff: staff || 'Needs assignment', updatedAt: new Date().toISOString() }, { merge: true });
      } catch (error) {
        console.error('Bulk assign failed for issue', id, error);
        failures.push({ id, error });
      }
    }
    if (failures.length) {
      pushAlert({ title: 'Partial assign', message: `Assigned ${ids.length - failures.length}/${ids.length}. Some failed.`, tone: 'error' });
    } else {
      pushAlert({ title: 'Issues assigned', message: `Assigned ${staff} to ${ids.length} issue${ids.length === 1 ? '' : 's'}`, tone: 'success' });
    }
  };

  const handleCleanupDuplicateIssues = async (issuePool) => {
    const duplicates = computeDuplicateIssues(issuePool || maintenanceIssues);
    if (!duplicates.length) {
      pushAlert({ title: 'No duplicates', message: 'No duplicate issues detected in this view.', tone: 'info' });
      return;
    }
    const sample = duplicates[0];
    const location = ALL_LOCATIONS.find((l) => l.id === sample.locationId);
    const sampleText = `${sample.description || 'No description'} · ${location?.name || 'Unknown room'}`;
    if (!confirm(`Found ${duplicates.length} duplicate issue${duplicates.length === 1 ? '' : 's'}. Delete them? Example: ${sampleText}`)) return;

    const failures = [];
    for (const dup of duplicates) {
      try {
        await deleteDoc(doc(db, 'maintenance', dup.id));
      } catch (error) {
        console.error('Cleanup duplicate failed', dup.id, error);
        failures.push({ dup, error });
      }
    }

    setSelectedIssues((prev) => prev.filter((id) => !duplicates.some((d) => d.id === id)));

    if (failures.length) {
      pushAlert({ title: 'Partial cleanup', message: `Deleted ${duplicates.length - failures.length}/${duplicates.length}. Some failed.`, tone: 'error' });
    } else {
      pushAlert({ title: 'Duplicates deleted', message: `Removed ${duplicates.length} duplicate issue${duplicates.length === 1 ? '' : 's'}`, tone: 'success' });
    }
  };

  const statsData = useStatistics({ bookings, bookingsWithWithholding, getBookingStayCategory, statsRange, customStatsStart, customStatsEnd });

  const sessionLabel = user
    ? (user.isAnonymous ? 'Session: Anonymous' : `Session: ${user.displayName || user.email || 'Staff account'}`)
    : 'Session: Signing in...';
  const isSavingBooking = !!savingBookingId;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.cream }}>
        <div className="text-slate-600 text-sm">Loading authentication…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginView
                 handleGoogleSignIn={handleGoogleSignIn}
                 loginHint={loginHint}
               />;
  }

  return (
    <ErrorBoundary>
      <div className="app-shell flex font-sans" style={{ backgroundColor: COLORS.cream }}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="md:hidden border-b px-6 py-4 flex items-center justify-between" style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}>
            <span className="font-serif font-bold text-xl text-white">Kolab Living</span>
            <button onClick={() => setSidebarOpen(true)} className="text-white"><Menu size={24} /></button>
          </header>
          <div className={`flex-1 min-h-0 p-6 md:p-10 ${activeTab === 'calendar' ? 'flex flex-col overflow-hidden' : 'overflow-auto'}`}>
            <div className={`max-w-7xl mx-auto w-full ${activeTab === 'calendar' ? 'flex flex-col flex-1 min-h-0' : ''}`}>
               {isOffline && (
                 <div className="mb-3 px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm">
                   Offline. Some actions are disabled until connection returns.
                 </div>
               )}
               {loading && (
                 <div className="mb-4 flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                   <RefreshCcw size={16} className="animate-spin" /> Loading latest data…
                 </div>
               )}
               {dataError && (
                 <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                   Firestore read error: {dataError}. Check Firestore rules/connection and reload.
                 </div>
               )}
               <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:justify-between">
                 <div className="flex items-center gap-3 text-xs text-slate-500">
                   <span>{sessionLabel}</span>
                   <button
                     onClick={handleSignOut}
                     className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-[11px] font-semibold"
                   >
                     Sign out
                   </button>
                 </div>
                 <div className="flex justify-end">
                    {activeTab !== 'maintenance' && activeTab !== 'stats' && activeTab !== 'invoices' && (
                        <button onClick={() => { setEditingBooking(null); setIsModalOpen(true); }} className="px-6 py-3 rounded-full flex items-center shadow-lg transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide" style={{ backgroundColor: COLORS.lime, color: COLORS.darkGreen }}>
                            <Plus size={20} className="mr-2" /> New Booking
                        </button>
                    )}
                 </div>
               </div>
               <Suspense fallback={null}>
               {activeTab === 'dashboard' && <DashboardView
                 TODAY_STR={TODAY_STR}
                 TOMORROW_STR={TOMORROW_STR}
                 bookings={bookings}
                 cleaningTasks={cleaningTasks}
                 cleaningTasksTomorrow={cleaningTasksTomorrow}
                 crm={crm}
                 isResolvedStatus={isResolvedStatus}
                 maintenanceIssues={maintenanceIssues}
                 openBookingDetails={openBookingDetails}
                 setActiveTab={setActiveTab}
                 tomorrowHighPriorityRooms={tomorrowHighPriorityRooms}
                 tomorrowLowPriorityRooms={tomorrowLowPriorityRooms}
                 tomorrowNormalPriorityRooms={tomorrowNormalPriorityRooms}
               />}
               {activeTab === 'calendar' && <CalendarView
                 TODAY_STR={TODAY_STR}
                 bookings={bookings}
                 calendarBlocks={calendarBlocks}
                 calendarBookings={calendarBookings}
                 calendarCreateMode={calendarCreateMode}
                 calendarLastActionRef={calendarLastActionRef}
                 calendarLastErrorRef={calendarLastErrorRef}
                 calendarView={calendarView}
                 dates={dates}
                 draggedRoomStay={draggedRoomStay}
                 ensureDateVisible={ensureDateVisible}
                 getBookingStayCategory={getBookingStayCategory}
                 handleTimelineScroll={handleTimelineScroll}
                 hoveredCalendarDate={hoveredCalendarDate}
                 neighboursBikeCountMap={neighboursBikeCountMap}
                 openBookingDetails={openBookingDetails}
                 openRoomNightExportModal={openRoomNightExportModal}
                 prepareRoomTransfer={prepareRoomTransfer}
                 savingBookingId={savingBookingId}
                 scrollTimelineByViewport={scrollTimelineByViewport}
                 selectedCalendarDate={selectedCalendarDate}
                 setCalendarCreateMode={setCalendarCreateMode}
                 setCalendarView={setCalendarView}
                 setEditingBooking={setEditingBooking}
                 setEditingCalendarBlock={setEditingCalendarBlock}
                 setHoveredCalendarDate={setHoveredCalendarDate}
                 setIsCalendarBlockModalOpen={setIsCalendarBlockModalOpen}
                 setIsModalOpen={setIsModalOpen}
                 setSelectedCalendarDate={setSelectedCalendarDate}
                 timelineRef={timelineRef}
                 visibleEndDate={visibleEndDate}
                 visibleStartDate={visibleStartDate}
               />}
               {activeTab === 'bookings' && <BookingsView
                 TODAY_STR={TODAY_STR}
                 bookingCategoryFilter={bookingCategoryFilter}
                 bookingSearchTerm={bookingSearchTerm}
                 bookingTimeFilter={bookingTimeFilter}
                 bookings={bookings}
                 crm={crm}
                 formatChannelLabel={formatChannelLabel}
                 formatStayCategoryLabel={formatStayCategoryLabel}
                 getBookingStayCategory={getBookingStayCategory}
                 handleDeleteBooking={handleDeleteBooking}
                 setBookingCategoryFilter={setBookingCategoryFilter}
                 setBookingSearchTerm={setBookingSearchTerm}
                 setBookingTimeFilter={setBookingTimeFilter}
                 setEditingBooking={setEditingBooking}
                 setIsModalOpen={setIsModalOpen}
               />}
               {(activeTab === 'crm' || activeTab === 'longTerm') && <GuestCRM bookings={bookings} guests={guests} rooms={ALL_ROOMS} {...crm} onSaveProfile={handleSaveCrmProfile} onUpdateOps={updateLongTermOps} onEditBooking={(booking) => { setEditingBooking(booking); setIsModalOpen(true); }} onCreateBooking={openBookingForGuest} />}
               {activeTab === 'stats' && <StatisticsView
                 customStatsEnd={customStatsEnd}
                 customStatsStart={customStatsStart}
                 setCustomStatsEnd={setCustomStatsEnd}
                 setCustomStatsStart={setCustomStatsStart}
                 setStatsRange={setStatsRange}
                 statsData={statsData}
                 statsRange={statsRange}
               />}
               {activeTab === 'invoices' && <InvoicesView
                 setIsInvoiceModalOpen={setIsInvoiceModalOpen}
               />}
               {activeTab === 'housekeeping' && <HousekeepingView
                 checkinsForDate={checkinsForDate}
                 checkoutsForDate={checkoutsForDate}
                 cleaningTasks={cleaningTasks}
                 expandedHousekeepingBookings={expandedHousekeepingBookings}
                 expandedRecurringCleaningGroups={expandedRecurringCleaningGroups}
                 handleChangeWeeklyCleaningDay={handleChangeWeeklyCleaningDay}
                 handleCompleteRecurringRoomTodo={handleCompleteRecurringRoomTodo}
                 handleCreateRecurringCleaningTask={handleCreateRecurringCleaningTask}
                 handleDeleteRecurringCleaningTask={handleDeleteRecurringCleaningTask}
                 handleHousekeepingTaskUpdate={handleHousekeepingTaskUpdate}
                 handleSkipRecurringRoomTodo={handleSkipRecurringRoomTodo}
                 housekeepingDate={housekeepingDate}
                 housekeepingOverrides={housekeepingOverrides}
                 housekeepingStartTime={housekeepingStartTime}
                 housekeepingTasks={housekeepingTasks}
                 housekeepingView={housekeepingView}
                 markRoomClean={markRoomClean}
                 recurringCleaningDraft={recurringCleaningDraft}
                 recurringCleaningTasks={recurringCleaningTasks}
                 recurringDueByRoomId={recurringDueByRoomId}
                 setExpandedRecurringCleaningGroups={setExpandedRecurringCleaningGroups}
                 setHousekeepingDate={setHousekeepingDate}
                 setHousekeepingStartTime={setHousekeepingStartTime}
                 setHousekeepingView={setHousekeepingView}
                 setRecurringCleaningDraft={setRecurringCleaningDraft}
                 setWeekPlanningStart={setWeekPlanningStart}
                 updateHousekeepingField={updateHousekeepingField}
                 weekPlanningStart={weekPlanningStart}
               />}
               {activeTab === 'maintenance' && <MaintenanceView
                 activeIssue={activeIssue}
                 advanceRecurringTaskForResolvedIssue={advanceRecurringTaskForResolvedIssue}
                 assignedLabel={assignedLabel}
                 bulkAssignValue={bulkAssignValue}
                 expandedRecurringGroups={expandedRecurringGroups}
                 formatIssueAge={formatIssueAge}
                 groupedRecurringTasks={groupedRecurringTasks}
                 handleBulkAssignIssues={handleBulkAssignIssues}
                 handleBulkDeleteIssues={handleBulkDeleteIssues}
                 handleBulkDeleteRecurringGroup={handleBulkDeleteRecurringGroup}
                 handleBulkResolveIssues={handleBulkResolveIssues}
                 handleCleanupDuplicateIssues={handleCleanupDuplicateIssues}
                 handleDeleteRecurringTask={handleDeleteRecurringTask}
                 handleUndo={handleUndo}
                 isResolvedStatus={isResolvedStatus}
                 issueFilters={issueFilters}
                 loadingRecurring={loadingRecurring}
                 maintenanceIssues={maintenanceIssues}
                 openIssuePanel={openIssuePanel}
                 openRoomPanel={openRoomPanel}
                 pushAlert={pushAlert}
                 selectedIssues={selectedIssues}
                 setActiveIssue={setActiveIssue}
                 setBulkAssignValue={setBulkAssignValue}
                 setEditingMaintenanceIssue={setEditingMaintenanceIssue}
                 setEditingRecurringTask={setEditingRecurringTask}
                 setExpandedRecurringGroups={setExpandedRecurringGroups}
                 setIsMaintenanceModalOpen={setIsMaintenanceModalOpen}
                 setIsRecurringModalOpen={setIsRecurringModalOpen}
                 setIssueFilters={setIssueFilters}
                 setMaintenanceIssues={setMaintenanceIssues}
                 setPendingMaintenancePrefill={setPendingMaintenancePrefill}
                 setPendingRecurringPrefill={setPendingRecurringPrefill}
                 setRecurringModalMode={setRecurringModalMode}
                 setSelectedIssues={setSelectedIssues}
                 startUndo={startUndo}
                 undoAction={undoAction}
               />}
               </Suspense>
            </div>
          </div>
        </main>
        {roomTransfer && (
          <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="room-transfer-title" className="bg-white rounded-3xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <h2 id="room-transfer-title" className="text-xl font-bold text-slate-800">{roomTransfer.plan.length > 1 ? 'Switch the current guests to the other room?' : 'Move this guest to the other room?'}</h2>
              <p className="text-sm text-slate-600">{roomTransfer.startDate} → {roomTransfer.endDate} (checkout). Dates and prices stay the same. Only room assignments within this period change; other dates and scheduled moves are preserved.</p>
              <ul className="space-y-3">
                {roomTransfer.plan.map((entry) => <li key={entry.before.id} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <div className="font-bold">{entry.before.guestName}</div>
                  <div className="text-sm">{ALL_ROOMS.find((room) => room.id === entry.fromRoomId)?.name || entry.fromRoomId} → {ALL_ROOMS.find((room) => room.id === entry.toRoomId)?.name || entry.toRoomId}</div>
                  <div className="text-xs text-slate-500">{getBookingRoomStays(entry.before).filter((stay) => stay.roomId === entry.fromRoomId && stay.startDate < roomTransfer.endDate && stay.endDate > roomTransfer.startDate).map((stay) => `${stay.startDate < roomTransfer.startDate ? roomTransfer.startDate : stay.startDate} → ${stay.endDate > roomTransfer.endDate ? roomTransfer.endDate : stay.endDate}`).join(', ')}</div>
                </li>)}
              </ul>
              {roomTransferError && <p role="alert" className="text-sm text-red-700">{roomTransferError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" autoFocus disabled={isSavingBooking} onClick={() => setRoomTransfer(null)} className="px-4 py-2 rounded-xl border">Cancel</button>
                <button type="button" disabled={isSavingBooking} onClick={confirmRoomTransfer} className="px-4 py-2 rounded-xl bg-[#26402E] text-white disabled:opacity-50">{isSavingBooking ? 'Saving…' : roomTransfer.plan.length > 1 ? 'Yes, switch guests' : 'Yes, move guest'}</button>
              </div>
            </div>
          </div>
        )}
        <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveBooking} booking={editingBooking} rooms={ALL_ROOMS} allBookings={bookings} calendarBlocks={calendarBlocks} checkBookingConflict={checkBookingConflict} isSaving={isSavingBooking} currentUser={user} onLookupGuest={lookupReturningGuest} onOpenCalendar={() => { setIsModalOpen(false); setActiveTab('calendar'); }} />
        <CalendarBlockModal
          isOpen={isCalendarBlockModalOpen}
          onClose={() => { setIsCalendarBlockModalOpen(false); setEditingCalendarBlock(null); }}
          onSave={handleSaveCalendarBlock}
          onDelete={handleDeleteCalendarBlock}
          block={editingCalendarBlock}
          rooms={ALL_ROOMS}
          isSaving={isSavingCalendarBlock}
        />
        <RoomNightExportModal
          isOpen={isRoomNightExportModalOpen}
          onClose={() => setIsRoomNightExportModalOpen(false)}
          mode={roomNightExportMode}
          onModeChange={setRoomNightExportMode}
          monthValue={roomNightExportMonth}
          onMonthChange={(monthValue) => {
            setRoomNightExportMonth(monthValue);
            const { startDate, endDate } = getMonthBounds(monthValue);
            if (startDate && endDate) {
              setRoomNightExportStart(startDate);
              setRoomNightExportEnd(endDate);
            }
          }}
          startDate={roomNightExportStart}
          endDate={roomNightExportEnd}
          onStartDateChange={setRoomNightExportStart}
          onEndDateChange={setRoomNightExportEnd}
          onExport={handleExportRoomNights}
        />
        <MaintenanceModal
          isOpen={isMaintenanceModalOpen}
          onClose={() => { setIsMaintenanceModalOpen(false); setPendingMaintenancePrefill(null); }}
          onSave={handleSaveMaintenanceIssue}
          issue={editingMaintenanceIssue || pendingMaintenancePrefill}
          allLocations={ALL_LOCATIONS}
          isSaving={isSavingMaintenanceIssue}
        />
        <RecurringTaskModal
          isOpen={isRecurringModalOpen}
          onClose={() => { setIsRecurringModalOpen(false); setPendingRecurringPrefill(null); }}
          onSave={handleSaveRecurringTask}
          onDelete={handleDeleteRecurringTask}
          task={editingRecurringTask}
          prefill={pendingRecurringPrefill}
          allLocations={ALL_LOCATIONS}
          defaultMode={recurringModalMode}
        />
        <InvoiceModal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} bookings={bookings} />
        <Chatbot />
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {alerts.map((alert) => {
            const isSuccess = alert.tone === 'success';
            const isInfo = alert.tone === 'info';
            const bg = isSuccess ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : isInfo ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-red-50 border-red-200 text-red-800';
            return (
              <div key={alert.id} className={`rounded-xl border shadow-sm px-4 py-3 text-sm ${bg}`}>
                <div className="font-semibold">{alert.title || 'Notice'}</div>
                {alert.message && <div className="mt-1 leading-relaxed text-[13px]">{alert.message}</div>}
                {alert.code && <div className="mt-1 text-[11px] uppercase tracking-wide opacity-70">{alert.code}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </ErrorBoundary>
  );
}
