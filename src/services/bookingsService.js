import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const randomId = () => Math.random().toString(36).substr(2, 9);
const withTimeout = (promise, timeoutMs, message) => Promise.race([
  promise,
  new Promise((_, reject) => {
    const err = new Error(message);
    err.code = 'timeout';
    setTimeout(() => reject(err), timeoutMs);
  }),
]);

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
    await withTimeout(
      setDoc(doc(db, 'bookings', id), payload, { merge: true }),
      timeoutMs,
      'Save timed out before Firestore confirmed the write.'
    );
    return { ok: true, data: payload };
  } catch (err) {
    return normalizeError(err);
  }
}

export async function removeBooking({ db, id, timeoutMs = 5000 }) {
  try {
    await withTimeout(
      deleteDoc(doc(db, 'bookings', id)),
      timeoutMs,
      'Delete timed out before Firestore confirmed the write.'
    );
    return { ok: true };
  } catch (err) {
    return normalizeError(err);
  }
}
