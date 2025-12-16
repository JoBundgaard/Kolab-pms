import React, { useMemo, useState } from 'react';

export function buildHousekeepingWhatsappMessage({ tasks = [], selectedDate }) {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const dateLabel = (() => {
    if (!selectedDate) return 'Unknown date';
    const d = new Date(selectedDate);
    if (isNaN(d.getTime())) return selectedDate;
    const day = `${d.getDate()}`.padStart(2, '0');
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  })();

  const relevant = safeTasks.filter((t) => (t?.status || 'dirty') !== 'clean');
  if (relevant.length === 0) {
    return `Housekeeping plan (${dateLabel})\n\nAll clear.`;
  }

  const typeLabel = (type) => {
    if (type === 'checkout') return 'Checkout clean';
    if (type === 'weekly') return 'Weekly clean';
    if (type === 'touchup') return 'Touch-up';
    return type || 'Task';
  };

  const grouped = relevant.reduce((acc, task) => {
    const prop = task.propertyName || 'Property';
    if (!acc[prop]) acc[prop] = [];
    acc[prop].push(task);
    return acc;
  }, {});

  const propertyNames = Object.keys(grouped).sort();
  const lines = [`Housekeeping plan (${dateLabel})`, ''];

  propertyNames.forEach((prop) => {
    lines.push(`${prop}:`);
    grouped[prop].forEach((task) => {
      const prio = task.priority ?? '-';
      const staff = task.assignedTo || 'Unassigned';
      lines.push(`• ${task.roomLabel || 'Room'} – ${typeLabel(task.type)} – Prio ${prio} – ${staff}`);
    });
    lines.push('');
  });

  return lines.join('\n').trim();
}

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
  staffOptions = [],
  selectedDate,
  setSelectedDate,
  checkins = [],
  checkouts = [],
}) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const [copyStatus, setCopyStatus] = useState('idle');
  const [showPreview, setShowPreview] = useState(false);

  const message = useMemo(
    () => buildHousekeepingWhatsappMessage({ tasks: safeTasks, selectedDate }),
    [safeTasks, selectedDate]
  );

  const handleStatus = (id, status) => {
    if (!onUpdateTask) return;
    onUpdateTask(id, { status });
  };

  const handleAssign = (id, staff) => {
    if (!onUpdateTask) return;
    onUpdateTask(id, { assignedTo: staff || null });
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
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-white">Check-ins: {checkins.length}</span>
          <span className="px-2 py-1 rounded-full border border-slate-200 bg-white">Check-outs: {checkouts.length}</span>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safeTasks.map((task) => {
                  const statusKey = task.status || 'dirty';
                  const statusClass = statusStyle[statusKey] || statusStyle.dirty;
                  return (
                    <tr key={task.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{task.roomLabel || 'Room'}</div>
                        <div className="text-xs text-slate-500">{task.propertyName || 'Property'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700 uppercase">{task.type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusClass}`}>
                          {statusLabel[statusKey] || statusKey}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{task.priority ?? '-'}</td>
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
                      <td className="px-4 py-3 text-right space-x-2">
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
