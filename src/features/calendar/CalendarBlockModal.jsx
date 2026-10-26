import { COLORS } from '../../config/pms.js';
import { CALENDAR_BLOCK_TYPE_OPTIONS } from '../../lib/calendarBlocks.js';
import { addDays, formatDate } from '../../lib/dates.js';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

const CalendarBlockModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  block,
  rooms,
  isSaving,
}) => {
  const [formData, setFormData] = useState({
    roomId: '',
    startDate: '',
    endDate: '',
    blockType: 'long_term_priority',
    title: '',
    notes: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const startDate = formatDate(block?.startDate || new Date());
    const endDate = formatDate(block?.endDate || addDays(startDate, 1));
    setFormData({
      roomId: block?.roomId || rooms?.[0]?.id || '',
      startDate,
      endDate,
      blockType: block?.blockType || 'long_term_priority',
      title: block?.title || '',
      notes: block?.notes || '',
    });
    setError('');
  }, [block, isOpen, rooms]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.roomId) {
      setError('Select a room.');
      return;
    }
    if (!formData.startDate || !formData.endDate || formData.startDate >= formData.endDate) {
      setError('End date must be after start date.');
      return;
    }

    try {
      await onSave({
        ...block,
        ...formData,
        title: (formData.title || '').trim(),
        notes: (formData.notes || '').trim(),
      });
    } catch (saveError) {
      setError(saveError?.message || 'Could not save PMS block.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-[#F9F8F2] flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>
              {block?.id ? 'Edit PMS Block' : 'Add PMS Block'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">Use this for Airbnb-style blocks and internal notes, without creating a booking.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:text-slate-700 hover:bg-white" aria-label="Close PMS block modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Room</label>
            <select
              value={formData.roomId}
              onChange={(e) => setFormData((prev) => ({ ...prev, roomId: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.propertyName} · {room.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Start Date</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>End Date</label>
              <input
                type="date"
                value={formData.endDate}
                min={formData.startDate || undefined}
                onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
              />
              <div className="text-xs text-slate-500 mt-1">End date is exclusive, same as bookings.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Reason</label>
              <select
                value={formData.blockType}
                onChange={(e) => setFormData((prev) => ({ ...prev, blockType: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
              >
                {CALENDAR_BLOCK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Short Label</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Potential LT guest"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Internal Note</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              rows={4}
              placeholder="Why is this blocked? Who asked for it? Airbnb blocked manually?"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div>
              {block?.id && (
                <button
                  type="button"
                  onClick={() => onDelete(block)}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold text-sm"
                >
                  Delete block
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`px-5 py-2.5 rounded-full font-semibold ${isSaving ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-[#26402E] text-[#E2F05D] hover:bg-[#1e3224]'}`}
              >
                {isSaving ? 'Saving…' : block?.id ? 'Save block' : 'Create block'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CalendarBlockModal;
