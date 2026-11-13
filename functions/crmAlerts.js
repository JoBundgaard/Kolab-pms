const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

async function refreshBookingAlerts(bookingId) {
  const { bookingFingerprint, buildAlerts, propertyToday, syncSchedule } = await import('./lib/crmFinance.mjs');
  const db = admin.firestore();
  const accountRef = db.collection('crmAccounts').doc(bookingId);
  const bookingRef = db.collection('bookings').doc(bookingId);
  const alertsQuery = db.collection('crmAlerts').where('bookingId', '==', bookingId);
  await db.runTransaction(async (transaction) => {
    const [accountSnap, bookingSnap, alertsSnap] = await Promise.all([
      transaction.get(accountRef), transaction.get(bookingRef), transaction.get(alertsQuery),
    ]);
    const now = new Date().toISOString();
    let alerts = [];
    if (accountSnap.exists && bookingSnap.exists) {
      const booking = { ...bookingSnap.data(), id: bookingId };
      let account = accountSnap.data();
      if (account.fingerprint !== bookingFingerprint(booking)) {
        account = syncSchedule(booking, account, propertyToday());
        transaction.set(accountRef, { ...account, updatedAt: now, updatedBy: 'crm-scheduler' });
        transaction.set(db.collection('crmPayments').doc(`${bookingId}__schedule_${account.version}`), { kind: 'schedule_update', bookingId, guestId: booking.guestId || '', amountVnd: 0, note: 'Booking changed; updated unpaid current and future rent and preserved paid, credited and completed-period charges', createdAt: now, createdBy: 'crm-scheduler', createdByName: 'PMS' });
      }
      alerts = buildAlerts(booking, account, propertyToday());
    }
    const active = new Set(alerts.map((alert) => alert.id));
    for (const snapshot of alertsSnap.docs) {
      if (!active.has(snapshot.id) && !snapshot.data().resolved) transaction.set(snapshot.ref, { resolved: true, resolvedAt: now }, { merge: true });
    }
    for (const alert of alerts) transaction.set(db.collection('crmAlerts').doc(alert.id), { ...alert, resolved: false, updatedAt: now }, { merge: true });
  });
}

exports.crmDailyAlerts = onSchedule({ schedule: '0 9 * * *', timeZone: 'Asia/Ho_Chi_Minh', retryCount: 3 }, async () => {
  const accounts = await admin.firestore().collection('crmAccounts').get();
  // Bound concurrency and let failed runs retry; each booking is idempotent.
  let failures = 0;
  for (let index = 0; index < accounts.docs.length; index += 10) {
    const batch = accounts.docs.slice(index, index + 10);
    const results = await Promise.allSettled(batch.map((entry) => refreshBookingAlerts(entry.id)));
    results.forEach((result, offset) => {
      if (result.status === 'rejected') {
        failures++;
        logger.error('CRM account refresh failed', { bookingId: batch[offset].id, reason: result.reason?.message || String(result.reason) });
      }
    });
  }
  if (failures) throw new Error(`${failures} CRM accounts could not refresh; other accounts were processed.`);
});
exports.crmAccountChanged = onDocumentWritten('crmAccounts/{bookingId}', (event) => refreshBookingAlerts(event.params.bookingId));
exports.crmBookingChanged = onDocumentWritten('bookings/{bookingId}', (event) => refreshBookingAlerts(event.params.bookingId));
