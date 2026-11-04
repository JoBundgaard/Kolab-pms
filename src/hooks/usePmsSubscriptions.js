import { auth, db } from '../firebase.js';
import { normalizeCalendarBlock } from '../lib/calendarBlocks.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect } from 'react';

export default function usePmsSubscriptions({
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
}) {
  useEffect(() => {
    let unsubBookings = () => {};
    let unsubCalendarBlocks = () => {};
    let unsubGuests = () => {};
    let unsubMaintenance = () => {};
    let unsubRecurring = () => {};
    let unsubRecurringCleaning = () => {};
    let unsubRoomStatuses = () => {};
    let unsubHousekeepingOverrides = () => {};
    let listenersStarted = false;

    const startListeners = () => {
      if (listenersStarted) return;
      listenersStarted = true;

      const bookingsQuery = query(collection(db, 'bookings'));
      unsubBookings = onSnapshot(
        bookingsQuery,
        (snapshot) => {
          console.log('[Firestore] bookings snapshot size:', snapshot.size);
          setDataError(null);
          setBookings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to bookings:', error);
          setDataError(error.message || 'Unable to read bookings from Firestore');
          setLoading(false);
          pushAlert({ title: 'Sync error: bookings', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      const calendarBlocksQuery = query(collection(db, 'calendarBlocks'));
      unsubCalendarBlocks = onSnapshot(
        calendarBlocksQuery,
        (snapshot) => {
          setCalendarBlocks(snapshot.docs.map((d) => normalizeCalendarBlock({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to calendar blocks:', error);
          pushAlert({ title: 'Sync error: calendar blocks', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      const guestsQuery = query(collection(db, 'guests'));
      unsubGuests = onSnapshot(
        guestsQuery,
        (snapshot) => {
          console.log('[Firestore] guests snapshot size:', snapshot.size);
          setGuests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to guests:', error);
          pushAlert({ title: 'Sync error: guests', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      const maintenanceQuery = query(collection(db, 'maintenance'));
      unsubMaintenance = onSnapshot(
        maintenanceQuery,
        (snapshot) => {
          console.log('[Firestore] maintenance snapshot size:', snapshot.size);
          setDataError(null);
          setMaintenanceIssues(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to maintenance issues:', error);
          setDataError(error.message || 'Unable to read maintenance issues');
          setLoading(false);
          pushAlert({ title: 'Sync error: maintenance', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      setLoadingRecurring(true);
      const recurringQuery = query(collection(db, 'recurringTasks'));
      unsubRecurring = onSnapshot(
        recurringQuery,
        (snapshot) => {
          console.log('[Firestore] recurring tasks snapshot size:', snapshot.size);
          setRecurringTasks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoadingRecurring(false);
        },
        (error) => {
          console.error('Error listening to recurring tasks:', error);
          setDataError(error.message || 'Unable to read recurring tasks');
          setLoading(false);
          setLoadingRecurring(false);
          pushAlert({ title: 'Sync error: recurring tasks', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      const recurringCleaningQuery = query(collection(db, 'recurringCleaningTasks'));
      unsubRecurringCleaning = onSnapshot(
        recurringCleaningQuery,
        (snapshot) => {
          setRecurringCleaningTasks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to recurring cleaning tasks:', error);
          pushAlert({ title: 'Sync error: recurring cleaning', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      const roomStatusesQuery = query(collection(db, 'roomStatuses'));
      unsubRoomStatuses = onSnapshot(
        roomStatusesQuery,
        (snapshot) => {
          setDataError(null);
          const statuses = {};
          snapshot.forEach((docSnap) => {
            statuses[docSnap.id] = docSnap.data();
          });
          setRoomStatuses(statuses);
        },
        (error) => {
          console.error('Error listening to room statuses:', error);
          setDataError(error.message || 'Unable to read room statuses');
          setLoading(false);
          pushAlert({ title: 'Sync error: room statuses', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      const housekeepingOverridesQuery = query(collection(db, 'housekeepingOverrides'));
      unsubHousekeepingOverrides = onSnapshot(
        housekeepingOverridesQuery,
        (snapshot) => {
          const overrides = {};
          snapshot.forEach((docSnap) => {
            overrides[docSnap.id] = docSnap.data();
          });
          setHousekeepingOverrides(overrides);
        },
        (error) => {
          console.error('Error listening to housekeeping overrides:', error);
          pushAlert({ title: 'Sync error: housekeeping', message: error.message, code: error.code || 'firestore-error', raw: error });
        }
      );

      setLoading(false);
    };

    const authUnsub = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          setUser(null);
          if (listenersStarted) {
            unsubBookings();
            unsubCalendarBlocks();
            unsubGuests();
            unsubMaintenance();
            unsubRecurring();
            unsubRecurringCleaning();
            unsubRoomStatuses();
            unsubHousekeepingOverrides();
            listenersStarted = false;
          }
          setAuthLoading(false);
          setLoading(false);
          return;
        }

        setUser(currentUser);
        setAuthLoading(false);
        startListeners();
      } catch (error) {
        console.error('Auth initialization error:', error);
        setDataError(error.message || 'Authentication failed');
        setAuthLoading(false);
        setLoading(false);
        pushAlert({ title: 'Auth Error', message: error.message, code: error.code || 'auth-error', raw: error });
      }
    });

    return () => {
      authUnsub();
      unsubBookings();
      unsubCalendarBlocks();
      unsubGuests();
      unsubMaintenance();
      unsubRecurring();
      unsubRecurringCleaning();
      unsubRoomStatuses();
      unsubHousekeepingOverrides();
    };
  }, [pushAlert, setAuthLoading, setBookings, setCalendarBlocks, setDataError, setGuests, setHousekeepingOverrides, setLoading, setLoadingRecurring, setMaintenanceIssues, setRecurringCleaningTasks, setRecurringTasks, setRoomStatuses, setUser]);
}
