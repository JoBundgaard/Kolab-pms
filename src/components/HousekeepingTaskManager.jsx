import { buildHousekeepingWhatsappMessage } from '../lib/housekeepingWhatsapp.js';
import React, { useMemo, useState } from 'react';
import TaskOrderControls from './TaskOrderControls.jsx';
import TaskTypeEditor from './TaskTypeEditor.jsx';
import { sortWeeklyTasks, reorderWeeklyTasks, weeklyOrderKey } from '../lib/weeklyPlanningOrder.js';


const statusLabel = {
  dirty: 'Dirty',
  in_progress: 'In progress',
  clean: 'Clean',
};

const statusStyle = {
  dirty: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  clean: 'bg-green-50 text-green-700 border-green-200',
};

export default function HousekeepingTaskManager({
  tasks = [],
  onUpdateTask,
  overrides = {},
  recurringDueByRoomId = {},
  onCompleteRecurringTodo,
  onSkipRecurringTodo,
  staffOptions = [],
  selectedDate,
  setSelectedDate,
  cleaningStartTime = '',
  setCleaningStartTime,
  checkins = [],
  checkouts = [],
}) {
  const safeTasks = useMemo(() => Array.isArray(tasks) ? tasks : [], [tasks]);
  const [copyStatus, setCopyStatus] = useState('idle');
  const [showPreview, setShowPreview] = useState(false);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);

  const orderedTasks = useMemo(() => sortWeeklyTasks(safeTasks, overrides[weeklyOrderKey(selectedDate)]?.taskOrder), [safeTasks, overrides, selectedDate]);

  const message = useMemo(
    () => buildHousekeepingWhatsappMessage({ tasks: orderedTasks, recurringDueByRoomId, selectedDate, cleaningStartTime }),
    [orderedTasks, recurringDueByRoomId, selectedDate, cleaningStartTime]
  );

  const handleStatus = (id, status) => {
    if (!onUpdateTask) return;
    const task = orderedTasks.find((t) => t.id === id);
    onUpdateTask(id, { status }, task);
  };

  const handleAssign = (id, staff) => {
    if (!onUpdateTask) return;
    const task = orderedTasks.find((t) => t.id === id);
    onUpdateTask(id, { assignedTo: staff || null }, task);
  };

  const reorderByDrag = (sourceId, targetId) => {
    if (!sourceId || !onUpdateTask) return;
    onUpdateTask(weeklyOrderKey(selectedDate), { taskOrder: reorderWeeklyTasks(orderedTasks, sourceId, targetId) });
  };

  const copyToClipboard = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = message;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('[housekeeping] copy failed', err);
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600 font-semibold" htmlFor="hk-date-picker">Date</label>
          <input
            id="hk-date-picker"
            type="date"
            value={selectedDate || ''}
            onChange={(e) => setSelectedDate && setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600 font-semibold" htmlFor="hk-start-time">Cleaning starts</label>
          <input
            id="hk-start-time"
            type="time"
            value={cleaningStartTime || ''}
            onChange={(e) => setCleaningStartTime && setCleaningStartTime(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-white">Check-ins: {checkins.length}</span>
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-white">Check-outs: {checkouts.length}</span>
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-white">Check rooms: {safeTasks.filter((task) => task.type === 'check_room').length}</span>
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-white">Tasks: {safeTasks.length}</span>
        </div>
        <div className="flex items-center gap-2 text-sm ml-auto">
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 shadow-sm"
          >
            Copy WhatsApp message
          </button>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="px-3 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            {showPreview ? 'Hide preview' : 'Preview message'}
          </button>
          {copyStatus === 'copied' && <span className="text-xs text-emerald-700">Copied ✅</span>}
          {copyStatus === 'failed' && <span className="text-xs text-red-600">Copy failed</span>}
        </div>
      </div>

      {showPreview && (
        <div className="border border-slate-200 rounded-xl bg-slate-50 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Preview</div>
          <textarea
            readOnly
            value={message}
            className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-white"
            rows={Math.min(10, Math.max(4, message.split('\n').length + 1))}
          />
        </div>
      )}

      {safeTasks.length === 0 ? (
        <div className="p-6 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm">All clear for this date.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 text-xs text-slate-600">Drag the handle or tap arrows to set priority. Order is shared with the weekly view.
            <button type="button" className="ml-2 min-h-11 underline" onClick={() => onUpdateTask(weeklyOrderKey(selectedDate), { taskOrder: [] })}>Reset property order</button>
          </div>
          <div className="overflow-x-auto" data-order-scope data-order-scroll>
            <table className="w-full text-left text-sm block md:table">
              <thead className="hidden md:table-header-group bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody data-order-group={selectedDate} className="block md:table-row-group divide-y divide-slate-100">
                {orderedTasks.map((task, index) => {
                  const statusKey = task.status || 'dirty';
                  const statusClass = statusStyle[statusKey] || statusStyle.dirty;
                  const isDragging = dragTaskId === task.id;
                  const isDropTarget = dragOverTaskId === task.id && dragTaskId && dragTaskId !== task.id;
                  const roomRecurringTodos = (recurringDueByRoomId?.[task.roomId] || []).filter(Boolean);
                  return (
                    <tr
                      key={task.id}
                      data-order-task={task.id}
                      className={`grid grid-cols-2 md:table-row hover:bg-slate-50 ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-[#26402E]/30 ring-inset bg-[#E2F05D]/15' : ''}`}
                      title="Drag to reorder cleaning priority"
                    >
                      <td className="col-span-2 px-4 py-3">
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          <TaskOrderControls task={task} tasks={orderedTasks} group={selectedDate}
                            onMove={(targetId) => reorderByDrag(task.id, targetId)}
                            onPreview={(target) => { setDragTaskId(target ? task.id : null); setDragOverTaskId(target?.targetId || null); }} />
                          <span>{task.roomLabel || 'Room'}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {task.propertyName || 'Property'}
                          {task.description ? ` · ${task.description}` : ''}
                        </div>
                        {roomRecurringTodos.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {roomRecurringTodos.map((todo) => (
                              <div key={todo.id} className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                <div className="font-semibold text-slate-700">Todo: {todo.description}</div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onCompleteRecurringTodo && onCompleteRecurringTodo(todo)}
                                    className="px-2 py-1 rounded-full border border-green-200 text-green-800 bg-white hover:bg-green-50 font-semibold text-[10px]"
                                  >
                                    Done
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSkipRecurringTodo && onSkipRecurringTodo(todo)}
                                    className="px-2 py-1 rounded-full border border-amber-200 text-amber-800 bg-white hover:bg-amber-50 font-semibold text-[10px]"
                                  >
                                    Not today
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3"><TaskTypeEditor task={task} onUpdateTask={onUpdateTask} /></td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusClass}`}>
                          {statusLabel[statusKey] || statusKey}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700"><span className="md:hidden">Priority </span>{index + 1}</td>
                      <td className="px-4 py-3">
                        <select
                          value={task.assignedTo || 'Unassigned'}
                          onChange={(e) => handleAssign(task.id, e.target.value)}
                          className="px-3 py-2 rounded-full border border-slate-200 bg-white text-sm"
                        >
                          <option value="Unassigned">Unassigned</option>
                          {staffOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="col-span-2 px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleStatus(task.id, 'in_progress')}
                          className="px-3 py-1.5 rounded-full border border-amber-200 text-amber-800 text-xs font-semibold bg-white hover:bg-amber-50"
                        >
                          Start
                        </button>
                        <button
                          onClick={() => handleStatus(task.id, 'clean')}
                          className="px-3 py-1.5 rounded-full border border-green-200 text-green-800 text-xs font-semibold bg-white hover:bg-green-50"
                        >
                          Mark Clean
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
