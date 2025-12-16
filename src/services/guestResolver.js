import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { normalizeEmail, normalizePhone, normalizeName } from '../utils/normalizeGuest';

const RETURNING_STATUSES = ['completed', 'checked_out'];
const nowIso = () => new Date().toISOString();
const randomId = () => Math.random().toString(36).substr(2, 9);

const diffNights = (start, end) => {
  if (!start || !end) return 0;
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diffTime = endDate.getTime() - startDate.getTime();
  if (diffTime <= 0) return 0;
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

async function findGuestByField({ db, field, value }) {
  if (!value) return null;
  const q = query(collection(db, 'guests'), where(field, '==', value), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

async function findExistingGuest({ db, emailNorm, phoneNorm, nameNorm, allowNameMatch = false }) {
  const byEmail = await findGuestByField({ db, field: 'emailNorm', value: emailNorm });
  if (byEmail) return { guest: byEmail, matchReason: 'matchedByEmail' };

  const byPhone = await findGuestByField({ db, field: 'phoneNorm', value: phoneNorm });
  if (byPhone) return { guest: byPhone, matchReason: 'matchedByPhone' };

  if (!allowNameMatch) return null;
  const byName = await findGuestByField({ db, field: 'nameNorm', value: nameNorm });
  if (byName) return { guest: byName, matchReason: 'matchedByName' };
  return null;
}

async function hasPriorCompletedStay({ db, guestId, newCheckIn }) {
  if (!guestId) return false;
  try {
    const q = query(
      collection(db, 'bookings'),
      where('guestId', '==', guestId),
      where('status', 'in', RETURNING_STATUSES),
      orderBy('checkOut', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return false;
    const booking = snap.docs[0].data();
    if (!booking.checkOut) return true;
    if (!newCheckIn) return true;
    return booking.checkOut < newCheckIn;
  } catch (err) {
    console.warn('[guestResolver] prior stay check failed', err);
    return false;
  }
}

export async function resolveGuestForBooking({ db, bookingDraft, allowNameMatch = false }) {
  const emailNorm = normalizeEmail(bookingDraft?.guestEmail);
  const phoneNorm = normalizePhone(bookingDraft?.guestPhone);
  const nameNorm = normalizeName(bookingDraft?.guestName);
  const channel = bookingDraft?.channel || 'airbnb';
  const sourceChannels = [];
  if (channel) sourceChannels.push(channel);

  const existing = await findExistingGuest({ db, emailNorm, phoneNorm, nameNorm, allowNameMatch });

  if (existing?.guest) {
    const guest = existing.guest;
    let isReturningGuest = (guest.stayCount || 0) >= 1;
    let returningReason = isReturningGuest ? 'stayCount>=1' : existing.matchReason;

    if (!isReturningGuest) {
      const priorStay = await hasPriorCompletedStay({ db, guestId: guest.id, newCheckIn: bookingDraft?.checkIn || bookingDraft?.startDate });
      if (priorStay) {
        isReturningGuest = true;
        returningReason = 'priorCompletedStay';
      }
    }

    const mergedSourceChannels = Array.from(new Set([...(guest.sourceChannels || []), ...sourceChannels].filter(Boolean)));
    const updates = {
      updatedAt: nowIso(),
      sourceChannels: mergedSourceChannels,
    };

    if (!guest.email && bookingDraft?.guestEmail) updates.email = bookingDraft.guestEmail;
    if (!guest.emailNorm && emailNorm) updates.emailNorm = emailNorm;
    if (!guest.phone && bookingDraft?.guestPhone) updates.phone = bookingDraft.guestPhone;
    if (!guest.phoneNorm && phoneNorm) updates.phoneNorm = phoneNorm;
    if (!guest.fullName && bookingDraft?.guestName) updates.fullName = bookingDraft.guestName;
    if (!guest.nameNorm && nameNorm) updates.nameNorm = nameNorm;

    await setDoc(doc(db, 'guests', guest.id), updates, { merge: true });

    return {
      guestId: guest.id,
      guest,
      isReturningGuest,
      returningReason,
      normalized: { emailNorm, phoneNorm, nameNorm },
    };
  }

  const newGuestId = randomId();
  const now = nowIso();
  const newGuest = {
    fullName: bookingDraft?.guestName || 'Unknown guest',
    nameNorm,
    email: bookingDraft?.guestEmail || null,
    emailNorm,
    phone: bookingDraft?.guestPhone || null,
    phoneNorm,
    createdAt: now,
    updatedAt: now,
    tags: [],
    notes: '',
    stayCount: 0,
    lifetimeNights: 0,
    lastStayEnd: null,
    sourceChannels,
    lastBookingId: null,
    status: 'active',
  };

  await setDoc(doc(db, 'guests', newGuestId), newGuest);

  return {
    guestId: newGuestId,
    guest: { id: newGuestId, ...newGuest },
    isReturningGuest: false,
    returningReason: null,
    normalized: { emailNorm, phoneNorm, nameNorm },
  };
}

export async function updateGuestStatsFromBooking({ db, booking }) {
  if (!booking?.guestId) {
    return { ok: false, message: 'Missing guestId on booking' };
  }

  try {
    const ref = doc(db, 'guests', booking.guestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ok: false, message: 'Guest not found' };
    }

    const guest = snap.data();
    const nights = diffNights(booking.startDate || booking.checkIn, booking.endDate || booking.checkOut);
    const update = {
      stayCount: (guest.stayCount || 0) + 1,
      lifetimeNights: (guest.lifetimeNights || 0) + nights,
      lastStayEnd: booking.endDate || booking.checkOut || null,
      lastBookingId: booking.id || null,
      updatedAt: nowIso(),
    };

    await setDoc(ref, update, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error('[guestResolver] updateGuestStatsFromBooking failed', err);
    return { ok: false, message: err?.message || 'Failed to update guest stats', raw: err };
  }
}

export async function previewReturningGuest({ db, guestEmail, guestPhone, guestName, allowNameMatch = false, checkIn }) {
  const emailNorm = normalizeEmail(guestEmail);
  const phoneNorm = normalizePhone(guestPhone);
  const nameNorm = normalizeName(guestName);

  const existing = await findExistingGuest({ db, emailNorm, phoneNorm, nameNorm, allowNameMatch });
  if (!existing?.guest) return null;

  const guest = existing.guest;
  let isReturningGuest = (guest.stayCount || 0) >= 1;
  let returningReason = isReturningGuest ? 'stayCount>=1' : existing.matchReason;

  if (!isReturningGuest) {
    const priorStay = await hasPriorCompletedStay({ db, guestId: guest.id, newCheckIn: checkIn });
    if (priorStay) {
      isReturningGuest = true;
      returningReason = 'priorCompletedStay';
    }
  }

  return {
    guestId: guest.id,
    guest,
    isReturningGuest,
    returningReason,
    normalized: { emailNorm, phoneNorm, nameNorm },
  };
}
