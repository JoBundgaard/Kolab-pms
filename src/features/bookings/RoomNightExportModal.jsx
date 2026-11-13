import { COLORS } from '../../config/pms.js';
import { PROPERTIES } from '../../config/properties.js';
import { getDateRangeDays, getMonthBounds } from '../../lib/dates.js';
import { formatExportRangeLabel } from '../../lib/roomNightExport.js';
import { Download, X } from 'lucide-react';

const RoomNightExportModal = ({
  isOpen,
  onClose,
  mode,
  onModeChange,
  monthValue,
  onMonthChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onExport,
}) => {
  if (!isOpen) return null;

  const resolvedRange = mode === 'month'
    ? getMonthBounds(monthValue)
    : { startDate, endDate };
  const previewDays = resolvedRange.startDate && resolvedRange.endDate && resolvedRange.endDate >= resolvedRange.startDate
    ? getDateRangeDays(resolvedRange.startDate, resolvedRange.endDate).length
    : 0;
  const canExport = previewDays > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-[#F9F8F2] flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>Export Room Nights</h3>
            <p className="text-sm text-slate-500 mt-1">Downloads one Excel-compatible worksheet per property in your room-night sheet format.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:text-slate-700 hover:bg-white" aria-label="Close export dialog">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onModeChange('month')}
              className={`px-4 py-2 rounded-full border text-sm font-semibold ${mode === 'month' ? 'bg-[#26402E] text-[#E2F05D] border-[#26402E]' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => onModeChange('custom')}
              className={`px-4 py-2 rounded-full border text-sm font-semibold ${mode === 'custom' ? 'bg-[#26402E] text-[#E2F05D] border-[#26402E]' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              Custom Dates
            </button>
          </div>

          {mode === 'month' ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Month</label>
              <input
                type="month"
                value={monthValue}
                onChange={(e) => onMonthChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                />
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Preview</div>
            {canExport ? (
              <>
                <div className="font-semibold text-slate-800">{formatExportRangeLabel(resolvedRange.startDate, resolvedRange.endDate)}</div>
                <div className="text-sm text-slate-500 mt-1">
                  {previewDays} day{previewDays === 1 ? '' : 's'} • one sheet per property ({PROPERTIES.length} sheets)
                </div>
              </>
            ) : (
              <div className="text-sm text-red-600">Choose a valid date range to export.</div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            className={`px-5 py-2.5 rounded-full font-semibold flex items-center gap-2 ${canExport ? 'bg-[#26402E] text-[#E2F05D] hover:bg-[#1e3224]' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
          >
            <Download size={16} />
            Export XLS
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomNightExportModal;
