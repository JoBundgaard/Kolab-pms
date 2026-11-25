const PROPERTY_ORDER = ['prop_1', 'prop_2', 'prop_3'];
const PROPERTY_NAMES = ['Townhouse', 'Neighbours', 'Roamr'];

export const weeklyOrderKey = (date) => `weekly_order_${date}`;

export function sortWeeklyTasks(tasks, savedOrder = []) {
  const positions = new Map(savedOrder.map((id, index) => [id, index]));
  const propertyRank = (task) => {
    const index = PROPERTY_ORDER.indexOf(task.propertyId);
    const rank = index < 0 ? PROPERTY_NAMES.indexOf(task.propertyName) : index;
    return rank < 0 ? PROPERTY_ORDER.length : rank;
  };
  return [...tasks].sort((a, b) =>
    (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity)
    || propertyRank(a) - propertyRank(b)
    || (a.roomLabel || '').localeCompare(b.roomLabel || '', 'en', { numeric: true })
    || a.id.localeCompare(b.id));
}

export function reorderWeeklyTasks(tasks, sourceId, targetId = null) {
  const ids = tasks.map((task) => task.id);
  if (!ids.includes(sourceId) || sourceId === targetId || (targetId && !ids.includes(targetId))) return ids;
  const reordered = ids.filter((id) => id !== sourceId);
  reordered.splice(targetId ? reordered.indexOf(targetId) : reordered.length, 0, sourceId);
  return reordered;
}
