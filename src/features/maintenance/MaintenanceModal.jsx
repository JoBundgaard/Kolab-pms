import { COLORS, STAFF } from '../../config/pms.js';
import { PROPERTIES } from '../../config/properties.js';
import { severityMeta } from '../../lib/maintenance.js';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

const MaintenanceModal = ({ isOpen, onClose, onSave, issue, allLocations, isSaving }) => {
  const [formData, setFormData] = useState({
    locationId: allLocations?.[0]?.id || '',
    description: '',
    status: 'open',
    assignedStaff: 'Needs assignment',
    severity: 'normal',
  });
  const [localError, setLocalError] = useState('');
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    if (issue) {
      setFormData(issue);
    } else {
      setFormData(prev => ({
        ...prev,
        locationId: allLocations?.[0]?.id || '',
        description: '',
        status: 'open',
        assignedStaff: 'Needs assignment',
        severity: 'normal',
      }));
    }
    setLocalError('');
    setLastError(null);
  }, [issue, isOpen, allLocations]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    try {
      const locationInfo = allLocations?.find((loc) => loc.id === formData.locationId);
      if (!locationInfo) {
        setLocalError('Could not open report issue form: missing room/area data. Please select a location.');
        console.error('[maintenance-modal] missing location', { formData, allLocations });
        return;
      }

      onSave({
        ...formData,
        locationName: locationInfo.name,
        propertyName: locationInfo.propertyName,
      });
    } catch (err) {
      console.error('[maintenance-modal] submit error', err);
      setLastError(err);
      setLocalError('Could not open report issue form');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  if (!allLocations || allLocations.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="px-6 py-5 border-b" style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}>
            <h3 className="font-serif font-bold text-xl text-white">Could not open report issue form</h3>
          </div>
          <div className="p-6 space-y-3 text-sm" style={{ backgroundColor: COLORS.cream }}>
            <div className="text-slate-700">Locations did not load. Please reload and try again.</div>
            <div className="text-xs text-slate-500">If this persists, check console for errors.</div>
            <div className="pt-3 flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700">Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div
            className="px-6 py-5 border-b flex justify-between items-center"
            style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}
        >
          <h3 className="font-serif font-bold text-xl text-white">
            {issue ? 'Edit Maintenance Issue' : 'Report New Issue'}
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5" style={{ backgroundColor: COLORS.cream }}>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Location</label>
            <select
              name="locationId"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
              value={formData.locationId}
              onChange={handleChange}
              disabled={!allLocations || allLocations.length === 0}
            >
              {(allLocations && allLocations.length > 0 ? PROPERTIES : []).map(prop => (
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
            {!allLocations?.length && (
              <div className="text-xs text-red-600 mt-1">No locations loaded. Please reload.</div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Description</label>
            <textarea
              required
              name="description"
              rows="3"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all"
              value={formData.description}
              onChange={handleChange}
            ></textarea>
            {localError && <div className="text-xs text-red-600 mt-2">{localError}</div>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Status</label>
              <select
                name="status"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="open">Open</option>
                <option value="in-progress">In progress</option>
                <option value="waiting">Waiting (vendor/parts)</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Assigned Staff</label>
              <select
                name="assignedStaff"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.assignedStaff}
                onChange={handleChange}
              >
                {STAFF.map(staff => (
                  <option key={staff} value={staff}>{staff}</option>
                ))}
                <option value="Needs assignment">Needs assignment</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Severity</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'critical', label: 'Critical' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ].map((opt) => {
                const active = formData.severity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, severity: opt.value }))}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${active ? 'border-[#26402E] bg-[#E2F05D]/40 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold" style={{ color: COLORS.darkGreen }}>{opt.label}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${severityMeta(opt.value).dot}`}></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-full font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!allLocations?.length || isSaving}
              className={`px-6 py-2.5 rounded-full font-medium shadow-sm transition-all transform hover:-translate-y-0.5 hover:shadow-md ${(!allLocations?.length || isSaving) ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ backgroundColor: COLORS.darkGreen, color: COLORS.white }}
            >
              {isSaving ? 'Saving…' : issue ? 'Update Issue' : 'Report Issue'}
            </button>
          </div>
          {lastError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">Could not open report issue form. Check console for details.</div>
          )}
        </form>
      </div>
    </div>
  );
};

export default MaintenanceModal;
