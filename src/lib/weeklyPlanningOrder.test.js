import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderWeeklyTasks, sortWeeklyTasks, weeklyOrderKey } from './weeklyPlanningOrder.js';
import { buildWeeklyExportDays } from './weeklyHousekeepingExport.js';

const tasks = [
  { id: 'r', propertyId: 'prop_3', propertyName: 'Roamr', roomLabel: 'R1', type: 'weekly', isLongTerm: true },
  { id: 'n', propertyId: 'prop_2', propertyName: 'Neighbours', roomLabel: 'N1', type: 'checkout' },
  { id: 't10', propertyId: 'prop_1', roomLabel: 'T10', type: 'check_room' },
  { id: 't2', propertyId: 'prop_1', roomLabel: 'T2', type: 'weekly', isLongTerm: true },
];

test('weekly schedule defaults to property order and natural room numbers regardless of task type', () => {
  assert.deepEqual(sortWeeklyTasks(tasks).map((task) => task.id), ['t2', 't10', 'n', 'r']);
  assert.equal(tasks[0].id, 'r');
});

test('saved order survives removed tasks and new tasks fall back to property order', () => {
  assert.deepEqual(sortWeeklyTasks(tasks, ['n', 'removed', 'r']).map((task) => task.id), ['n', 'r', 't2', 't10']);
  assert.notEqual(weeklyOrderKey('2026-11-02'), weeklyOrderKey('2026-11-03'));
});

test('all task types can move before a target or to the end without duplicates', () => {
  assert.deepEqual(reorderWeeklyTasks(tasks, 't10', 'r'), ['t10', 'r', 'n', 't2']);
  assert.deepEqual(reorderWeeklyTasks(tasks, 'n'), ['r', 't10', 't2', 'n']);
  assert.deepEqual(reorderWeeklyTasks(tasks, 'n', 'n'), tasks.map((task) => task.id));
  assert.deepEqual(reorderWeeklyTasks(tasks, 'missing', 'r'), tasks.map((task) => task.id));
});

test('exports preserve custom ordering including after community filtering', () => {
  const ordered = sortWeeklyTasks(tasks, ['r', 'n', 't2', 't10']);
  assert.deepEqual(buildWeeklyExportDays([ordered], 'housekeeping')[0].map((task) => task.id), ['r', 'n', 't2', 't10']);
  assert.deepEqual(buildWeeklyExportDays([ordered], 'community')[0].map((task) => task.roomLabel), ['R1', 'T2']);
});
