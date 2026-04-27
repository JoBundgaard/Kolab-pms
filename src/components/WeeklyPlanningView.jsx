import React, { useMemo, useState } from 'react';
import { normalizeHousekeepingTasks } from '../lib/housekeeping';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

function formatWeekRange(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekStart + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const startDay = start.getDate();
  const startMonth = start.toLocaleString('en', { month: 'short' });
  const endDay = end.getDate();
  const endMonth = end.toLocaleString('en', { month: 'short' });
  const year = end.getFullYear();
  if (start.getMonth() === end.getMonth()) return `${startDay}–${endDay} ${endMonth} ${year}`;
  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}

const TYPE_STYLE = {
  checkout: { badge: 'bg-amber-100 text-amber-800', card: 'border-amber-200 bg-amber-50/70' },
  weekly:   { badge: 'bg-sky-100 text-sky-800',    card: 'border-sky-200 bg-sky-50/70' },
  recurring:{ badge: 'bg-violet-100 text-violet-800', card: 'border-violet-200 bg-violet-50/70' },
};

export default function WeeklyPlanningView({
  bookings = [],
  rooms = [],
  overrides = {},
  weekStart,
  onWeekChange,
  onChangeCleaningDay,
}) {
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [moveConfirm, setMoveConfirm] = useState(null); // { taskId, guestName, roomLabel, fromDay, toDay, sourceBookingId }

  const today = new Date().toISOString().slice(0, 10);

  const weekDates = useMemo(() => DAY_KEYS.map((_, i) => addDays(weekStart, i)), [weekStart]);

  const tasksByDay = useMemo(() => {
    return weekDates.map((dateStr) =>
      normalizeHousekeepingTasks({ bookings, rooms, targetDate: dateStr, overrides })
    );
  }, [bookings, rooms, overrides, weekDates]);

  const totalTasks = useMemo(() => tasksByDay.reduce((sum, t) => sum + t.length, 0), [tasksByDay]);

  const handleDragStart = (e, task, dayIndex) => {
    if (task.type !== 'weekly' || !task.sourceBookingId) return;
    setDraggedTask({ ...task, fromDayIndex: dayIndex });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e, dayIndex) => {
    if (!draggedTask) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDay !== dayIndex) setDragOverDay(dayIndex);
  };

  const handleDragLeave = (e, dayIndex) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDay((prev) => (prev === dayIndex ? null : prev));
    }
  };

  const handleDrop = (e, dayIndex) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.fromDayIndex === dayIndex) {
      setDraggedTask(null);
      setDragOverDay(null);
      return;
    }
    setMoveConfirm({
      taskId: draggedTask.id,
      roomLabel: draggedTask.roomLabel,
      propertyName: draggedTask.propertyName,
      sourceBookingId: draggedTask.sourceBookingId,
      fromDay: DAY_KEYS[draggedTask.fromDayIndex],
      toDay: DAY_KEYS[dayIndex],
      fromDayLabel: DAY_SHORT[draggedTask.fromDayIndex],
      toDayLabel: DAY_SHORT[dayIndex],
    });
    setDraggedTask(null);
    setDragOverDay(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverDay(null);
  };

  const confirmMove = () => {
    if (!moveConfirm) return;
    onChangeCleaningDay?.(moveConfirm.sourceBookingId, moveConfirm.toDay);
    setMoveConfirm(null);
  };

  return (
    <div className="space-y-4">
      {/* Confirm modal */}
      {moveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-sm w-full mx-4">
            <div className="font-semibold text-slate-800 text-base mb-1">Move weekly clean?</div>
            <div className="text-sm text-slate-600 mb-4">
              Move <span className="font-semibold">{moveConfirm.roomLabel}</span>
              {moveConfirm.propertyName ? <span className="text-slate-500"> ({moveConfirm.propertyName})</span> : null}
              {' '}weekly cleaning from{' '}
              <span className="font-semibold">{moveConfirm.fromDayLabel}</span> to{' '}
              <span className="font-semibold">{moveConfirm.toDayLabel}</span>?
              <div className="mt-2 text-xs text-slate-500">
                This will update the guest's weekly cleaning day going forward.
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMoveConfirm(null)}
                className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmMove}
                className="px-4 py-2 rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: '#26402E' }}
              >
                Confirm move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs text-slate-500">
          Drag <span className="font-semibold text-sky-700">weekly cleans</span> between days to reschedule ·{' '}
          <span className="font-semibold text-amber-700">Checkout</span> dates are fixed
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => onWeekChange?.('prev')}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
          >
            ← Prev
          </button>
          <span className="text-sm font-semibold text-slate-800 min-w-[170px] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={() => onWeekChange?.('next')}
            className="px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
          >
            Next →
          </button>
        </div>
        <span className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-600">
          {totalTasks} task{totalTasks !== 1 ? 's' : ''} this week
        </span>
      </div>

      {/* 7-day grid */}
      <div className="overflow-x-auto -mx-0">
        <div className="grid grid-cols-7 gap-2 min-w-[700px]">
          {weekDates.map((dateStr, dayIndex) => {
            const dayTasks = tasksByDay[dayIndex];
            const isToday = dateStr === today;
            const isActive = draggedTask && draggedTask.fromDayIndex !== dayIndex;
            const isDropTarget = dragOverDay === dayIndex && isActive;
            const weeklyCount = dayTasks.filter((t) => t.type === 'weekly').length;
            const checkoutCount = dayTasks.filter((t) => t.type === 'checkout').length;

            return (
              <div
                key={dateStr}
                onDragOver={(e) => handleDragOver(e, dayIndex)}
                onDragLeave={(e) => handleDragLeave(e, dayIndex)}
                onDrop={(e) => handleDrop(e, dayIndex)}
                className={[
                  'rounded-xl border p-2 min-h-[200px] flex flex-col transition-colors duration-100',
                  isDropTarget
                    ? 'border-[#26402E] bg-[#E2F05D]/25 shadow-sm'
                    : isToday
                    ? 'border-[#26402E]/30 bg-[#26402E]/[0.04]'
                    : 'border-slate-200 bg-white',
                  isActive && !isDropTarget ? 'border-slate-300' : '',
                ].join(' ')}
              >
                {/* Day header */}
                <div className={`text-center pb-2 mb-2 border-b ${isToday ? 'border-[#26402E]/20' : 'border-slate-100'}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? 'text-[#26402E]' : 'text-slate-500'}`}>
                    {DAY_SHORT[dayIndex]}{isToday ? ' · Today' : ''}
                  </div>
                  <div className={`text-sm font-semibold mt-0.5 ${isToday ? 'text-[#26402E]' : 'text-slate-700'}`}>
                    {formatDayLabel(dateStr)}
                  </div>
                  {dayTasks.length > 0 && (
                    <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                      {checkoutCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                          {checkoutCount} out
                        </span>
                      )}
                      {weeklyCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-800">
                          {weeklyCount} wkly
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Task cards */}
                <div className="flex-1 space-y-1.5">
                  {dayTasks.length === 0 && !isDropTarget && (
                    <div className="text-[11px] text-slate-400 text-center py-6 italic">No cleanings</div>
                  )}

                  {dayTasks.map((task) => {
                    const isDraggable = task.type === 'weekly' && !!task.sourceBookingId;
                    const isBeingDragged = draggedTask?.id === task.id;
                    const style = TYPE_STYLE[task.type] || TYPE_STYLE.recurring;

                    return (
                      <div
                        key={task.id}
                        draggable={isDraggable}
                        onDragStart={(e) => handleDragStart(e, task, dayIndex)}
                        onDragEnd={handleDragEnd}
                        title={
                          isDraggable
                            ? 'Drag to move cleaning to another day'
                            : task.type === 'checkout'
                            ? 'Checkout date is fixed – cannot be moved'
                            : ''
                        }
                        className={[
                          'rounded-lg border p-2 text-xs transition-opacity select-none',
                          style.card,
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                          isBeingDragged ? 'opacity-30' : 'opacity-100',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-1">
                          {isDraggable && (
                            <span className="text-slate-400 text-[10px] mt-0.5 leading-none shrink-0">⋮⋮</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-800 truncate">{task.roomLabel}</div>
                            <div className="text-slate-500 truncate text-[10px]">{task.propertyName}</div>
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${style.badge}`}>
                            {task.type === 'checkout' ? 'checkout' : task.type === 'weekly' ? 'weekly' : task.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {isDropTarget && (
                    <div className="border-2 border-dashed border-[#26402E]/50 rounded-lg py-3 text-[11px] text-center text-[#26402E] font-semibold mt-1">
                      Move here →
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
        <span className="font-semibold">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold">
            <span>⋮⋮</span> weekly
          </span>
          draggable — updates recurring cleaning day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">checkout</span>
          fixed to checkout date
        </span>
      </div>
    </div>
  );
}
