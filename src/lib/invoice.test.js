import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceDefinition, invoiceFromBooking, invoiceSubtotal } from './invoice.js';

const sample = () => ({ ...invoiceFromBooking({ guestName: 'David', roomId: 'N1', checkIn: '2026-11-17', checkOut: '2026-11-29', price: 240 }), payableNow: 153, items: [ { description: 'Lagom at Neighbours', startDate: '2026-11-17', endDate: '2026-11-29', quantity: 12, amount: 240 }, { description: 'Hygge Studio at Townhouse', startDate: '2026-11-29', endDate: '2026-12-17', quantity: 18, amount: 372 } ] });

test('multi-room invoice retains agreed totals when a displayed unit price is rounded', () => {
  const data = sample();
  assert.equal(invoiceSubtotal(data), 612);
  const definition = JSON.stringify(buildInvoiceDefinition(data));
  for (const value of ['$20.67', '$372.00', '$612.00', '$153.00', '$459.00']) assert.ok(definition.includes(value), value);
});
test('invoice requires an explicit valid payment split and complete line items', () => {
  for (const payableNow of ['', -1, 613, 'invalid']) assert.throws(() => buildInvoiceDefinition({ ...sample(), payableNow }), /payable-now/);
  assert.doesNotThrow(() => buildInvoiceDefinition({ ...sample(), payableNow: 0 }));
  assert.doesNotThrow(() => buildInvoiceDefinition({ ...sample(), payableNow: 612 }));
  for (const patch of [{ quantity: 0 }, { amount: -1 }, { endDate: '2026-11-16' }, { description: '' }]) {
    const data = sample();
    Object.assign(data.items[0], patch);
    assert.throws(() => buildInvoiceDefinition(data), /line item/);
  }
});
test('invoice defaults use booking dates, property and explicit currency without assuming a deposit', () => {
  const data = invoiceFromBooking({ guestName: 'David', roomId: 'N1', checkIn: '2026-11-17', checkOut: '2026-11-29', price: 240, currency: 'VND' });
  assert.equal(data.items[0].quantity, 12);
  assert.match(data.items[0].description, /Neighbours/);
  assert.equal(data.currency, 'VND');
  assert.equal(data.payableNow, '');
});
