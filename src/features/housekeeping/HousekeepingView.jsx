import HousekeepingErrorBoundary from '../../components/common/HousekeepingErrorBoundary.jsx';
import HousekeepingTaskManager from '../../components/HousekeepingTaskManager.jsx';
import WeeklyPlanningView from '../../components/WeeklyPlanningView.jsx';
import { COLORS, ENABLE_HOUSEKEEPING_V2, STAFF } from '../../config/pms.js';
import { ALL_ROOMS, PROPERTIES } from '../../config/properties.js';
import { addDays, formatDate, getWeekMonday } from '../../lib/dates.js';
import { RECURRING_FREQUENCY_OPTIONS, getFrequencyLabel } from '../../lib/maintenance.js';
import { CheckCircle, Sunrise } from 'lucide-react';
import React from 'react';

export default function HousekeepingView({
  checkinsForDate,
  checkoutsForDate,
  cleaningTasks,
  expandedHousekeepingBookings,
  expandedRecurringCleaningGroups,
  handleChangeWeeklyCleaningDay,
  handleCompleteRecurringRoomTodo,
  handleCreateRecurringCleaningTask,
  handleDeleteRecurringCleaningTask,
  handleHousekeepingTaskUpdate,
  handleSkipRecurringRoomTodo,
  housekeepingDate,
  housekeepingOverrides,
  housekeepingStartTime,
  housekeepingTasks,
  housekeepingView,
  markRoomClean,
  recurringCleaningDraft,
  recurringCleaningTasks,
  recurringDueByRoomId,
  setExpandedRecurringCleaningGroups,
  setHousekeepingDate,
  setHousekeepingStartTime,
  setHousekeepingView,
  setRecurringCleaningDraft,
  setWeekPlanningStart,
  updateHousekeepingField,
  weekPlanningStart,
}) {
  return (<div className="space-y-6">
      <div><h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Cleaning Task Manager</h2></div>
      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-800">Recurring Cleaning Tasks</div>
            <div className="text-xs text-slate-500">Auto-adds to daily cleaning tasks when next due date is reached.</div>
          </div>
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-600">{recurringCleaningTasks.length} template{recurringCleaningTasks.length === 1 ? '' : 's'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div className="md:col-span-2 border border-slate-200 rounded-lg p-2 bg-white">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setRecurringCleaningDraft((prev) => ({ ...prev, selectedRoomIds: ALL_ROOMS.map((r) => r.id) }))}
                className="px-2 py-1 rounded-full text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              >
                All rooms
              </button>
              {PROPERTIES.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => setRecurringCleaningDraft((prev) => ({ ...prev, selectedRoomIds: property.rooms.map((r) => r.id) }))}
                  className="px-2 py-1 rounded-full text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                >
                  All {property.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRecurringCleaningDraft((prev) => ({ ...prev, selectedRoomIds: [] }))}
                className="px-2 py-1 rounded-full text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
            <select
              multiple
              value={recurringCleaningDraft.selectedRoomIds || []}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setRecurringCleaningDraft((prev) => ({ ...prev, selectedRoomIds: values }));
              }}
              className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm bg-white min-h-[112px]"
            >
              {ALL_ROOMS.map((room) => (
                <option key={room.id} value={room.id}>{room.name} ({room.propertyName})</option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-slate-500">
              Selected: {(recurringCleaningDraft.selectedRoomIds || []).length}
            </div>
          </div>
          <input
            type="text"
            placeholder="Task description"
            value={recurringCleaningDraft.description}
            onChange={(e) => setRecurringCleaningDraft((prev) => ({ ...prev, description: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white md:col-span-2"
          />
          <select
            value={recurringCleaningDraft.frequency}
            onChange={(e) => setRecurringCleaningDraft((prev) => ({ ...prev, frequency: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          >
            {RECURRING_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={recurringCleaningDraft.nextDue}
            onChange={(e) => setRecurringCleaningDraft((prev) => ({ ...prev, nextDue: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          />
          <button
            onClick={() => handleCreateRecurringCleaningTask()}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-[#26402E] bg-[#E2F05D]/50 text-[#26402E] hover:bg-[#E2F05D]"
          >
            Add recurring
          </button>
        </div>

        {recurringCleaningTasks.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Frequency</th>
                  <th className="px-3 py-2">Next due</th>
                  <th className="px-3 py-2 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(
                  recurringCleaningTasks.reduce((acc, task) => {
                    const key = (task.description || 'Untitled task').trim().toLowerCase();
                    if (!acc[key]) acc[key] = { label: task.description || 'Untitled task', tasks: [] };
                    acc[key].tasks.push(task);
                    return acc;
                  }, {})
                )
                  .sort((a, b) => a[1].label.localeCompare(b[1].label))
                  .map(([key, group]) => {
                    const isExpanded = !!expandedRecurringCleaningGroups[key];
                    const sortedTasks = [...group.tasks].sort((a, b) => {
                      const aDue = formatDate(a.nextDue);
                      const bDue = formatDate(b.nextDue);
                      if (aDue !== bDue) return aDue.localeCompare(bDue);
                      return (a.roomName || '').localeCompare(b.roomName || '');
                    });
                    return (
                      <React.Fragment key={key}>
                        <tr className="bg-slate-50/60">
                          <td className="px-3 py-2 text-slate-800 font-semibold">
                            <button
                              type="button"
                              onClick={() => setExpandedRecurringCleaningGroups((prev) => ({ ...prev, [key]: !isExpanded }))}
                              className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900"
                            >
                              <span className="text-slate-400">{isExpanded ? '▾' : '▸'}</span>
                              <span>{group.label}</span>
                              <span className="text-xs text-slate-500">({group.tasks.length})</span>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{isExpanded ? 'Room-specific entries' : 'Collapsed'}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{isExpanded ? '' : ''}</td>
                          <td className="px-3 py-2 text-right"></td>
                        </tr>
                        {isExpanded &&
                          sortedTasks.map((task) => (
                            <tr key={task.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-700">
                                {task.roomName || ALL_ROOMS.find((r) => r.id === task.roomId)?.name || task.roomId}
                                <span className="text-xs text-slate-500"> · {task.propertyName || ''}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-600">{getFrequencyLabel(task.frequency)}</td>
                              <td className="px-3 py-2 text-slate-600">{formatDate(task.nextDue)}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => handleDeleteRecurringCleaningTask(task.id)}
                                  className="px-2.5 py-1 rounded-full border border-red-200 text-red-700 text-xs font-semibold bg-white hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setHousekeepingView('daily')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${housekeepingView === 'daily' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Daily tasks
        </button>
        <button
          onClick={() => {
            setHousekeepingView('weekly');
            setWeekPlanningStart(getWeekMonday(housekeepingDate || new Date()));
          }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${housekeepingView === 'weekly' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Weekly planning
        </button>
      </div>

      {housekeepingView === 'weekly' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-4">
          <div className="mb-4">
            <div className="font-semibold text-slate-800">Weekly Planning</div>
            <div className="text-xs text-slate-500">Overview of the week ahead. Drag weekly cleans to reschedule — the guest's cleaning day updates automatically.</div>
          </div>
          <WeeklyPlanningView
            bookings={expandedHousekeepingBookings}
            rooms={ALL_ROOMS}
            overrides={housekeepingOverrides}
            weekStart={weekPlanningStart}
            onWeekChange={(dir) =>
              setWeekPlanningStart((prev) => addDays(prev, dir === 'next' ? 7 : -7))
            }
            onChangeCleaningDay={handleChangeWeeklyCleaningDay}
          />
        </div>
      ) : ENABLE_HOUSEKEEPING_V2 ? (
        <HousekeepingErrorBoundary>
          <HousekeepingTaskManager
            tasks={housekeepingTasks}
            onUpdateTask={handleHousekeepingTaskUpdate}
            recurringDueByRoomId={recurringDueByRoomId}
            onCompleteRecurringTodo={handleCompleteRecurringRoomTodo}
            onSkipRecurringTodo={handleSkipRecurringRoomTodo}
            staffOptions={STAFF}
            selectedDate={housekeepingDate}
            setSelectedDate={setHousekeepingDate}
            cleaningStartTime={housekeepingStartTime}
            setCleaningStartTime={setHousekeepingStartTime}
            checkins={checkinsForDate}
            checkouts={checkoutsForDate}
          />
        </HousekeepingErrorBoundary>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#26402E] text-white text-xs uppercase font-bold tracking-wider">
                <tr><th className="px-6 py-4 w-12">Prio</th><th className="px-6 py-4">Room</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Staff</th><th className="px-6 py-4">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(!cleaningTasks || cleaningTasks.length === 0) ? <tr><td colSpan="5" className="px-6 py-12 text-center text-green-600 bg-green-50/50">All rooms are clean!</td></tr> : cleaningTasks.map((task) => (
                  <tr key={task.roomId} className={`hover:bg-[#F9F8F2] ${task.isEarlyCheckinPrep ? 'bg-orange-50/50' : task.status === 'checkout_dirty' ? 'bg-yellow-50/50' : ''}`}>
                    <td className="px-6 py-4 text-center"><input type="number" min="1" max="99" value={task.priority} onChange={(e) => updateHousekeepingField(task.roomId, 'priority', Number(e.target.value))} className="w-12 text-center border rounded"/></td>
                    <td className="px-6 py-4 font-bold text-slate-700">{task.roomName}<div className="text-xs font-normal opacity-60">{task.propertyName}</div>{task.isEarlyCheckinPrep && <div className="text-xs font-bold text-orange-600 flex items-center mt-1"><Sunrise size={14} className="mr-1"/> EARLY CHECK-IN</div>}{task.isLongTermCleaning && <div className="text-[11px] font-bold text-blue-700 flex items-center mt-1">Weekly service clean</div>}</td>
                    <td className="px-6 py-4"><span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100">{task.status}</span></td>
                    <td className="px-6 py-4"><select value={task.assignedStaff} onChange={(e) => updateHousekeepingField(task.roomId, 'assignedStaff', e.target.value)} className="border rounded px-2 py-1">{STAFF.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                    <td className="px-6 py-4"><button onClick={() => markRoomClean(task.roomId)} className="px-4 py-2 rounded-full text-sm font-bold flex items-center shadow-md" style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}><CheckCircle size={16} className="mr-2"/> Mark Clean</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>);
}
