import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomDropHandlers, startRoomDrag } from './calendarRoomDrag.js';

const payload = { bookingId: 'guest-a', fromRoomId: 'h3', date: '2026-11-13' };
function dragEvent() {
  const data = new Map();
  return {
    prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
    dataTransfer: {
      get types() { return [...data.keys()]; },
      setData(type, value) { data.set(type, value); },
      getData(type) { return data.get(type) || ''; },
    },
  };
}

test('room drop accepts the serialized stay even if the in-memory drag was cleared', () => {
  const event = dragEvent();
  const ref = { current: null };
  startRoomDrag(event, ref, payload);
  assert.equal(event.dataTransfer.effectAllowed, 'move');
  ref.current = null;
  const calls = [];
  const handlers = roomDropHandlers('h5', ref, false, (...args) => calls.push(args));
  handlers.onDragOver(event);
  assert.equal(event.prevented, true);
  assert.equal(event.dataTransfer.dropEffect, 'move');
  handlers.onDrop(event);
  assert.deepEqual(calls, [['h5', payload]]);
  assert.equal(ref.current, null);
});

test('drops ignore unrelated content, the source room, and saving bookings', () => {
  const calls = [];
  const prepare = (...args) => calls.push(args);
  const event = dragEvent();
  roomDropHandlers('h5', { current: null }, false, prepare).onDragOver(event);
  assert.equal(event.prevented, false);
  roomDropHandlers('h5', { current: null }, false, prepare).onDrop(event);
  roomDropHandlers('h3', { current: payload }, false, prepare).onDrop(event);
  roomDropHandlers('h5', { current: payload }, true, prepare).onDrop(event);
  assert.deepEqual(calls, []);
});
