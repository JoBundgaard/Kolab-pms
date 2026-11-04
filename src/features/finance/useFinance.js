import { useEffect, useState } from 'react';
import { subscribeToFinance } from '../../services/propertyFinanceService.js';

export default function useFinance(db, uid, month) {
  const [data, setData] = useState(null);
  const key = `${uid}:${month}`;
  useEffect(() => {
    if (!uid) return;
    return subscribeToFinance(db, month, (entries, ready) => setData((previous) => ({ key, entries, ready: ready && !(previous?.key === key && previous.error), error: previous?.key === key ? previous.error : '' })),
      (error) => setData({ key, entries: [], ready: false, error: error.message }));
  }, [db, uid, month, key]);
  return data?.key === key ? data : { entries: [], ready: false, error: '' };
}
