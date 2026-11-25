import { useCallback, useEffect, useState } from 'react';
import { saveCrmAction, subscribeToCrm } from '../services/crmService';

const EMPTY = { crmAccounts: [], crmPayments: [], crmAlerts: [], loaded: [], errors: {} };
export default function useGuestCrm(db, user) {
  const [data, setData] = useState(EMPTY);
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    return subscribeToCrm(db, (name, records) => setData((previous) => {
      const current = previous.uid === uid ? previous : EMPTY;
      return { ...current, uid, [name]: records, errors: { ...current.errors, [name]: '' }, loaded: [...new Set([...current.loaded, name])] };
    }), (name, error) => setData((previous) => {
      const current = previous.uid === uid ? previous : EMPTY;
      return { ...current, uid, errors: { ...current.errors, [name]: error.message } };
    }));
  }, [db, uid]);
  const onAction = useCallback(async (action) => {
    if (!navigator.onLine) throw new Error('Reconnect before changing guest payments.');
    const result = await saveCrmAction({ db, user, ...action });
    return result;
  }, [db, user]);
  const current = data.uid === uid ? data : EMPTY;
  const error = Object.values(current.errors).filter(Boolean).join(' ');
  return { accounts: current.crmAccounts, payments: current.crmPayments, alerts: current.crmAlerts, error, loading: current.loaded.length < 3 && !error, onAction };
}
