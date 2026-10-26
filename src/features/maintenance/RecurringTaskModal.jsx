import { COLORS } from '../../config/pms.js';
import { PROPERTIES } from '../../config/properties.js';
import { formatDate } from '../../lib/dates.js';
import { RECURRING_FREQUENCY_OPTIONS } from '../../lib/maintenance.js';
import { Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const RecurringTaskModal = ({ isOpen, onClose, onSave, onDelete, task, prefill, allLocations, defaultMode = 'single' }) => {
  const [formData, setFormData] = useState({
    locationId: allLocations[0]?.id || '',
    description: '',
    frequency: 'monthly',
    nextDue: formatDate(new Date()),
  });
  const [appliesTo, setAppliesTo] = useState(defaultMode); // 'single' | 'multiple'
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setFormData(task);
      setAppliesTo('single');
      setSelectedRooms([]);
    } else {
      const base = {
        locationId: allLocations[0]?.id || '',
        description: '',
        frequency: 'monthly',
        nextDue: formatDate(new Date()),
      };
      setFormData({ ...base, ...(prefill || {}) });
      setAppliesTo(defaultMode);
      setSelectedRooms([]);
    }
    setError('');
  }, [task, prefill, isOpen, allLocations, defaultMode]);

  if (!isOpen) return null;

  const toggleRoom = (id) => {
    setSelectedRooms((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const selectAll = (rooms, enabled) => {
    if (!enabled) {
      setSelectedRooms((prev) => prev.filter((id) => !rooms.includes(id)));
      return;
    }
    setSelectedRooms((prev) => Array.from(new Set([...prev, ...rooms])));
  };

  const clearAll = () => setSelectedRooms([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (appliesTo === 'multiple') {
      if (selectedRooms.length === 0) {
        setError('Select at least one room. Common spaces are not included.');
        return;
      }
      setError('');
      onSave({ ...formData, appliesTo, selectedRoomIds: selectedRooms });
      return;
    }
    setError('');
    onSave({ ...formData, appliesTo: 'single' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div
            className="px-6 py-5 border-b flex justify-between items-center"
            style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}
        >
          <h3 className="font-serif font-bold text-xl text-white">
            {task ? 'Edit Recurring Task' : 'New Recurring Task'}
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5" style={{ backgroundColor: COLORS.cream }}>
          <div className="flex items-center gap-3">
            <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.darkGreen }}>Applies to</label>
            <div className="flex gap-2 text-xs font-semibold">
              <button type="button" onClick={() => setAppliesTo('single')} className={`px-3 py-1.5 rounded-full border ${appliesTo === 'single' ? 'bg-[#E2F05D]/40 border-[#26402E]' : 'bg-white border-slate-200'}`}>Single room</button>
              <button type="button" onClick={() => setAppliesTo('multiple')} className={`px-3 py-1.5 rounded-full border ${appliesTo === 'multiple' ? 'bg-[#E2F05D]/40 border-[#26402E]' : 'bg-white border-slate-200'}`}>Multiple rooms</button>
            </div>
          </div>

          {appliesTo === 'single' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Location</label>
              <select
                name="locationId"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.locationId}
                onChange={handleChange}
              >
                {PROPERTIES.map(prop => (
                  <optgroup key={prop.id} label={prop.name}>
                    {prop.rooms.map(room => (
                      <option key={room.id} value={room.id}>{room.name} (Room)</option>
                    ))}
                    {prop.commonAreas.map(area => (
                      <option key={area.id} value={area.id}>{area.name} ({area.type})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {appliesTo === 'multiple' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.darkGreen }}>Select rooms</label>
                <div className="text-xs text-slate-500">Selected: {selectedRooms.length} rooms</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {PROPERTIES.map((property) => (
                <div className="p-3" key={property.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-slate-800">{property.name}</div>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" className="accent-[#26402E]" checked={property.rooms.every((r) => selectedRooms.includes(r.id)) && property.rooms.length > 0} onChange={(e) => selectAll(property.rooms.map((r) => r.id), e.target.checked)} />
                      All {property.name} rooms
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {property.rooms.map((room) => (
                      <label key={room.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" className="accent-[#26402E]" checked={selectedRooms.includes(room.id)} onChange={() => toggleRoom(room.id)} />
                        {room.name}
                      </label>
                    ))}
                  </div>
                </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Common spaces are excluded from bulk selection.</span>
                <button type="button" onClick={clearAll} className="text-[#26402E] font-semibold">Clear all</button>
              </div>
              {error && <div className="text-xs text-red-600">{error}</div>}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Task Description</label>
            <textarea
              required
              name="description"
              rows="3"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all"
              value={formData.description}
              onChange={handleChange}
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Frequency</label>
              <select
                name="frequency"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.frequency}
                onChange={handleChange}
              >
                {RECURRING_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Next Due Date</label>
              <input
                type="date"
                name="nextDue"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.nextDue}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between gap-3">
            {task && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="px-4 py-2.5 text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-full font-semibold text-sm flex items-center gap-2"
              >
                <Trash2 size={16} /> Delete
              </button>
            ) : <div />}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-full font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full font-medium shadow-sm transition-all transform hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: COLORS.darkGreen, color: COLORS.white }}
              >
                {task ? 'Update Task' : 'Save Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecurringTaskModal;
