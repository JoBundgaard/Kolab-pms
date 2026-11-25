import test from 'node:test';
import assert from 'node:assert/strict';
import { guestBookingGroups } from './guestBookingOptions.js';
const today = '2026-11-16';
const stay = (id, checkIn, checkOut, extra = {}) => ({ id, guestName: id, checkIn, checkOut, ...extra });
const bookings = [stay('older','2026-01-01','2026-02-01'),stay('future','2027-01-01','2027-02-01'),stay('soon','2026-11-30','2026-12-20'),stay('current','2026-11-01','2026-12-01'),stay('recent','2026-10-01','2026-11-16'),stay('cancelled','2026-11-01','2026-12-01',{status:'cancelled'}),stay('early','2026-11-01','2026-12-01',{actualCheckoutDate:'2026-11-15'})];
test('groups current, next 14 days, future and past in order; most recent past first', () => {
 const result = guestBookingGroups(bookings,'',today);
 assert.deepEqual(result.map(g => g.key),['current','soon','future','past','cancelled']);
 assert.deepEqual(result.find(g => g.key === 'past').bookings.map(b => b.id),['recent','early','older']);
 assert.equal(result[0].bookings[0].id,'current');
});
test('matches partial names without accents, case or word-order sensitivity', () => {
 const data = [stay('a','2026-11-01','2026-12-01',{guestName:'Nguyễn Đặng An'}),stay('b','2026-11-17','2026-12-01',{guestName:'Anna Smith'})];
 assert.equal(guestBookingGroups(data,'  DANG nguye ',today)[0].bookings[0].id,'a');
 assert.equal(guestBookingGroups(data,'SMI',today)[0].bookings[0].id,'b');
 assert.deepEqual(guestBookingGroups(data,'nobody',today),[]);
});
test('arrival today is current, checkout today is past, day 15 is future', () => {
 const result=guestBookingGroups([stay('arrives','2026-11-16','2026-11-20'),stay('departs','2026-11-10','2026-11-16'),stay('later','2026-12-01','2027-01-01')],'',today);
 assert.deepEqual(result.map(g=>g.key),['current','future','past']);
});
