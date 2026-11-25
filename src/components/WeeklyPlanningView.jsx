import React, { useMemo, useState } from 'react';
import TaskOrderControls from './TaskOrderControls.jsx';
import TaskTypeEditor from './TaskTypeEditor.jsx';
import { normalizeHousekeepingTasks } from '../lib/housekeeping';
import { downloadWeeklyHousekeepingImage } from '../lib/weeklyHousekeepingExport';

import { reorderWeeklyTasks, sortWeeklyTasks, weeklyOrderKey } from '../lib/weeklyPlanningOrder.js';

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
  check_room: { badge: 'bg-emerald-100 text-emerald-800', card: 'border-emerald-200 bg-emerald-50/70' },
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
  onUpdateTask,
}) {
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const handleExport = async (mode) => {
    if (!mode || exporting) return;
    setExporting(true);
    setExportMessage('');
    try {
      await downloadWeeklyHousekeepingImage({ tasksByDay, dates: weekDates, rangeLabel: formatWeekRange(weekStart), mode });
      setExportMessage('Calendar image downloaded.');
    } catch (error) {
      setExportMessage(error.message || 'Image export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [moveConfirm, setMoveConfirm] = useState(null); // { taskId, guestName, roomLabel, fromDay, toDay, sourceBookingId }

  const today = new Date().toISOString().slice(0, 10);

  const weekDates = useMemo(() => DAY_KEYS.map((_, i) => addDays(weekStart, i)), [weekStart]);

  const planningTasksByDay = useMemo(() => {
    return weekDates.map((dateStr) =>
      sortWeeklyTasks(normalizeHousekeepingTasks({ bookings, rooms, targetDate: dateStr, overrides, includeSkipped: true }), overrides[weeklyOrderKey(dateStr)]?.taskOrder)
    );
  }, [bookings, rooms, overrides, weekDates]);

  const tasksByDay = useMemo(() => planningTasksByDay.map((tasks) => tasks.filter((task) => !task.skipped)), [planningTasksByDay]);

  const totalTasks = useMemo(() => tasksByDay.reduce((sum, t) => sum + t.length, 0), [tasksByDay]);

  const requestMove = (task, dayIndex, targetId = null) => {
    if (task && dayIndex === task.fromDayIndex) {
      const date = weekDates[dayIndex];
      onUpdateTask?.(weeklyOrderKey(date), {
        taskOrder: reorderWeeklyTasks(tasksByDay[dayIndex], task.id, targetId),
      });
    }

    if (task?.scheduledType === 'weekly' && task.sourceBookingId && dayIndex !== null && task.fromDayIndex !== dayIndex) {
      setMoveConfirm({
        taskId: task.id,
        roomLabel: task.roomLabel,
        propertyName: task.propertyName,
        sourceBookingId: task.sourceBookingId,
        fromDay: DAY_KEYS[task.fromDayIndex],
        toDay: DAY_KEYS[dayIndex],
        fromDayLabel: DAY_SHORT[task.fromDayIndex],
        toDayLabel: DAY_SHORT[dayIndex],
      });
    }
    setDraggedTask(null);
    setDragOverDay(null);
    setDropTargetId(null);
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
          Drag a handle or tap arrows to reorder a day. Default: Townhouse → Neighbours → Roamr. Drag between days or use “Move to…” on <span className="font-semibold text-sky-700">weekly cleans</span> to reschedule ·{' '}
          <span className="font-semibold text-amber-700">Checkout</span> dates are fixed. Skip a cleaning for this date only; restore it below the day’s schedule.
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

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-700" htmlFor="weekly-image-export">Export weekly calendar</label>
        <select
          id="weekly-image-export"
          value=""
          disabled={exporting}
          onChange={(event) => handleExport(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 disabled:opacity-50"
        >
          <option value="" disabled>{exporting ? 'Creating image…' : 'Download image…'}</option>
          <option value="housekeeping">Housekeeping — full schedule</option>
          <option value="community">Community — long-term guests & names</option>
        </select>
        <span className="text-xs text-slate-500">PNG · Selected week · Community export shows long-term weekly cleans only.</span>
        <span role="status" className="text-xs text-slate-600">{exportMessage}</span>
      </div>

      {/* 7-day grid */}
      <div data-order-scope data-order-scroll className="overflow-x-auto -mx-0">
        <div className="grid grid-cols-7 gap-2 min-w-[1540px]">
          {weekDates.map((dateStr, dayIndex) => {
            const dayTasks = tasksByDay[dayIndex];
            const isToday = dateStr === today;
            const isActive = draggedTask && (draggedTask.fromDayIndex === dayIndex || (draggedTask.scheduledType === 'weekly' && !!draggedTask.sourceBookingId));
            const isDropTarget = dragOverDay === dayIndex && isActive;
            const weeklyCount = dayTasks.filter((t) => t.type === 'weekly').length;
            const checkoutCount = dayTasks.filter((t) => t.type === 'checkout').length;
            const checkRoomCount = dayTasks.filter((t) => t.type === 'check_room').length;

            return (
              <div
                key={dateStr}
                data-order-group={dayIndex}
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
                  {overrides[weeklyOrderKey(dateStr)]?.taskOrder?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onUpdateTask?.(weeklyOrderKey(dateStr), { taskOrder: [] })}
                      className="mt-1 text-[10px] text-slate-600 underline"
                    >Reset order</button>
                  )}
                  {dayTasks.length > 0 && (
                    <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                      {checkoutCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                          {checkoutCount} out
                        </span>
                      )}
                      {checkRoomCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                          {checkRoomCount} check
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
                    const canReschedule = task.scheduledType === 'weekly' && !!task.sourceBookingId;
                    const isBeingDragged = draggedTask?.id === task.id;
                    const isInsertionTarget = dragOverDay === dayIndex && dropTargetId === task.id && !isBeingDragged;
                    const style = TYPE_STYLE[task.type] || TYPE_STYLE.recurring;

                    return (
                      <div
                        key={task.id}
                        data-order-task={task.id}
                        title="Drag to reorder within this day; weekly cleans can also move between days"
                        className={[
                          'rounded-lg border p-2 text-xs transition-opacity select-none',
                          style.card,
                          isInsertionTarget ? 'border-t-4 border-t-[#26402E]' : '',
                          isBeingDragged ? 'opacity-30' : 'opacity-100',
                        ].join(' ')}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-1">
                          <div className="min-w-0">
                            <div className="text-[28px] leading-tight font-bold tracking-tight text-slate-900 break-words">{task.roomLabel}</div>
                            <div className="mt-0.5 text-slate-500 text-[11px]">{task.propertyName}</div>
                          </div>
                          <TaskOrderControls task={task} tasks={dayTasks} group={dayIndex}
                            onMove={(targetId, group) => requestMove({ ...task, fromDayIndex: dayIndex }, Number(group), targetId)}
                            onPreview={(target) => {
                              setDraggedTask(target ? { ...task, fromDayIndex: dayIndex } : null);
                              setDragOverDay(target ? Number(target.group) : null);
                              setDropTargetId(target?.targetId || null);
                            }} />
                        </div>
                        <div className="mt-2">
                          <TaskTypeEditor task={task} onUpdateTask={onUpdateTask} compact />
                          {task.description && <p className="mt-1 text-slate-600 whitespace-normal">{task.description}</p>}
                        </div>
                        {(canReschedule || onUpdateTask) && (
                          <details className="mt-2 border-t border-slate-200/70 pt-1 text-slate-600">
                            <summary className="min-h-11 flex items-center cursor-pointer text-[11px] font-medium hover:text-slate-900">More actions ▾<span className="sr-only"> for {task.roomLabel} on {dateStr}</span></summary>
                            {canReschedule && (
                              <select
                                aria-label={`Move ${task.roomLabel} weekly cleaning to another day`}
                                value=""
                                onChange={(e) => requestMove({ ...task, fromDayIndex: dayIndex }, Number(e.target.value))}
                                onDragStart={(e) => e.stopPropagation()}
                                className="mt-2 min-h-11 w-full rounded border border-sky-200 bg-white text-xs text-slate-700"
                              >
                                <option value="" disabled>Move to…</option>
                                {DAY_SHORT.map((day, index) => index !== dayIndex && (
                                  <option key={day} value={index}>{day}</option>
                                ))}
                              </select>
                            )}
                            {onUpdateTask && (
                              <button
                                type="button"
                                onClick={() => onUpdateTask(task.id, { skipped: true })}
                                className="mt-1 min-h-11 text-xs text-slate-600 underline"
                                aria-label={`Skip ${task.roomLabel} cleaning on ${dateStr}`}
                              >Skip this cleaning</button>
                            )}
                          </details>
                        )}
                      </div>
                    );
                  })}

                  {planningTasksByDay[dayIndex].filter((task) => task.skipped).map((task) => (
                    <div key={task.id} className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
                      <div className="font-semibold">{task.roomLabel} · Skipped</div>
                      <div>{task.guestName}</div>
                      <button
                        type="button"
                        onClick={() => onUpdateTask?.(task.id, { skipped: false })}
                        className="min-h-11 underline text-slate-700"
                        aria-label={`Restore ${task.roomLabel} cleaning on ${dateStr}`}
                      >Restore cleaning</button>
                    </div>
                  ))}

                  {isDropTarget && (
                    <div className="border-2 border-dashed border-[#26402E]/50 rounded-lg py-3 text-[11px] text-center text-[#26402E] font-semibold mt-1">
                      {draggedTask?.fromDayIndex === dayIndex ? 'Drop to reorder' : 'Move here →'}
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
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">Check room</span>
          arrival without a same-day checkout
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold">
            <span>⋮⋮</span> weekly
          </span>
          drag within a day to reorder; between days to reschedule
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">checkout</span>
          fixed to checkout date
        </span>
      </div>
    </div>
  );
}
