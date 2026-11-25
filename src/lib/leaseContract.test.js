import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaseDefinition, leaseDefaults, leaseFields, leaseWarnings } from './leaseContract.js';
const booking = { id: 'b', guestName: 'Nguyễn Test', checkIn: '2026-11-01', checkOut: '2026-12-01', roomId: 'T1', monthlyRentVnd: 12000000, channel: 'direct', stayCategory: 'long' };
const dates = { startDate: booking.checkIn, endDate: booking.checkOut, agreementDate: '2026-10-20' };
const values = Object.fromEntries(Object.keys(leaseFields).map((k) => [k, 'Reviewed']));
Object.assign(values, { GUEST_FULL_NAME: 'Nguyễn Test', ROOM_SIZE_SQM: 25, RENT_AMOUNT_VND: 12000000, ADDITIONAL_FEES_VND: 0, DEPOSIT_VND: 3000000, BALANCE_DUE_VND: 9000000 });
test('retains template terms and fills every placeholder including repeated dates and signatures', () => {
 const doc = buildLeaseDefinition(values, dates);
 const text = doc.content.map((b) => b.text).join('\n');
 assert.ok(!text.includes('{{'));
 assert.match(text, /Dear Reviewed/);
 assert.match(text, /30 days/);
 assert.match(text, /12,000,000/);
 assert.match(text, /Kiều Vân Anh/);
 assert.match(text, /7\. ADDITIONAL NOTES/);
 assert.match(text, /Signature and full name: Nguyễn Test/);
 assert.match(text, /two weeks/);
});
test('blocks missing identity, invalid amounts, dates and unresolved placeholders', () => {
 for (const bad of [{ PASSPORT_NUMBER: '' }, { DEPOSIT_VND: -1 }, { ROOM_SIZE_SQM: 0 }, { GUEST_FULL_NAME: '{{NAME}}' }]) assert.throws(() => buildLeaseDefinition({ ...values, ...bad }, dates));
 assert.throws(() => buildLeaseDefinition(values, { ...dates, endDate: dates.startDate }));
 assert.throws(() => buildLeaseDefinition(values, { ...dates, agreementDate: '2026-02-30' }));
});
test('uses dated room and rate, leaves unavailable and unverified terms blank', () => {
 const stay = { ...booking, roomMoves: [{ moveDate: '2026-11-15', roomId: 'N1', useDifferentMonthlyRent: true, monthlyRentVnd: 15000000 }] };
 const defaults = leaseDefaults({ booking: stay, rooms: [{ id: 'N1', name: 'N1', type: 'Double' }], startDate: '2026-11-20' });
 assert.equal(defaults.ROOM_NUMBER, 'N1'); assert.equal(defaults.RENT_AMOUNT_VND, 15000000);
 assert.equal(defaults.PASSPORT_NUMBER, ''); assert.equal(defaults.DEPOSIT_VND, '');
 assert.equal(leaseWarnings(stay, '2026-11-02', '2026-12-01').length, 2);
});
