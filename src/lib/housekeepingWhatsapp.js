export function buildHousekeepingWhatsappMessage({ tasks = [], recurringDueByRoomId = {}, selectedDate, cleaningStartTime = '' }) {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const safeRecurringByRoom = recurringDueByRoomId && typeof recurringDueByRoomId === 'object' ? recurringDueByRoomId : {};
  const dateLabel = (() => {
    if (!selectedDate) return 'Unknown date';
    const d = new Date(selectedDate);
    if (isNaN(d.getTime())) return selectedDate;
    const day = `${d.getDate()}`.padStart(2, '0');
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  })();
  const startTimeLabel = cleaningStartTime || 'Not set';

  const relevant = safeTasks.filter((t) => (t?.status || 'dirty') !== 'clean');
  if (relevant.length === 0) {
    return `Housekeeping plan (${dateLabel})\nCleaning starts: ${startTimeLabel}\n\nAll clear.`;
  }

  const typeLabel = (type) => {
    if (type === 'checkout') return 'Checkout clean';
    if (type === 'check_room') return 'Check room';
    if (type === 'weekly') return 'Weekly clean';
    if (type === 'recurring') return 'Recurring clean';
    if (type === 'custom') return 'Custom clean';
    if (type === 'touchup') return 'Touch-up';
    return type || 'Task';
  };

  const lines = [`Housekeeping plan (${dateLabel})`, `Cleaning starts: ${startTimeLabel}`, ''];
  let previousProperty = '';
  relevant.forEach((task, index) => {
    const property = task.propertyName || 'Property';
    if (property !== previousProperty) {
      if (previousProperty) lines.push('');
      lines.push(`${property}:`);
      previousProperty = property;
    }
    const staff = task.assignedTo || 'Unassigned';
    const desc = task.description ? ` (${task.description})` : '';
    const roomTodos = (safeRecurringByRoom[task.roomId] || []).filter((todo) => todo && (todo.status || 'dirty') !== 'clean');
    const todoSuffix = roomTodos.length ? ` | Todo: ${roomTodos.map((todo) => todo.description || 'Recurring cleaning task').join(', ')}` : '';
    lines.push(`• ${task.roomLabel || 'Room'} – ${typeLabel(task.type)}${desc} – Prio ${index + 1} – ${staff}${todoSuffix}`);
  });

  return lines.join('\n').trim();
}

