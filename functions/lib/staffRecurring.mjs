import { addStaffDays, requireDay } from './staffDomain.mjs';

export function nextRoomCleaningDue(completedDate, frequency = 'monthly') {
  requireDay(completedDate);
  if (frequency === 'weekly') return addStaffDays(completedDate, 7);
  if (frequency === 'every_45_days') return addStaffDays(completedDate, 45);
  const months = { monthly: 1, bimonthly: 2, every_3_months: 3, every_4_months: 4, every_5_months: 5, every_6_months: 6, yearly: 12 }[frequency];
  if (!months) throw new Error('This recurring task needs a valid frequency. Ask your manager.');
  const date = new Date(`${completedDate}T00:00:00Z`);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}

export async function readRoomRecurring(db, roomId, tx = null) {
  if (!roomId) return [];
  const query = db.collection('recurringCleaningTasks').where('roomId', '==', roomId);
  const snapshot = tx ? await tx.get(query) : await query.get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

// Only room-cleaning descriptions and dates reach staff; no maintenance or guest records.
export function roomRecurringChecklist(task, templates, date) {
  const recorded = (task.recurringTodos || []).filter((todo) => todo.status === 'done');
  if (!task.roomId || task.type === 'shared' || task.status === 'done') return task.recurringTodos || [];
  const due = templates.filter((template) => template.roomId === task.roomId && template.active !== false
    && template.nextDue && template.nextDue <= date);
  const todos = due.map((template) => {
    const id = `hk_rec_${template.id}_${template.nextDue}`;
    const previous = (task.recurringTodos || []).find((todo) => todo.id === id);
    return { id, templateId: template.id, dueDate: template.nextDue,
      description: template.description || 'Recurring room cleaning', frequency: template.frequency || 'monthly',
      status: previous?.status || 'pending', reason: previous?.reason || '',
      ...(previous?.completedAt ? { completedAt: previous.completedAt } : {}) };
  });
  return [...recorded.filter((todo) => !todos.some((item) => item.id === todo.id)), ...todos];
}

export async function withRoomRecurring(db, day) {
  if (!day || day.status !== 'draft') return day;
  const rooms = [...new Set(day.tasks.filter((task) => task.status !== 'done' && task.type !== 'shared').map((task) => task.roomId).filter(Boolean))];
  const entries = await Promise.all(rooms.map(async (id) => [id, await readRoomRecurring(db, id)]));
  const byRoom = new Map(entries);
  return { ...day, tasks: day.tasks.map((task) => ({ ...task,
    recurringTodos: roomRecurringChecklist(task, byRoom.get(task.roomId) || [], day.date) })) };
}
