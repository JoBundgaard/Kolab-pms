const LABELS = { checkout: 'Checkout clean', weekly: 'Weekly clean', check_room: 'Check room', recurring: 'Recurring clean' };
const COLORS = { checkout: '#fff2d7', weekly: '#e7f2ff', check_room: '#e7f5ec', recurring: '#f1eafd' };

// Community images contain only long-term weekly cleans and public schedule details.
export function buildWeeklyExportDays(tasksByDay, mode) {
  return tasksByDay.map((tasks) => tasks
    .filter((task) => mode !== 'community' || (task.type === 'weekly' && (task.stayCategory === 'long' || task.isLongTerm)))
    .map((task) => mode === 'community' ? {
      roomLabel: task.roomLabel,
      propertyName: task.propertyName,
      guestName: task.guestName || 'Guest',
      type: 'weekly',
    } : { ...task })
    .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || `${a.propertyName} ${a.roomLabel}`.localeCompare(`${b.propertyName} ${b.roomLabel}`)));
}

function wrappedLines(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/)) {
    if (!word) continue;
    if (line && ctx.measureText(`${line} ${word}`).width <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    // Only split a word when it cannot fit on an empty line.
    for (const character of Array.from(word)) {
      if (line && ctx.measureText(line + character).width > width) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

export function createWeeklyHousekeepingCanvas({ days, dates, rangeLabel, mode, document: doc = document }) {
  const community = mode === 'community';
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  const width = 2240, margin = 48, gap = 14;
  const columnWidth = (width - margin * 2 - gap * 6) / 7;
  const textWidth = columnWidth - 36;
  const font = (bold = false, size = 20) => { ctx.font = `${bold ? '600' : '400'} ${size}px Arial, sans-serif`; };
  const layout = days.map((tasks) => tasks.map((task) => {
    const fields = [
      [task.roomLabel, true, 24],
      [task.propertyName, false, 18],
      [task.guestName || 'Guest', true, 21],
      [LABELS[task.type] || task.type, false, 19],
    ];
    if (!community) {
      fields.push([`Priority ${task.priority ?? 3} · ${task.status === 'clean' ? 'Done' : task.status || 'To do'}`, false, 18]);
      fields.push([`Staff: ${task.assignedTo || 'Unassigned'}`, false, 18]);
      if (task.type === 'checkout') fields.push([`Checkout: ${task.checkOutTime || '12:00'}`, false, 18]);
      if (task.type === 'check_room') fields.push([`Check-in: ${task.checkInTime || '15:00'}`, false, 18]);
      if (task.description) fields.push([task.description, false, 18]);
    }
    const lines = fields.flatMap(([text, bold, size]) => {
      font(bold, size);
      return wrappedLines(ctx, text, textWidth).map((line) => ({ text: line, bold, size }));
    });
    return { task, lines, height: lines.reduce((sum, line) => sum + line.size + 8, 0) + 32 };
  }));
  const contentHeight = Math.max(260, ...layout.map((cards) => cards.reduce((sum, card) => sum + card.height + 14, 0) + 24));
  canvas.width = width;
  canvas.height = 260 + contentHeight + 90;
  ctx.fillStyle = '#f9f8f2';
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = '#26402e'; font(true, 38);
  ctx.fillText(community ? 'Kolab · Weekly room cleaning' : 'Kolab · Housekeeping schedule', margin, 68);
  font(false, 24); ctx.fillText(rangeLabel, margin, 108);
  font(false, 20); ctx.fillStyle = '#526358';
  ctx.fillText(community ? 'Long-term guests · Your scheduled weekly clean' : 'Checkout cleans · Room checks · Weekly cleans', margin, 146);
  const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  layout.forEach((cards, index) => {
    const x = margin + index * (columnWidth + gap);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 180, columnWidth, contentHeight + 80);
    ctx.fillStyle = '#26402e'; ctx.fillRect(x, 180, columnWidth, 76);
    ctx.fillStyle = '#ffffff'; font(true, 21); ctx.fillText(dayNames[index], x + 18, 211);
    const date = new Date(`${dates[index]}T00:00:00`);
    font(false, 19); ctx.fillText(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), x + 18, 240);
    let y = 272;
    if (!cards.length) {
      font(false, 18); ctx.fillStyle = '#718078';
      ctx.fillText(community ? 'No scheduled cleans' : 'No scheduled tasks', x + 18, y + 26);
    }
    cards.forEach(({ task, lines, height }) => {
      ctx.fillStyle = COLORS[task.type] || '#f1eafd'; ctx.fillRect(x + 8, y, columnWidth - 16, height);
      let baseline = y + 29;
      lines.forEach(({ text, bold, size }) => {
        font(bold, size); ctx.fillStyle = '#263b30'; ctx.fillText(text, x + 18, baseline);
        baseline += size + 8;
      });
      y += height + 14;
    });
  });
  font(false, 18); ctx.fillStyle = '#526358';
  ctx.fillText(community ? 'Kolab Living · Thank you for making your room accessible on your cleaning day.' : 'Kolab Living · Schedule for the selected week', margin, canvas.height - 30);
  return canvas;
}

export async function downloadWeeklyHousekeepingImage({ tasksByDay, dates, rangeLabel, mode }) {
  await document.fonts?.ready;
  const days = buildWeeklyExportDays(tasksByDay, mode);
  const canvas = createWeeklyHousekeepingCanvas({ days, dates, rangeLabel, mode });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the calendar image.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kolab-${mode === 'community' ? 'community-cleaning' : 'housekeeping'}-${dates[0]}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
