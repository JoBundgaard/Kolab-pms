import { COLORS } from '../../config/pms.js';
import { db } from '../../firebase.js';
import { formatDate } from '../../lib/dates.js';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const CustomDatePicker = ({ label, value, onChange, blockedDates = new Set(), minDate, boundaryRef }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [position, setPosition] = useState('bottom'); // 'bottom' | 'top'
  const [align, setAlign] = useState('left'); // 'left' | 'right' | 'full'

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [db]);

  const repositionDropdown = useCallback(() => {
    if (!isOpen || !containerRef.current || !dropdownRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const boundaryRect = boundaryRef?.current?.getBoundingClientRect();
    const bound = boundaryRect || { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };

    const spaceBelow = bound.bottom - containerRect.bottom;
    const spaceAbove = containerRect.top - bound.top;
    const spaceRight = bound.right - containerRect.right;
    const spaceLeft = containerRect.left - bound.left;

    const dropdownHeight = dropdownRect.height || 320;
    const nextPosition = spaceBelow < dropdownHeight + 12 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const isMobile = bound.width < 768;
    const nextAlign = isMobile
      ? 'full'
      : spaceRight < dropdownRect.width && spaceLeft > spaceRight
        ? 'right'
        : 'left';

    setPosition(nextPosition);
    setAlign(nextAlign);
  }, [isOpen]);

  useEffect(() => {
    repositionDropdown();
    if (isOpen) {
      containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isOpen, viewDate, repositionDropdown]);

  useEffect(() => {
    window.addEventListener('resize', repositionDropdown);
    return () => window.removeEventListener('resize', repositionDropdown);
  }, [repositionDropdown]);

  const handlePrevMonth = (e) => {
    e.preventDefault();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.preventDefault();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateClick = (dateStr) => {
    if (blockedDates.has(dateStr)) return;
    onChange({ target: { value: dateStr } });
    setIsOpen(false);
  };

  const generateCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay() || 7;
    const startOffset = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = formatDate(dateObj);
      const isBlocked = blockedDates.has(dateStr);
      const isSelected = value === dateStr;
      const isPast = minDate && dateStr < minDate;
      const isDisabled = isBlocked || isPast;

      days.push(
        <button
          key={dateStr}
          type="button"
          disabled={isDisabled}
          onClick={() => handleDateClick(dateStr)}
          className={`
            p-2 w-8 h-8 flex items-center justify-center rounded-full text-xs font-medium transition-colors
            ${isSelected ? 'bg-[#26402E] text-[#E2F05D]' : ''}
            ${!isSelected && !isDisabled ? 'hover:bg-slate-100 text-slate-700' : ''}
            ${isBlocked ? 'bg-red-100 text-red-400 cursor-not-allowed line-through' : ''}
            ${isPast && !isBlocked ? 'text-slate-300 cursor-not-allowed' : ''}
          `}
          title={isBlocked ? 'Booked' : ''}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>{label}</label>
      <div
        className="w-full px-4 py-3 border border-slate-200 rounded-xl flex items-center justify-between bg-white cursor-pointer hover:border-[#E2F05D] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={!value ? 'text-slate-400' : 'text-slate-800'}>
          {value ? new Date(value).toLocaleDateString() : 'Select Date'}
        </span>
        <Calendar size={18} className="text-slate-400" />
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute z-[60] p-4 bg-white rounded-xl shadow-xl border border-slate-100 w-full sm:w-auto max-w-xs sm:max-w-sm md:max-w-md max-h-[340px] overflow-y-auto ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          style={{
            left: align === 'right' ? 'auto' : 0,
            right: align === 'right' ? 0 : 'auto',
            ...(align === 'full' ? { left: 0, right: 0 } : {}),
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={16}/></button>
            <span className="text-sm font-bold text-slate-700">
              {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16}/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {generateCalendar()}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center text-[10px] text-slate-500">
             <div className="w-3 h-3 bg-red-100 rounded-full mr-2"></div> Booked
             <div className="w-3 h-3 bg-[#26402E] rounded-full ml-3 mr-2"></div> Selected
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
