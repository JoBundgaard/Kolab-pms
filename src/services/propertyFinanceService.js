import { collection, doc, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { normalizeFinanceEntry, validFinanceMonth } from '../lib/propertyFinance.js';

export function subscribeToFinance(db, month, onData, onError) {
  if (!validFinanceMonth(month)) throw new Error('Choose a valid month.');
  const scopes = { month: [], paymentMonth: [] };
  const loaded = new Set();
  const stops = Object.keys(scopes).map((field) => onSnapshot(query(collection(db, 'financeEntries'), where(field, '==', month)), { includeMetadataChanges: true }, (snapshot) => {
    scopes[field] = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
    if (!snapshot.metadata.fromCache) loaded.add(field);
    const entries = [...new Map(Object.values(scopes).flat().map((e) => [e.id, e])).values()];
    onData(entries, loaded.size === 2);
  }, onError));
  return () => stops.forEach((stop) => stop());
}

export async function saveFinanceEntry({ db, user, actionId, input }) {
  if (!user?.uid) throw new Error('Sign in before recording finances.');
  if (!actionId || actionId.includes('/')) throw new Error('Reopen the entry form.');
  const entry = normalizeFinanceEntry(input);
  const ref = doc(db, 'financeEntries', actionId);
  return runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) return { duplicate: true };
    tx.set(ref, { ...entry, createdAt: new Date().toISOString(), createdBy: user.uid, createdByName: user.displayName || user.email || 'Staff' });
    return { duplicate: false };
  });
}

export async function voidFinanceEntry({ db, user, entryId, reason }) {
  if (!user?.uid) throw new Error('Sign in before correcting finances.');
  if (!String(reason || '').trim()) throw new Error('Enter a reason for voiding this entry.');
  const ref = doc(db, 'financeEntries', entryId);
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Entry no longer exists.');
    if (snapshot.data().sourceType) throw new Error('Manage staff expenses in Staff & pay.');
    if (snapshot.data().status === 'void') return;
    tx.update(ref, { status: 'void', voidReason: reason.trim().slice(0, 500), voidedAt: new Date().toISOString(), voidedBy: user.uid });
  });
}

export async function settleFinanceEntry({ db, user, entryId, paymentDate, method, reference }) {
  if (!user?.uid) throw new Error('Sign in before recording a payment.');
  const ref = doc(db, 'financeEntries', entryId);
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.data().status !== 'active') throw new Error('This entry is no longer active.');
    const existing = snapshot.data();
    if (existing.sourceType) throw new Error('Manage staff payments in Staff & pay.');
    if (existing.paymentDate) throw new Error('Payment already recorded. Refresh the list.');
    const entry = normalizeFinanceEntry({ ...existing, paymentDate, method, reference });
    if (!entry.paymentDate) throw new Error('Enter a receipt/payment date.');
    tx.update(ref, { paymentDate: entry.paymentDate, paymentMonth: entry.paymentMonth, method: entry.method, reference: entry.reference,
      paymentRecordedAt: new Date().toISOString(), paymentRecordedBy: user.uid });
  });
}
