import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHousekeepingWhatsappMessage } from './housekeepingWhatsapp.js';

test('WhatsApp plan preserves interleaved manual room order and custom instructions', () => {
  const message = buildHousekeepingWhatsappMessage({ selectedDate: '2026-11-04', tasks: [
    { roomLabel: 'T2', propertyName: 'Townhouse', type: 'checkout', priority: 9 },
    { roomLabel: 'R1', propertyName: 'Roamr', type: 'custom', description: 'Clean balcony', priority: 1 },
    { roomLabel: 'T1', propertyName: 'Townhouse', type: 'check_room', priority: 2 },
  ] });
  assert.ok(message.indexOf('T2 –') < message.indexOf('R1 –'));
  assert.ok(message.indexOf('R1 –') < message.indexOf('T1 –'));
  assert.match(message, /R1 – Custom clean \(Clean balcony\) – Prio 2/);
});
