import React, { useState } from 'react';

export default function TaskTypeEditor({ task, onUpdateTask }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(task.type);
  const [description, setDescription] = useState(task.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const labels = { checkout: 'Checkout clean', check_room: 'Room check', weekly: 'Weekly clean', custom: 'Custom' };
  return <>
    <button type="button" className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-left" aria-label={`Change cleaning type for ${task.roomLabel}`} onClick={() => { setType(task.type); setDescription(task.description || ''); setError(''); setOpen(true); }}>{labels[task.type] || task.type} ▾</button>
    {open && <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Change cleaning type for ${task.roomLabel}`}>
      <form className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 text-sm text-slate-800" onSubmit={async (event) => {
        event.preventDefault(); setSaving(true); setError('');
        try {
          const result = await onUpdateTask(task.id, { type: type === 'automatic' ? null : type, description: type === 'custom' ? description.trim() : '' }, task);
          if (result === false) throw new Error('Could not save. Please try again.');
          setOpen(false);
        } catch (failure) { setError(failure.message); } finally { setSaving(false); }
      }}>
        <h3 className="text-lg font-semibold">{task.roomLabel} · Cleaning type</h3>
        <p className="text-xs text-slate-500">For {task.dueDate} only. Booking dates stay unchanged. Already published staff assignments keep their existing type and pay; remove a pending assignment and publish it again to apply this change.</p>
        <label className="block">Type<select className="block w-full min-h-11 border rounded-lg mt-1 px-2" value={type} onChange={(event) => setType(event.target.value)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="automatic">Automatic from booking</option>
        </select></label>
        {type === 'custom' && <label className="block">Instructions<textarea autoFocus required maxLength={500} className="block w-full border rounded-lg p-2 mt-1" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Change linen and clean the balcony" /></label>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setOpen(false)} className="min-h-11 px-4 border rounded-lg">Cancel</button><button disabled={saving || (type === 'custom' && !description.trim())} className="min-h-11 px-4 rounded-lg bg-[#26402E] text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>}
  </>;
}
