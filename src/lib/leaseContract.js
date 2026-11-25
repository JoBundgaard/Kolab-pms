import template from '../config/leaseTemplate.json' with { type: 'json' };
import { accountSummary, daysBetween, monthlyRentAt, occupancyEnd, roomAt } from '../../functions/lib/crmFinance.mjs';

export const leaseFields = {
  GUEST_PREFERRED_NAME: 'Preferred name', GUEST_FULL_NAME: 'Full legal name', DATE_OF_BIRTH: 'Date of birth', NATIONALITY: 'Nationality', PASSPORT_NUMBER: 'Passport number', GUEST_PHONE: 'Contact number', PROPERTY_ADDRESS: 'Property address', ROOM_TYPE: 'Room type', ROOM_NUMBER: 'Room number', ROOM_SIZE_SQM: 'Room size (sqm)', ROOM_FEATURES: 'Private-room features', SHARED_SPACES: 'Shared common spaces', INCLUDED_SERVICES: 'Included services', EXTRA_SERVICE_FEES: 'Extra service fees', RENT_PERIOD: 'Rent period', RENT_AMOUNT_VND: 'Rent amount (VND)', ADDITIONAL_FEES_VND: 'Additional fees (VND)', DEPOSIT_VND: 'Reservation deposit required (VND)', BALANCE_DUE_VND: 'Remaining payment at check-in (VND)', ADDITIONAL_NOTES_OR_NONE: 'Additional agreed notes',
};
export const amountFields = ['RENT_AMOUNT_VND', 'ADDITIONAL_FEES_VND', 'DEPOSIT_VND', 'BALANCE_DUE_VND'];
export const formatLeaseDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function leaseDefaults({ guest = {}, booking, rooms, account, startDate }) {
  const room = rooms.find((r) => r.id === roomAt(booking, startDate)) || {};
  const summary = accountSummary(booking, account, startDate);
  const monthly = account?.plan?.billing === 'monthly' || (!account && booking.monthlyRentVnd != null);
  return {
    GUEST_PREFERRED_NAME: guest.preferredName || guest.fullName || booking.guestName || '', GUEST_FULL_NAME: guest.fullName || booking.guestName || '',
    DATE_OF_BIRTH: guest.dateOfBirth || '', NATIONALITY: guest.nationality || '', PASSPORT_NUMBER: guest.passportNumber || '', GUEST_PHONE: guest.phone || booking.guestPhone || '',
    PROPERTY_ADDRESS: room.propertyAddress || '', ROOM_TYPE: room.type || '', ROOM_NUMBER: room.name || '', ROOM_SIZE_SQM: room.sizeSqm ?? '', ROOM_FEATURES: room.features || '', SHARED_SPACES: room.sharedSpaces || '', INCLUDED_SERVICES: room.includedServices || '', EXTRA_SERVICE_FEES: (booking.services || []).map((service) => `${service.name} × ${service.qty || 1}: ${Number(service.price || 0).toLocaleString('en-US')} VND each`).join('; '),
    RENT_PERIOD: monthly ? 'per month' : 'full booked stay', RENT_AMOUNT_VND: monthly ? monthlyRentAt(booking, startDate, account?.plan) : (account?.plan?.totalVnd ?? booking.price ?? ''),
    ADDITIONAL_FEES_VND: '', DEPOSIT_VND: account ? summary.bookingDepositRequired : '', BALANCE_DUE_VND: account && !summary.needsSetup ? (summary.prepaid ? 0 : summary.arrivalBalanceVnd || '') : '', ADDITIONAL_NOTES_OR_NONE: 'None',
  };
}
export function leaseWarnings(booking, start, end) {
  return [
    (start !== booking.checkIn || end !== occupancyEnd(booking)) && 'Contract dates differ from the booked stay. Review rent, fees and payment amounts for this period.',
    booking.roomMoves?.some((m) => start < m.moveDate && m.moveDate < end) && 'This period includes room moves. Record the room and rate changes in additional agreed notes.',
    booking.sellRoomDuringBreak && (booking.guestBreakPeriods || []).some((b) => b.startDate < end && b.endDate > start) && 'This period includes a stay break. Review the agreed notes and amounts.',
  ].filter(Boolean);
}
export function buildLeaseDefinition(values, { startDate, endDate, agreementDate }) {
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (![startDate, endDate, agreementDate].every(validDate) || endDate <= startDate) throw new Error('Choose valid dates with the end after the start.');
  for (const [key, label] of Object.entries(leaseFields)) {
    if (!String(values[key] ?? '').trim()) throw new Error(`Complete ${label.toLowerCase()}.`);
    if (amountFields.includes(key) && (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0)) throw new Error(`${label} must be zero or more.`);
    if (/\{\{.*?\}\}/.test(String(values[key]))) throw new Error(`Replace the placeholder in ${label.toLowerCase()}.`);
  }
  if (!Number.isFinite(Number(values.ROOM_SIZE_SQM)) || Number(values.ROOM_SIZE_SQM) <= 0) throw new Error('Room size must be greater than zero.');
  const fields = { ...values, START_DATE: formatLeaseDate(startDate), END_DATE: formatLeaseDate(endDate), AGREEMENT_DATE: formatLeaseDate(agreementDate), DURATION_DAYS: daysBetween(startDate, endDate) };
  amountFields.forEach((key) => { fields[key] = Number(fields[key]).toLocaleString('en-US'); });
  const content = template.map((block, index) => ({ text: block.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key] ?? '').replace(/\u200b/g, ''), style: index === 0 ? 'title' : /^(\d\.|CO-LIVING OPERATOR|RENTER|PARTY [AB])/.test(block) ? 'heading' : 'body' }));
  return { info: { title: `Lease contract - ${values.GUEST_FULL_NAME}` }, pageSize: 'A4', pageMargins: [48, 44, 48, 44], defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.2 }, styles: { title: { fontSize: 19, bold: true, margin: [0, 0, 0, 18] }, heading: { fontSize: 12, bold: true, margin: [0, 12, 0, 8] }, body: { margin: [0, 0, 0, 8] } }, content, footer: (page, total) => ({ text: `${page} / ${total}`, alignment: 'center', fontSize: 8, margin: [0, 16, 0, 0] }) };
}
export async function downloadLease(values, dates) {
  const definition = buildLeaseDefinition(values, dates);
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  const filename = `Kolab-Lease-${values.GUEST_FULL_NAME.replace(/[^\p{L}\p{N}-]+/gu, '-')}-${dates.startDate}.pdf`;
  await pdfMake.createPdf(definition).download(filename);
}
