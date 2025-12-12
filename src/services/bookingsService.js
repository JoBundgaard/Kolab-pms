import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const randomId = () => Math.random().toString(36).substr(2, 9);

const normalizeError = (err) => ({
  ok: false,
  code: err?.code || 'unknown',
  message: err?.message || 'Unknown error',
  raw: err,
});

export async function upsertBooking({ db, data, existingId, timeoutMs = 5000 }) {
  const id = existingId || data.id || randomId();
  const payload = { ...data, id };
  try {
    await setDoc(doc(db, 'bookings', id), payload, { merge: true });
    const confirmed = await confirmDocExists({ db, id, timeoutMs });
    if (!confirmed.ok) return confirmed;
    return { ok: true, data: payload };
  } catch (err) {
    return normalizeError(err);
  }
}

export async function removeBooking({ db, id, timeoutMs = 5000 }) {
  try {
    await deleteDoc(doc(db, 'bookings', id));
    const confirmed = await confirmDocAbsent({ db, id, timeoutMs });
    if (!confirmed.ok) return confirmed;
    return { ok: true };
  } catch (err) {
    return normalizeError(err);
  }
}

async function confirmDocExists({ db, id, timeoutMs }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const snap = await getDoc(doc(db, 'bookings', id));
      if (snap.exists()) return { ok: true, data: { id, ...snap.data() } };
    } catch (err) {
      return normalizeError(err);
    }
    await delay(250);
  }
  return { ok: false, code: 'confirm-timeout', message: 'Save not confirmed. Please retry.' };
}

async function confirmDocAbsent({ db, id, timeoutMs }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const snap = await getDoc(doc(db, 'bookings', id));
      if (!snap.exists()) return { ok: true };
    } catch (err) {
      return normalizeError(err);
    }
    await delay(250);
  }
  return { ok: false, code: 'confirm-timeout', message: 'Delete not confirmed. Please retry.' };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
