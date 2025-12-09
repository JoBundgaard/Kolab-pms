import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  collection, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  setDoc 
} from 'firebase/firestore';
import app, { auth, db } from './firebase';
import { 
  Calendar, 
  Home, 
  Users, 
  CheckCircle, 
  Plus, 
  Search, 
  Menu, 
  X, 
  LogOut, 
  Bed, 
  DollarSign, 
  Clock,
  ChevronLeft,
  ChevronRight,
  User, 
  RefreshCcw,
  AlertTriangle,
  Edit2,
  Trash2,
  Sunrise,
  Wrench,
  ListChecks,
  MessageSquare,
  BarChart2, 
  TrendingUp,
  PieChart,
  FileText, 
  Download
} from 'lucide-react';

// Firebase is initialized once in src/firebase.js and re-used here

// --- Constants & Config ---
const COLORS = {
  darkGreen: '#26402E', 
  lime: '#E2F05D',      
  cream: '#F9F8F2',     
  white: '#FFFFFF',
  textMain: '#26402E',
  textMuted: '#6B7280',
  blocked: '#ef4444',
  blockedBg: '#fee2e2'
};

const DATE_HEADER_HEIGHT = 56; // Keeps sticky offsets aligned for headers

const PROPERTIES = [
  {
    id: 'prop_1',
    name: 'Townhouse',
    rooms: [
      { id: 'T1', name: 'T1', type: 'Double' },
      { id: 'T2', name: 'T2', type: 'Double' },
      { id: 'T3', name: 'T3', type: 'Master' },
      { id: 'T4', name: 'T4', type: 'Single' },
      { id: 'T5', name: 'T5', type: 'Single' },
      { id: 'T6', name: 'T6', type: 'Twin' },
    ],
    commonAreas: [ 
      { id: 'T_Common', name: 'Common Space', type: 'Common' },
      { id: 'T_Other', name: 'Other Area', type: 'Other' },
    ]
  },
  {
    id: 'prop_2',
    name: 'Neighbours',
    rooms: [
      { id: 'N1', name: 'N1', type: 'Studio' },
      { id: 'N2', name: 'N2', type: 'Studio' },
      { id: 'N3', name: 'N3', type: 'Double' },
      { id: 'N4', name: 'N4', type: 'Double' },
      { id: 'N5', name: 'N5', type: 'Shared' },
      { id: 'N6', name: 'N6', type: 'Shared' },
      { id: 'N7', name: 'N7', type: 'Suite' },
    ],
    commonAreas: [ 
      { id: 'N_Common', name: 'Common Space', type: 'Common' },
      { id: 'N_Rooftop', name: 'Rooftop', type: 'Rooftop' },
      { id: 'N_Other', name: 'Other Area', type: 'Other' },
    ]
  }
];

const ALL_ROOMS = PROPERTIES.flatMap(p => p.rooms.map(r => ({ ...r, propertyId: p.id, propertyName: p.name })));

const ALL_LOCATIONS = PROPERTIES.flatMap(p => [
  ...p.rooms.map(r => ({ ...r, propertyId: p.id, propertyName: p.name, locationType: 'Room' })),
  ...p.commonAreas.map(c => ({ ...c, propertyId: p.id, propertyName: p.name, locationType: c.type })),
]);

const STAFF = ['Unassigned', 'Mai', 'Tuan', 'Linh', 'Dat', 'Thanh', 'Ngoc'];

// --- Helper Functions ---
const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

function getWeekdayKey(dateStr) {
  const d = new Date(dateStr);
  const idx = d.getDay();
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[idx];
}

const calculateNights = (checkInDateStr, checkOutDateStr) => {
  const checkIn = new Date(checkInDateStr);
  const checkOut = new Date(checkOutDateStr);
  
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return 0; 
  }
  const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays;
};

const addMonths = (dateStr, months = 1) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setMonth(d.getMonth() + months);
  return formatDate(d);
};

const getDaysArray = (start, end) => {
  const arr = [];
  for(let dt = new Date(start); dt <= end; dt.setDate(dt.getDate()+1)){
      arr.push(new Date(dt));
  }
  return arr;
};

const getOccupiedDates = (bookings, roomId, excludeBookingId) => {
  const occupied = new Set();
  bookings.forEach(b => {
    if (b.roomId !== roomId || b.status === 'cancelled' || b.id === excludeBookingId) return;
    let current = new Date(b.checkIn);
    const end = new Date(b.checkOut);
    while (current < end) {
      occupied.add(formatDate(current));
      current.setDate(current.getDate() + 1);
    }
  });
  return occupied;
};

const getDaySummaryForDate = (dateStr, bookings) => {
  const dayCheckIns = bookings.filter(
    (b) => b.status !== 'cancelled' && b.checkIn === dateStr
  );
  const dayCheckOuts = bookings.filter(
    (b) => b.status !== 'cancelled' && b.checkOut === dateStr
  );

  const earlyCheckIns = dayCheckIns.filter((b) => !!b.earlyCheckIn);

  const weekdayKey = getWeekdayKey(dateStr);
  const longTermCleans = bookings.filter((b) => {
    if (!b.isLongTerm) return false;
    if (b.status === 'cancelled') return false;
    if (!b.weeklyCleaningDay) return false;
    if (b.weeklyCleaningDay !== weekdayKey) return false;
    return b.checkIn <= dateStr && b.checkOut > dateStr;
  });

  const roomsToClean = dayCheckOuts.length + longTermCleans.length;

  return {
    checkIns: dayCheckIns.length,
    earlyCheckIns: earlyCheckIns.length,
    checkOuts: dayCheckOuts.length,
    longTermCleans: longTermCleans.length,
    roomsToClean,
  };
};

// --- Custom Date Picker Component ---
const CustomDatePicker = ({ label, value, onChange, blockedDates = new Set(), minDate }) => {
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
  }, []);

  const repositionDropdown = useCallback(() => {
    if (!isOpen || !containerRef.current || !dropdownRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - containerRect.bottom;
    const spaceAbove = containerRect.top;
    const spaceRight = viewportWidth - containerRect.left;

    const dropdownHeight = dropdownRect.height || 320;
    const nextPosition = spaceBelow < dropdownHeight + 12 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const isMobile = viewportWidth < 768;
    const nextAlign = isMobile
      ? 'full'
      : spaceRight < dropdownRect.width && containerRect.right > dropdownRect.width
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
          className={`absolute z-50 p-4 bg-white rounded-xl shadow-xl border border-slate-100 w-full sm:w-auto max-w-xs sm:max-w-sm md:max-w-md max-h-[340px] overflow-y-auto ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
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

// --- Components ---

const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={20} /> },
    { id: 'bookings', label: 'Bookings List', icon: <Users size={20} /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart2 size={20} /> },
    { id: 'invoices', label: 'Invoices', icon: <FileText size={20} /> }, 
    { id: 'housekeeping', label: 'Housekeeping', icon: <Bed size={20} /> },
    { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={20} /> },
  ];

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-64 text-white transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}
        style={{ backgroundColor: COLORS.darkGreen }}
      >
        <div className="flex items-center justify-between h-20 px-6">
          <div className="flex flex-col">
            <span className="text-2xl font-serif font-bold tracking-wide" style={{ color: COLORS.lime }}>Kolab</span>
            <span className="text-xs uppercase tracking-[0.2em] text-white opacity-80">Living PMS</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-white">
            <X size={24} />
          </button>
        </div>
        <nav className="mt-8 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsOpen(false);
              }}
              className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-full transition-all duration-200 ${
                activeTab === item.id 
                  ? 'text-slate-900 shadow-md translate-x-1' 
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              style={{ 
                backgroundColor: activeTab === item.id ? COLORS.lime : 'transparent',
                color: activeTab === item.id ? COLORS.darkGreen : undefined
              }}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full p-6 border-t border-white/10">
          <div className="flex items-center text-slate-300 text-xs font-serif italic">
            "Call Us Your Home"
          </div>
        </div>
      </div>
    </>
  );
};

const StatCard = ({ title, value, icon, subtext, colorClass = 'bg-emerald-500' }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-6 flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</p>
      <h3 className="text-3xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>{value}</h3>
      {subtext && <p className="text-xs text-slate-500 mt-2 font-medium">{subtext}</p>}
    </div>
    <div 
      className="p-3 rounded-full"
      style={{ backgroundColor: `${COLORS.lime}40`, color: COLORS.darkGreen }}
    >
      {icon && React.cloneElement(icon, { size: 24 })}
    </div>
  </div>
);

const BookingModal = ({ isOpen, onClose, onSave, booking, rooms, allBookings, checkBookingConflict }) => {
  const [formData, setFormData] = useState({
    guestName: '',
    email: '',
    roomId: '',
    checkIn: '',
    checkOut: '',
    price: '',
    nights: 0, 
    status: 'confirmed',
    notes: '',
    earlyCheckIn: false,
    isLongTerm: false,
    weeklyCleaningDay: 'monday',
  });
  
  const [nights, setNights] = useState(0);
  const [conflictError, setConflictError] = useState(null);

  useEffect(() => {
    if (booking) {
      setFormData({
        ...booking,
        earlyCheckIn: !!booking.earlyCheckIn,
        isLongTerm: !!booking.isLongTerm,
        weeklyCleaningDay: booking.weeklyCleaningDay || 'monday',
      });
    } else {
      const defaultCheckIn = formatDate(new Date());
      const defaultCheckOut = formatDate(new Date(Date.now() + 86400000));
      setFormData({
        guestName: '',
        email: '',
        roomId: rooms[0]?.id || '',
        checkIn: defaultCheckIn,
        checkOut: defaultCheckOut,
        price: 500000,
        nights: calculateNights(defaultCheckIn, defaultCheckOut), 
        status: 'confirmed',
        notes: '',
        earlyCheckIn: false,
        isLongTerm: false,
        weeklyCleaningDay: 'monday',
      });
    }
    setConflictError(null);
  }, [booking, isOpen, rooms]);
  
  useEffect(() => {
    if (formData.checkIn && formData.checkOut) {
      const calculatedNights = calculateNights(formData.checkIn, formData.checkOut);
      setNights(calculatedNights);
      setFormData(prev => ({ ...prev, nights: calculatedNights }));
      setConflictError(null);
    } else {
      setNights(0);
      setFormData(prev => ({ ...prev, nights: 0 }));
    }
  }, [formData.checkIn, formData.checkOut]);

  const blockedDatesForRoom = useMemo(() => {
    return getOccupiedDates(allBookings, formData.roomId, booking?.id);
  }, [allBookings, formData.roomId, booking]);

  const availableRoomOptions = useMemo(() => {
    const roomBookings = allBookings.reduce((acc, b) => {
      if (b.status !== 'cancelled') {
        if (!acc[b.roomId]) acc[b.roomId] = [];
        acc[b.roomId].push(b);
      }
      return acc;
    }, {});
    
    const today = formatDate(new Date());

    return rooms.map(room => {
      const bookingsForRoom = roomBookings[room.id] || [];
      const isOccupiedToday = bookingsForRoom.some(b => 
        b.checkIn <= today && b.checkOut > today && (!booking || b.id !== booking.id)
      );

      let displayStatus = '';
      if (isOccupiedToday) displayStatus = ' (Occupied)';
      else if (bookingsForRoom.length > 0) displayStatus = ' (Future Bookings)';
      else displayStatus = ' (Open)';

      return { ...room, displayStatus, isOccupied: isOccupiedToday };
    });
  }, [allBookings, rooms, booking]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setConflictError(null);

    if (nights <= 0) {
        console.warn("Check-out must be after check-in. Nights calculation is 0.");
        return;
    }
    
    const conflictResult = checkBookingConflict(formData, booking ? booking.id : null);

    if (conflictResult.conflict) {
        setConflictError(conflictResult.reason);
        return; 
    }
    
    onSave(formData);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'price') {
      setFormData(prev => ({ 
        ...prev, 
        [name]: value === '' ? '' : Number(value) 
      }));
    } else {
      setFormData(prev => ({ 
          ...prev, 
          [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleDateChange = (field, dateStr) => {
    setFormData(prev => ({ ...prev, [field]: dateStr }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl" style={{ overflow: 'visible', maxHeight: '95vh' }}>
        <div 
            className="px-6 py-5 border-b flex justify-between items-center"
            style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}
        >
          <h3 className="font-serif font-bold text-xl text-white">
            {booking ? 'Edit Booking' : 'New Reservation'}
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto" style={{ backgroundColor: COLORS.cream, maxHeight: '85vh' }}>
          
          {conflictError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative flex items-start space-x-3">
              <AlertTriangle size={20} className="mt-1 flex-shrink-0" />
              <div>
                <p className="font-bold">Booking Conflict</p>
                <p className="text-sm mt-1">{conflictError}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Guest Name</label>
            <input 
              required
              type="text" 
              name="guestName"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none bg-white shadow-sm transition-all"
              value={formData.guestName}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Room</label>
              <select 
                name="roomId"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.roomId}
                onChange={handleChange}
              >
                {PROPERTIES.map(prop => (
                  <optgroup key={prop.id} label={prop.name}>
                    {availableRoomOptions
                       .filter(r => r.propertyId === prop.id)
                       .map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name}{room.displayStatus}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Status</label>
              <select 
                name="status"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="checked-in">Checked In</option>
                <option value="checked-out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <CustomDatePicker 
                label="Check In"
                value={formData.checkIn}
                onChange={(e) => handleDateChange('checkIn', e.target.value)}
                blockedDates={blockedDatesForRoom}
              />
            </div>
            <div>
              <CustomDatePicker 
                label="Check Out"
                value={formData.checkOut}
                onChange={(e) => handleDateChange('checkOut', e.target.value)}
                blockedDates={blockedDatesForRoom} 
                minDate={formData.checkIn}
              />
            </div>
          </div>
          
          <div className="flex items-center pt-2">
            <input
              type="checkbox"
              id="earlyCheckIn"
              name="earlyCheckIn"
              checked={formData.earlyCheckIn}
              onChange={handleChange}
              className="h-5 w-5 rounded border-gray-300 text-lime focus:ring-lime"
              style={{ color: COLORS.darkGreen, accentColor: COLORS.darkGreen }}
            />
            <label htmlFor="earlyCheckIn" className="ml-2 text-sm font-medium" style={{ color: COLORS.darkGreen }}>
              Request Early Check-in <span className="text-xs text-slate-500">(Requires room priority)</span>
            </label>
          </div>

          <div className="flex items-center pt-2">
            <input
              type="checkbox"
              id="isLongTerm"
              name="isLongTerm"
              checked={formData.isLongTerm}
              onChange={handleChange}
              className="h-5 w-5 rounded border-gray-300 text-lime focus:ring-lime"
              style={{ color: COLORS.darkGreen, accentColor: COLORS.darkGreen }}
            />
            <label htmlFor="isLongTerm" className="ml-2 text-sm font-medium" style={{ color: COLORS.darkGreen }}>
              Long term booking
            </label>
          </div>

          {formData.isLongTerm && (
            <div className="mt-3">
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: COLORS.darkGreen }}
              >
                Weekly cleaning day
              </label>
              <select
                name="weeklyCleaningDay"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm text-sm"
                value={formData.weeklyCleaningDay}
                onChange={handleChange}
              >
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
            </div>
          )}
          
          <div className="py-2 text-sm font-medium flex items-center justify-end">
            <Clock size={16} className="text-slate-500 mr-2" />
            <span className={nights > 0 ? "text-slate-700" : "text-red-500 font-bold"}>
                {nights} night{nights !== 1 ? 's' : ''}
            </span>
          </div>

          <div>
             <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: COLORS.darkGreen }}>Total Price (VND)</label>
             <input 
                required
                type="number" 
                name="price"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none bg-white shadow-sm"
                value={formData.price}
                onChange={handleChange}
              />
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
              disabled={nights <= 0}
              className={`px-6 py-2.5 rounded-full font-medium shadow-sm transition-all transform hover:-translate-y-0.5 ${nights <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
              style={{ backgroundColor: COLORS.darkGreen, color: COLORS.white }}
            >
              {booking ? 'Update Reservation' : 'Create Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MaintenanceModal = ({ isOpen, onClose, onSave, issue, allLocations }) => {
  const [formData, setFormData] = useState({
    locationId: allLocations[0]?.id || '',
    description: '',
    status: 'open',
    assignedStaff: 'Unassigned',
  });

  useEffect(() => {
    if (issue) {
      setFormData(issue);
    } else {
      setFormData(prev => ({ 
        ...prev, 
        locationId: allLocations[0]?.id || '',
        description: '',
        status: 'open',
        assignedStaff: 'Unassigned',
      }));
    }
  }, [issue, isOpen, allLocations]);

  if (!isOpen) return null;
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const locationInfo = allLocations.find(loc => loc.id === formData.locationId);
    if (!locationInfo) return console.error("Location not found.");

    onSave({
      ...formData,
      locationName: locationInfo.name,
      propertyName: locationInfo.propertyName,
    });
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
              disabled={!!issue} 
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
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
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
              </select>
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
              className="px-6 py-2.5 rounded-full font-medium shadow-sm transition-all transform hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: COLORS.darkGreen, color: COLORS.white }}
            >
              {issue ? 'Update Issue' : 'Report Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RecurringTaskModal = ({ isOpen, onClose, onSave, task, allLocations }) => {
  const [formData, setFormData] = useState({
    locationId: allLocations[0]?.id || '',
    description: '',
    frequency: 'monthly',
    nextDue: formatDate(new Date()),
  });

  useEffect(() => {
    if (task) {
      setFormData(task);
    } else {
      setFormData({
        locationId: allLocations[0]?.id || '',
        description: '',
        frequency: 'monthly',
        nextDue: formatDate(new Date()),
      });
    }
  }, [task, isOpen, allLocations]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
                <option value="monthly">Monthly</option>
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
              className="px-6 py-2.5 rounded-full font-medium shadow-sm transition-all transform hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: COLORS.darkGreen, color: COLORS.white }}
            >
              {task ? 'Update Task' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Invoice Modal ---
const InvoiceModal = ({ isOpen, onClose, bookings }) => {
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [invoiceData, setInvoiceData] = useState(null);

  useEffect(() => {
    if (selectedBookingId) {
      const booking = bookings.find(b => b.id === selectedBookingId);
      if (booking) {
        const roomObj = ALL_ROOMS.find(r => r.id === booking.roomId);
        const roomName = roomObj?.name || 'Unknown room';
        const propertyName = roomObj?.propertyName || 'Unknown property';
        setInvoiceData({
          guestName: booking.guestName,
          room: roomName,
          propertyName, 
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          nights: booking.nights,
          price: booking.price,
          date: formatDate(new Date()),
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`
        });
      }
    } else {
      setInvoiceData(null);
    }
  }, [selectedBookingId, bookings]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden print:shadow-none print:w-full print:max-w-none">
        {/* Screen-only Header */}
        <div className="px-6 py-5 border-b flex justify-between items-center bg-slate-50 print:hidden">
          <h3 className="font-serif font-bold text-xl text-slate-800">Create Invoice</h3>
          <div className="flex items-center space-x-2">
             {/* Close Button in Header */}
             <button onClick={onClose} className="text-slate-500 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors" title="Close">
                <X size={24} />
             </button>
          </div>
        </div>

        <div className="p-8 print:p-0">
          {/* Booking Selector (Screen Only) */}
          <div className="mb-8 print:hidden">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500">Select Booking to Generate Invoice</label>
            <select 
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none"
              value={selectedBookingId}
              onChange={(e) => setSelectedBookingId(e.target.value)}
            >
              <option value="">-- Select a Guest --</option>
              {bookings.map(b => (
                <option key={b.id} value={b.id}>{b.guestName} - {b.checkIn}</option>
              ))}
            </select>
          </div>

          {invoiceData ? (
            <div className="invoice-content border border-slate-100 p-8 rounded-xl print:border-0 print:p-0">
              {/* Header */}
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h1 className="text-4xl font-serif font-bold text-[#26402E] mb-2">Kolab Living</h1>
                  {/* Dynamic Address based on Property */}
                  {invoiceData.propertyName === 'Townhouse' ? (
                    <p className="text-slate-500 text-sm max-w-xs">
                      8/4B Đinh Tiên Hoàng, Đa Kao, Quận 1, Thành phố Hồ Chí Minh 70000, Vietnam
                    </p>
                  ) : invoiceData.propertyName === 'Neighbours' ? (
                     <p className="text-slate-500 text-sm max-w-xs">
                      250/9a, Hai Bà Trưng, Phường Tân Định, Quận 1, Thành phố Hồ Chí Minh 700000, Vietnam
                    </p>
                  ) : (
                    <p className="text-slate-500 text-sm">Co-living spaces in Ho Chi Minh City</p>
                  )}
                  <p className="text-slate-500 text-sm mt-1">kolabliving@gmail.com</p>
                </div>
                <div className="text-right">
                  <h2 className="text-2xl font-bold text-slate-800 mb-1">INVOICE</h2>
                  <p className="text-slate-500 font-mono">#{invoiceData.invoiceNumber}</p>
                  <p className="text-slate-500 text-sm mt-1">Date: {invoiceData.date}</p>
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-12 border-b border-slate-100 pb-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Bill To</h3>
                <h4 className="text-xl font-bold text-slate-800">{invoiceData.guestName}</h4>
                <p className="text-slate-600">Room: {invoiceData.room}</p>
              </div>

              {/* Line Items */}
              <table className="w-full text-left mb-12">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-3 text-xs font-bold uppercase text-slate-500">Description</th>
                    <th className="py-3 text-xs font-bold uppercase text-slate-500 text-right">Quantity</th>
                    <th className="py-3 text-xs font-bold uppercase text-slate-500 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-4 text-slate-700">
                      Accommodation ({invoiceData.room})<br/>
                      <span className="text-xs text-slate-400">{invoiceData.checkIn} to {invoiceData.checkOut}</span>
                    </td>
                    <td className="py-4 text-right text-slate-700">{invoiceData.nights} nights</td>
                    <td className="py-4 text-right text-slate-700 font-medium">{Number(invoiceData.price).toLocaleString('vi-VN')} ₫</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2" className="py-4 text-right font-bold text-slate-800">Total</td>
                    <td className="py-4 text-right font-bold text-xl text-[#26402E]">{Number(invoiceData.price).toLocaleString('vi-VN')} ₫</td>
                  </tr>
                </tfoot>
              </table>

              {/* Footer */}
              <div className="text-center text-slate-400 text-xs mt-16 pt-8 border-t border-slate-100">
                <p>Thank you for staying with Kolab Living!</p>
                <p className="mt-1">Payment due upon receipt.</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl print:hidden">
              Select a booking above to generate an invoice preview.
            </div>
          )}
        </div>

        {/* Action Buttons (Screen Only) */}
        <div className="px-6 py-5 bg-slate-50 border-t flex justify-end space-x-3 print:hidden">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center transition-colors"
          >
            <X size={18} className="mr-2"/> Close Preview
          </button>
          
          <button 
            onClick={handlePrint} 
            disabled={!invoiceData}
            className={`px-6 py-2 rounded-lg flex items-center transition-colors ${
              invoiceData 
                ? 'bg-[#26402E] text-white hover:bg-[#1a2e20] shadow-md' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Download size={18} className="mr-2" /> 
            Download PDF
          </button>
        </div>
      </div>
      
      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0, .fixed.inset-0 * {
            visibility: visible;
          }
          .fixed.inset-0 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: white;
            padding: 0;
          }
          .bg-slate-900\\/60 {
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .invoice-content {
            border: none !important;
            padding: 2rem !important;
          }
        }
      `}</style>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Data initialized as empty - will be populated by Firestore real-time listeners
  const [bookings, setBookings] = useState([]);
  const [roomStatuses, setRoomStatuses] = useState({});
  const [maintenanceIssues, setMaintenanceIssues] = useState([]);
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [dataError, setDataError] = useState(null); // surfaces listener/auth errors

  // Note: We intentionally do NOT sync to localStorage anymore
  // Firestore is the single source of truth, accessed via real-time listeners

  // Simulate "loading" to feel like a real app
  useEffect(() => {
    let unsubBookings = () => {};
    let unsubMaintenance = () => {};
    let unsubRecurring = () => {};
    let unsubRoomStatuses = () => {};
    let listenersStarted = false;

    const startListeners = () => {
      if (listenersStarted) return;
      listenersStarted = true;

      const bookingsQuery = query(collection(db, 'bookings'));
      unsubBookings = onSnapshot(
        bookingsQuery,
        (snapshot) => {
          console.log('[Firestore] bookings snapshot size:', snapshot.size);
          setDataError(null);
          setBookings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to bookings:', error);
          setDataError(error.message || 'Unable to read bookings from Firestore');
          setLoading(false);
        }
      );

      const maintenanceQuery = query(collection(db, 'maintenance'));
      unsubMaintenance = onSnapshot(
        maintenanceQuery,
        (snapshot) => {
          console.log('[Firestore] maintenance snapshot size:', snapshot.size);
          setDataError(null);
          setMaintenanceIssues(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to maintenance issues:', error);
          setDataError(error.message || 'Unable to read maintenance issues from Firestore');
          setLoading(false);
        }
      );

      const recurringQuery = query(collection(db, 'recurringTasks'));
      unsubRecurring = onSnapshot(
        recurringQuery,
        (snapshot) => {
          console.log('[Firestore] recurring tasks snapshot size:', snapshot.size);
          setRecurringTasks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error('Error listening to recurring tasks:', error);
          setDataError(error.message || 'Unable to read recurring tasks');
          setLoading(false);
        }
      );

      const roomStatusesQuery = query(collection(db, 'roomStatuses'));
      unsubRoomStatuses = onSnapshot(
        roomStatusesQuery,
        (snapshot) => {
          setDataError(null);
          const statuses = {};
          snapshot.forEach((docSnap) => {
            statuses[docSnap.id] = docSnap.data();
          });
          setRoomStatuses(statuses);
        },
        (error) => {
          console.error('Error listening to room statuses:', error);
          setDataError(error.message || 'Unable to read room statuses');
          setLoading(false);
        }
      );

      setLoading(false);
    };

    const authUnsub = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          setUser(null);
          await signInAnonymously(auth);
          return; // wait for auth to settle before attaching listeners
        }

        setUser(currentUser);
        startListeners();
      } catch (error) {
        console.error('Auth initialization error:', error);
        setDataError(error.message || 'Authentication failed');
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      unsubBookings();
      unsubMaintenance();
      unsubRecurring();
      unsubRoomStatuses();
    };
  }, []);

  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [editingMaintenanceIssue, setEditingMaintenanceIssue] = useState(null);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurringTask, setEditingRecurringTask] = useState(null);
  
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // Calendar helpers and selection
  const TODAY_STR = formatDate(new Date());
  const TOMORROW_STR = formatDate(new Date(new Date().setDate(new Date().getDate() + 1)));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(TODAY_STR);
  const [hoveredCalendarDate, setHoveredCalendarDate] = useState(null);
  const [visibleStartDate, setVisibleStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [visibleEndDate, setVisibleEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const timelineRef = useRef(null);
  const dayWidthRef = useRef(48);
  const extendLockRef = useRef(false);
  const dates = useMemo(() => getDaysArray(new Date(visibleStartDate), new Date(visibleEndDate)), [visibleStartDate, visibleEndDate]);

  useEffect(() => {
    if (!timelineRef.current) return;
    const firstDayCell = timelineRef.current.querySelector('[data-day-cell]');
    if (firstDayCell) {
      const w = firstDayCell.getBoundingClientRect().width;
      if (w) dayWidthRef.current = w;
    }
  }, [dates.length]);

  const EXTEND_DAYS = 7;

  const extendRangeLeft = useCallback(() => {
    const deltaPx = dayWidthRef.current * EXTEND_DAYS;
    setVisibleStartDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - EXTEND_DAYS);
      return next;
    });
    requestAnimationFrame(() => {
      if (timelineRef.current) {
        timelineRef.current.scrollLeft += deltaPx;
      }
      extendLockRef.current = false;
    });
  }, []);

  const extendRangeRight = useCallback(() => {
    setVisibleEndDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + EXTEND_DAYS);
      return next;
    });
    requestAnimationFrame(() => {
      extendLockRef.current = false;
    });
  }, []);

  const handleTimelineScroll = useCallback((e) => {
    const el = e.currentTarget;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const threshold = Math.max(dayWidthRef.current * 2, 80);

    if (!extendLockRef.current && scrollLeft < threshold) {
      extendLockRef.current = true;
      extendRangeLeft();
    } else if (!extendLockRef.current && scrollLeft + clientWidth > scrollWidth - threshold) {
      extendLockRef.current = true;
      extendRangeRight();
    }
  }, [extendRangeLeft, extendRangeRight]);

  const scrollTimelineByViewport = useCallback((direction = 1) => {
    if (!timelineRef.current) return;
    const el = timelineRef.current;
    const delta = el.clientWidth * 0.9 * (direction === -1 ? -1 : 1);
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  const scrollToDate = useCallback((dateStr) => {
    if (!timelineRef.current) return;
    const idx = dates.findIndex(d => formatDate(d) === dateStr);
    if (idx === -1) return;
    const el = timelineRef.current;
    const target = idx * dayWidthRef.current - el.clientWidth / 2 + dayWidthRef.current / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [dates]);

  const ensureDateVisible = useCallback((dateStr) => {
    const target = new Date(dateStr);
    setVisibleStartDate((prev) => {
      if (target < prev) {
        const next = new Date(target);
        next.setDate(next.getDate() - 30);
        return next;
      }
      return prev;
    });
    setVisibleEndDate((prev) => {
      if (target > prev) {
        const next = new Date(target);
        next.setDate(next.getDate() + 30);
        return next;
      }
      return prev;
    });
    requestAnimationFrame(() => scrollToDate(dateStr));
  }, [scrollToDate]);

  // --- Memoized Data for Dashboard and Housekeeping ---

  const cleaningTasks = useMemo(() => {
    const checkoutsToday = bookings
        .filter(b => b.checkOut === TODAY_STR && b.status !== 'cancelled' && b.status !== 'checked-out');
        
    const checkoutRoomIds = checkoutsToday.map(b => b.roomId);

    const longTermCleaningRoomsToday = new Set(
      bookings
        .filter((b) => {
          if (!b.isLongTerm) return false;
          if (b.status === 'cancelled') return false;

          const dateStr = TODAY_STR;
          const weekdayKey = getWeekdayKey(dateStr);

          return (
            b.checkIn <= dateStr &&
            b.checkOut > dateStr &&
            b.weeklyCleaningDay === weekdayKey
          );
        })
        .map((b) => b.roomId)
    );

    const allRoomsData = ALL_ROOMS.map(room => {
        const statusData = roomStatuses[room.id] || {};
        const storedStatus = statusData.status || 'clean';
        
        const isCheckout = checkoutRoomIds.includes(room.id);
        const checkoutBooking = isCheckout ? checkoutsToday.find(b => b.roomId === room.id) : null;
        const needsEarlyCheckinPrep = checkoutBooking && checkoutBooking.earlyCheckIn;
        const isLongTermCleanToday = longTermCleaningRoomsToday.has(room.id);
        
        let calculatedPriority = 3; 

        if (isCheckout) {
            calculatedPriority = needsEarlyCheckinPrep ? 1 : 2; 
        } else if (storedStatus === 'dirty') {
            calculatedPriority = 3; 
        }
        
        if (needsEarlyCheckinPrep) {
            calculatedPriority = 1;
        }

        return {
            roomId: room.id,
            roomName: room.name,
            propertyName: room.propertyName,
            roomType: room.type,
            status: isCheckout ? 'checkout_dirty' : storedStatus, 
            assignedStaff: statusData.assignedStaff || 'Unassigned',
            priority: statusData.priority !== undefined ? Number(statusData.priority) : calculatedPriority,
            needsCleaning: isCheckout || storedStatus === 'dirty' || isLongTermCleanToday,
            isEarlyCheckinPrep: needsEarlyCheckinPrep,
            isLongTermCleaning: isLongTermCleanToday,
            checkoutBooking: checkoutBooking
        };
    });

    return allRoomsData
        .filter(r => r.needsCleaning)
        .sort((a, b) => a.priority - b.priority || a.roomName.localeCompare(b.roomName));
  }, [bookings, roomStatuses, TODAY_STR]);

  const checkBookingConflict = useCallback((newBookingData, excludeBookingId = null) => {
    const newCheckIn = new Date(newBookingData.checkIn).getTime();
    const newCheckOut = new Date(newBookingData.checkOut).getTime();
    const newRoomId = newBookingData.roomId;

    if (newCheckIn >= newCheckOut) {
      return { conflict: true, reason: "Check-out date must be strictly after the Check-in date." };
    }

    const conflictingBooking = bookings.find(existingBooking => {
      if (existingBooking.roomId !== newRoomId) return false;
      if (existingBooking.id === excludeBookingId) return false;
      if (existingBooking.status === 'cancelled') return false;

      const existingCheckIn = new Date(existingBooking.checkIn).getTime();
      const existingCheckOut = new Date(existingBooking.checkOut).getTime(); 

      const overlaps = (newCheckIn < existingCheckOut) && (newCheckOut > existingCheckIn);

      return overlaps;
    });

    if (conflictingBooking) {
      return { 
        conflict: true, 
        reason: `Room is booked by ${conflictingBooking.guestName} from ${conflictingBooking.checkIn} to ${conflictingBooking.checkOut}.`,
        conflictingBooking 
      };
    }

    return { conflict: false };
  }, [bookings]);

  // Auto-create recurring maintenance tasks when due
  useEffect(() => {
    const today = formatDate(new Date());

    const ensureRecurringIssues = async () => {
      for (const task of recurringTasks) {
        if (!task.nextDue || task.nextDue > today) continue;

        const hasOpen = maintenanceIssues.some(
          (i) => i.templateId === task.id && i.status !== 'completed'
        );
        if (hasOpen) continue;

        const locationInfo = ALL_LOCATIONS.find((loc) => loc.id === task.locationId);
        const issueId = Math.random().toString(36).substr(2, 9);

        const newIssue = {
          id: issueId,
          locationId: task.locationId,
          locationName: locationInfo?.name,
          propertyName: locationInfo?.propertyName,
          description: task.description,
          status: 'open',
          assignedStaff: 'Unassigned',
          reportedAt: new Date().toISOString(),
          templateId: task.id,
          isRecurring: true,
          dueDate: task.nextDue,
        };

        try {
          await setDoc(doc(db, 'maintenance', issueId), newIssue);
          const nextDue = task.frequency === 'monthly' ? addMonths(task.nextDue, 1) : task.nextDue;
          await setDoc(doc(db, 'recurringTasks', task.id), { nextDue }, { merge: true });
          console.log(`Created recurring maintenance issue from task ${task.id}`);
        } catch (err) {
          console.error('Recurring task generation error:', err);
        }
      }
    };

    ensureRecurringIssues();
  }, [recurringTasks, maintenanceIssues]);

  // --- Local State Update Actions ---

  const updateHousekeepingField = async (roomId, field, value, actingUser = user) => {
    try {
      let nextStatus = null;

      setRoomStatuses((prev) => {
        const existing = prev[roomId] || {};
        nextStatus = {
          ...existing,
          [field]: value,
          updatedAt: new Date().toISOString(),
        };

        return {
          ...prev,
          [roomId]: nextStatus,
        };
      });

      if (nextStatus) {
        await setDoc(doc(db, 'roomStatuses', roomId), nextStatus, { merge: true });
      }
    } catch (error) {
      console.error('Error updating room status:', error);
    }
  };

  const markRoomClean = async (roomId, actingUser = user) => {
    try {
      const cleanStatus = {
        status: 'clean',
        assignedStaff: 'Unassigned',
        priority: 3,
        updatedAt: new Date().toISOString(),
      };

      setRoomStatuses((prev) => ({
        ...prev,
        [roomId]: cleanStatus,
      }));

      await setDoc(doc(db, 'roomStatuses', roomId), cleanStatus, { merge: true });
    } catch (error) {
      console.error('Error marking room clean:', error);
    }
  };

  const handleSaveBooking = async (bookingData, actingUser = user) => {
    try {
      const normalizedPrice = Number(bookingData.price) || 0;
      const normalizedNights = calculateNights(bookingData.checkIn, bookingData.checkOut);

      const normalizedData = {
        ...bookingData,
        price: normalizedPrice,
        nights: normalizedNights,
      };

      if (editingBooking) {
        const updatedBooking = { 
          ...normalizedData, 
          id: editingBooking.id, 
          createdAt: editingBooking.createdAt || new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        };
        // Save to Firestore - real-time listener will update state
        await setDoc(doc(db, 'bookings', editingBooking.id), updatedBooking, { merge: true });
        console.log('[Firestore] booking saved:', updatedBooking.id);
        // Optimistic local update so UI reflects immediately even if listener is blocked
        setBookings((prev) => prev.map((b) => (b.id === editingBooking.id ? updatedBooking : b)));
      } else {
        const newBooking = {
            ...normalizedData,
            id: Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString()
        };
        // Save to Firestore - real-time listener will update state
        await setDoc(doc(db, 'bookings', newBooking.id), newBooking);
        console.log('[Firestore] booking saved:', newBooking.id);
        // Optimistic local add
        setBookings((prev) => {
          if (prev.some((b) => b.id === newBooking.id)) return prev;
          return [...prev, newBooking];
        });
      }
      setIsModalOpen(false);
      setEditingBooking(null);
    } catch (error) {
      console.error('Error saving booking:', error);
      alert('Error saving booking. Please check the console.');
    }
  };

  const handleDeleteBooking = async (id) => {
    if(confirm("Are you sure you want to delete this booking?")) {
        try {
          // Delete from Firestore - real-time listener will update state
          await deleteDoc(doc(db, 'bookings', id));
        } catch (error) {
          console.error('Error deleting booking:', error);
          alert('Error deleting booking. Please check the console.');
        }
    }
  };
  
  const handleSaveMaintenanceIssue = async (issueData, actingUser = user) => {
    try {
      if (editingMaintenanceIssue) {
        const updatedIssue = { ...issueData, id: editingMaintenanceIssue.id, reportedAt: editingMaintenanceIssue.reportedAt, updatedAt: new Date().toISOString() };
        // Save to Firestore - real-time listener will update state
        await setDoc(doc(db, 'maintenance', editingMaintenanceIssue.id), updatedIssue, { merge: true });
      } else {
        const newIssue = {
            ...issueData,
            id: Math.random().toString(36).substr(2, 9),
            reportedAt: new Date().toISOString()
        };
        // Save to Firestore - real-time listener will update state
        await setDoc(doc(db, 'maintenance', newIssue.id), newIssue);
      }
      setIsMaintenanceModalOpen(false);
      setEditingMaintenanceIssue(null);
    } catch (error) {
      console.error('Error saving maintenance issue:', error);
      alert('Error saving maintenance issue. Please check the console.');
    }
  };

  const handleSaveRecurringTask = async (taskData, actingUser = user) => {
    try {
      if (editingRecurringTask) {
        const updatedTask = { ...taskData, id: editingRecurringTask.id };
        await setDoc(doc(db, 'recurringTasks', editingRecurringTask.id), updatedTask, { merge: true });
      } else {
        const newTask = {
          ...taskData,
          id: Math.random().toString(36).substr(2, 9),
        };
        await setDoc(doc(db, 'recurringTasks', newTask.id), newTask);
      }
      setIsRecurringModalOpen(false);
      setEditingRecurringTask(null);
    } catch (error) {
      console.error('Error saving recurring task:', error);
      alert('Error saving recurring task. Please check the console.');
    }
  };

  const handleDeleteRecurringTask = async (id) => {
    if (!id) return;
    if (!confirm('Delete this recurring task template?')) return;
    try {
      await deleteDoc(doc(db, 'recurringTasks', id));
    } catch (error) {
      console.error('Error deleting recurring task:', error);
      alert('Error deleting recurring task. Please check the console.');
    }
  };

  const handleDeleteMaintenanceIssue = async (id) => {
      try {
        // Delete from Firestore - real-time listener will update state
        await deleteDoc(doc(db, 'maintenance', id));
      } catch (error) {
        console.error('Error deleting maintenance issue:', error);
        alert('Error deleting maintenance issue. Please check the console.');
      }
  };

  // --- STATISTICS CALCULATIONS ---
  const calculateStats = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const last6Months = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const monthName = d.toLocaleString('default', { month: 'short' });
      const monthIdx = d.getMonth();
      const year = d.getFullYear();

      const monthlyRevenue = bookings
        .filter(b => {
          const bDate = new Date(b.checkIn);
          return bDate.getMonth() === monthIdx && bDate.getFullYear() === year && b.status !== 'cancelled';
        })
        .reduce((sum, b) => sum + (Number(b.price) || 0), 0);

      last6Months.push({ month: monthName, revenue: monthlyRevenue });
    }

    const revenueByProp = { Townhouse: 0, Neighbours: 0, 'Unknown property': 0 };
    bookings.forEach(b => {
        if(b.status === 'cancelled') return;
        const room = ALL_ROOMS.find(r => r.id === b.roomId);
      const propName = room?.propertyName || 'Unknown property';
      if (revenueByProp[propName] === undefined) revenueByProp[propName] = 0;
      revenueByProp[propName] += (Number(b.price) || 0);
    });

    const totalRoomNightsAvailable = ALL_ROOMS.length * 30; 
    const currentMonthNightsBooked = bookings
        .filter(b => {
            const bDate = new Date(b.checkIn);
            return bDate.getMonth() === currentMonth && bDate.getFullYear() === currentYear && b.status !== 'cancelled';
        })
        .reduce((sum, b) => sum + (Number(b.nights) || 0), 0);
    
    const occupancyRate = Math.min(100, Math.round((currentMonthNightsBooked / totalRoomNightsAvailable) * 100));

    let totalLeadTime = 0;
    let count = 0;
    bookings.forEach(b => {
        if(b.createdAt && b.checkIn) {
            const created = new Date(b.createdAt);
            const checkIn = new Date(b.checkIn);
            const diffTime = Math.abs(checkIn - created);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            totalLeadTime += diffDays;
            count++;
        }
    });
    const avgLeadTime = count > 0 ? Math.round(totalLeadTime / count) : 0;

    return { last6Months, revenueByProp, occupancyRate, avgLeadTime };
  };

  const statsData = useMemo(() => calculateStats(), [bookings]);


  // --- View Renderers ---

  const renderDashboard = () => {
    const activeBookings = bookings.filter(b => b.checkIn <= TODAY_STR && b.checkOut > TODAY_STR && b.status !== 'cancelled');
    const checkingIn = bookings.filter(b => b.checkIn === TODAY_STR && b.status !== 'cancelled');
    // const checkingOut = bookings.filter(b => b.checkOut === TODAY_STR && b.status !== 'cancelled');
    const checkingOutTomorrow = bookings.filter(b => b.checkOut === TOMORROW_STR && b.status !== 'cancelled');
    
    const revenue = bookings
      .filter(b => new Date(b.checkIn).getMonth() === new Date().getMonth() && b.status !== 'cancelled')
      .reduce((sum, b) => sum + (Number(b.price) || 0), 0);

    const occupancyRate = ALL_ROOMS.length > 0 ? Math.round((activeBookings.length / ALL_ROOMS.length) * 100) : 0;
    const tasksTodayCount = cleaningTasks ? cleaningTasks.length : 0;
    const openMaintenanceIssues = maintenanceIssues.filter(i => i.status !== 'completed').length;

    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Overview</h2>
          <p className="text-slate-500">Welcome back to Kolab Living.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Occupancy" value={`${occupancyRate}%`} icon={<Home />} subtext={`${activeBookings.length} / ${ALL_ROOMS.length} rooms`} />
          <StatCard title="Checking In" value={checkingIn.length} icon={<User />} subtext="Today" />
          <StatCard title="Cleaning Tasks" value={tasksTodayCount} icon={<Bed />} subtext="To be completed today" />
          <StatCard title="Open Issues" value={openMaintenanceIssues} icon={<Wrench />} subtext="Maintenance tickets" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB]">
             <h3 className="font-serif font-bold text-xl mb-6 flex items-center" style={{ color: COLORS.darkGreen }}>
               <User size={20} className="mr-3 text-slate-400" />
               Checking In Today ({checkingIn.length})
             </h3>
             <div className="space-y-3">
               {checkingIn.length === 0 ? (
                   <p className="text-green-600 text-sm flex items-center bg-green-50 p-4 rounded-xl border border-green-100">
                       <CheckCircle size={18} className="mr-2" /> No check-ins scheduled.
                   </p>
               ) : (
                   checkingIn.map(booking => (
                         <div key={booking.id} className={`flex justify-between items-center p-3 rounded-xl border shadow-sm ${
                           booking.earlyCheckIn ? 'bg-yellow-50/50 border-yellow-200' : 'bg-[#E2F05D]/30 border-[#E2F05D]'
                         }`}>
                           <span className="text-sm font-bold text-slate-800">{booking.guestName}</span>
                           <div className="flex items-center space-x-2">
                             {booking.earlyCheckIn && <Sunrise size={16} className="text-orange-500" title="Early Check-in Requested"/>}
                             <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.lime, color: COLORS.darkGreen }}>
                               {(ALL_ROOMS.find(r => r.id === booking.roomId)?.name) || 'Unknown room'}
                             </span>
                           </div>
                         </div>
                   ))
               )}
             </div>
          </div>
          
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB]">
             <h3 className="font-serif font-bold text-xl mb-6 flex items-center" style={{ color: COLORS.darkGreen }}>
               <LogOut size={20} className="mr-3 text-slate-400" />
               Checking Out Tomorrow ({checkingOutTomorrow.length})
             </h3>
             <div className="space-y-3">
               {checkingOutTomorrow.length === 0 ? (
                   <p className="text-slate-400 text-sm p-4 rounded-xl border border-dashed border-slate-200 text-center">
                       No check-outs scheduled for tomorrow.
                   </p>
               ) : (
                     checkingOutTomorrow.map(booking => {
                     const roomName = ALL_ROOMS.find(r => r.id === booking.roomId)?.name || 'Unknown room';
                     return (
                       <div key={booking.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                         <span className="text-sm font-bold text-slate-700">{booking.guestName}</span>
                         <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                           {roomName}
                         </span>
                       </div>
                     );
                     })
               )}
             </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB]">
             <h3 className="font-serif font-bold text-xl mb-6 flex items-center" style={{ color: COLORS.darkGreen }}>
               <Bed size={20} className="mr-3 text-slate-400" />
               Current Cleaning Tasks
             </h3>
             <div className="space-y-3">
               {(!cleaningTasks || cleaningTasks.length === 0) ? (
                   <p className="text-green-600 text-sm flex items-center bg-green-50 p-4 rounded-xl border border-green-100">
                       <CheckCircle size={18} className="mr-2" /> All rooms are clean and ready!
                   </p>
               ) : (
                   cleaningTasks.slice(0, 5).map(task => (
                       <div key={task.roomId} className="flex justify-between items-center p-3 bg-red-50/50 rounded-xl border border-red-100">
                           <span className="text-sm font-bold text-red-900">
                             {task.roomName} <span className="font-normal opacity-70">({task.propertyName})</span>
                             {task.isLongTermCleaning && (
                               <div className="text-[10px] font-bold text-blue-700 mt-1">Weekly long term clean</div>
                             )}
                           </span>
                           <div className="flex items-center space-x-2">
                               {task.isEarlyCheckinPrep && <Sunrise size={16} className="text-orange-500" title="Early Check-in Priority"/>}
                               <span className="text-xs font-medium text-red-700">Priority {task.priority}</span>
                           </div>
                       </div>
                   ))
               )}
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const getBookingForCell = (roomId, date) => {
      const dateStr = formatDate(date);
      return bookings.find(b => b.roomId === roomId && b.checkIn <= dateStr && b.checkOut > dateStr && b.status !== 'cancelled');
    };
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden flex flex-col h-[calc(100vh-140px)]">
        <div className="p-5 border-b border-[#E5E7EB] flex justify-between items-center bg-[#F9F8F2]">
          <div className="flex items-center space-x-6">
            <h2 className="text-xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>Calendar</h2>
            <div className="flex space-x-2">
              <button onClick={() => scrollTimelineByViewport(-1)} className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200"><ChevronLeft size={20} /></button>
              <button onClick={() => { setSelectedCalendarDate(TODAY_STR); ensureDateVisible(TODAY_STR); }} className="px-4 py-1.5 text-sm font-medium hover:bg-white rounded-full border border-transparent hover:border-slate-200 transition-colors">Today</button>
              <button onClick={() => scrollTimelineByViewport(1)} className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200"><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="text-sm font-medium font-serif" style={{ color: COLORS.darkGreen }}>
             {`${formatDate(visibleStartDate)} – ${formatDate(visibleEndDate)}`}
          </div>
        </div>
        <div className="flex-1 bg-slate-50">
          <div className="relative overflow-x-auto overflow-y-auto h-full" ref={timelineRef} onScroll={handleTimelineScroll}>
            <div className="min-w-[1000px] bg-white">
              <div className="flex border-b border-slate-200 sticky top-0 z-30 bg-white">
                <div className="w-48 flex-shrink-0 p-4 bg-[#F9F8F2] font-bold text-xs uppercase tracking-wider sticky left-0 z-30 border-r border-slate-200" style={{ color: COLORS.darkGreen }}>Room</div>
                {dates.map(date => {
                  const dateStr = formatDate(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isSelected = dateStr === selectedCalendarDate;
                  const isHovered = dateStr === hoveredCalendarDate;
                  const summary = getDaySummaryForDate(dateStr, bookings);
                  return (
                    <div
                      key={dateStr}
                      data-day-cell
                      className="relative flex-1 min-w-[3rem] p-3 text-center text-xs border-r border-slate-100"
                      onMouseEnter={() => setHoveredCalendarDate(dateStr)}
                      onMouseLeave={() => setHoveredCalendarDate(null)}
                      onClick={() => setSelectedCalendarDate(dateStr)}
                    >
                      <button
                        type="button"
                        className={`w-full flex flex-col items-center justify-center rounded-md py-1 transition-colors leading-tight ${isSelected ? 'bg-[#E2F05D]/60 text-[#26402E] font-bold' : 'text-slate-500'} ${isToday ? 'font-bold' : ''}`}
                        style={{ color: isSelected || isToday ? COLORS.darkGreen : COLORS.textMuted }}
                      >
                        <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                        <span className="text-sm font-semibold">{date.getDate()}</span>
                      </button>

                      {isHovered && (
                        <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-3 text-[11px] text-left z-50 min-w-[180px]">
                          <div className="font-bold text-slate-800 mb-1">
                            {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Check-ins</span>
                            <span className="font-semibold text-slate-800">{summary.checkIns}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Early check-ins</span>
                            <span className="font-semibold text-orange-600">{summary.earlyCheckIns}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Check-outs</span>
                            <span className="font-semibold text-slate-800">{summary.checkOuts}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Long term cleans</span>
                            <span className="font-semibold text-blue-700">{summary.longTermCleans}</span>
                          </div>
                          <div className="flex justify-between mt-1 pt-1 border-t border-slate-100">
                            <span className="text-slate-500">Rooms to clean</span>
                            <span className="font-semibold text-red-700">{summary.roomsToClean}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {PROPERTIES.map(prop => (
                <React.Fragment key={prop.id}>
                  <div
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider sticky left-0 z-40 shadow-[2px_0_10px_-5px_rgba(0,0,0,0.2)]"
                    style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime, top: DATE_HEADER_HEIGHT }}
                  >
                    {prop.name}
                  </div>
                  {prop.rooms.map(room => (
                    <div key={room.id} className="flex border-b border-slate-100 h-16 relative hover:bg-[#F9F8F2] transition-colors group">
                      <div
                        className="w-48 flex-shrink-0 p-4 bg-white flex flex-col justify-center sticky left-0 z-30 border-r border-slate-200 group-hover:bg-[#F9F8F2] shadow-[2px_0_10px_-5px_rgba(0,0,0,0.1)]"
                        style={{ top: DATE_HEADER_HEIGHT }}
                      >
                        <span className="font-bold text-sm" style={{ color: COLORS.darkGreen }}>{room.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{room.type}</span>
                      </div>
                      {dates.map(date => {
                        const dateStr = formatDate(date);
                        const weekdayKey = getWeekdayKey(dateStr);
                        const booking = getBookingForCell(room.id, date);
                        const dateIndex = dates.findIndex(d => formatDate(d) === dateStr);
                        const isStart = booking && booking.checkIn === dateStr;
                        const isTruncatedAtStart = booking && booking.checkIn < formatDate(dates[0]);
                        const lastDateStr = formatDate(dates[dates.length - 1]);
                        const hasLongTermCleaningToday = bookings.some((b) => {
                          if (!b.isLongTerm) return false;
                          if (b.status === 'cancelled') return false;
                          if (b.roomId !== room.id) return false;

                          return (
                            b.checkIn <= dateStr &&
                            b.checkOut > dateStr &&
                            b.weeklyCleaningDay === weekdayKey
                          );
                        });
                        let colSpan = 0;
                        if (booking) {
                          const start = new Date(booking.checkIn);
                          if (isStart) {
                            const duration = calculateNights(formatDate(start), booking.checkOut);
                            colSpan = Math.min(duration, dates.length - dateIndex);
                          } else if (isTruncatedAtStart && dateIndex === 0) {
                            const windowStart = dates[0];
                            const visibleDuration = calculateNights(formatDate(windowStart), booking.checkOut);
                            colSpan = Math.min(visibleDuration, dates.length);
                          }
                        }
                        const shouldRenderBlock = booking && (isStart || (isTruncatedAtStart && dateIndex === 0));
                        const gapPx = 4; // Small gap so adjacent bookings touch without overlap
                        const widthCalc = `calc(${colSpan * 100}% - ${gapPx}px)`;
                        const leftOffset = isTruncatedAtStart ? '0%' : '50%';
                        return (
                          <div key={dateStr} className={`flex-1 min-w-[3rem] border-r border-slate-100 relative ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-slate-50/50' : ''} ${dateStr === selectedCalendarDate ? 'bg-[#E2F05D]/10' : ''}`} onClick={() => { if (booking) setEditingBooking(booking); else setEditingBooking({ roomId: room.id, checkIn: formatDate(date), checkOut: formatDate(new Date(date.getTime() + 86400000)) }); setIsModalOpen(true); }}>
                            {booking && shouldRenderBlock && (
                              <div className={`absolute top-2 bottom-2 rounded-full z-0 cursor-pointer text-xs px-2 overflow-hidden whitespace-nowrap shadow-sm flex items-center transition-all hover:scale-[1.02] hover:shadow-md hover:z-20 ${booking.status === 'checked-in' ? 'bg-[#26402E] text-[#E2F05D]' : booking.status === 'confirmed' ? 'bg-[#E2F05D] text-[#26402E]' : 'bg-slate-300 text-slate-600'}`}
                                style={{
                                  width: widthCalc,
                                  left: leftOffset,
                                  zIndex: 10,
                                }}
                                onClick={(e) => { e.stopPropagation(); setEditingBooking(booking); setIsModalOpen(true); }}
                              >
                                {booking.isLongTerm && hasLongTermCleaningToday && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block mr-1.5" title="Weekly cleaning today"></span>
                                )}
                                <span className="font-bold truncate mr-1">{booking.guestName}</span>
                                {booking.earlyCheckIn && <Sunrise size={12} className="text-orange-600 ml-1"/>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };
  const renderBookingsList = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
      <div className="p-6 border-b border-[#E5E7EB] flex justify-between items-center bg-[#F9F8F2]">
        <h2 className="text-xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>All Bookings</h2>
        <div className="relative">
             <input type="text" placeholder="Search guest..." className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-full text-sm focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none w-64 shadow-sm bg-white" />
             <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-[#26402E] text-white text-xs uppercase font-bold tracking-wider">
            <tr><th className="px-6 py-4">Guest</th><th className="px-6 py-4">Room</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Dates</th><th className="px-6 py-4">Price</th><th className="px-6 py-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.length === 0 ? <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-500">No bookings found.</td></tr> : bookings.map((booking) => {
                const bookingNights = booking.nights || calculateNights(booking.checkIn, booking.checkOut);
                const perNight = bookingNights > 0 ? Math.round(Number(booking.price) / bookingNights) : 0;
                return (
              <tr key={booking.id} className="hover:bg-[#F9F8F2] transition-colors group">
                <td className="px-6 py-4 font-bold text-slate-700 flex items-center">{booking.guestName}{booking.earlyCheckIn && <Sunrise size={16} className="text-orange-500 ml-3"/>}</td>
                <td className="px-6 py-4 text-slate-600">
                  {(ALL_ROOMS.find(r => r.id === booking.roomId)?.name) || 'Unknown room'}
                  <div className="text-xs opacity-60">{ALL_ROOMS.find(r => r.id === booking.roomId)?.propertyName || 'Unknown property'}</div>
                </td>
                <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-bold border ${booking.status === 'confirmed' ? 'bg-[#E2F05D]/20 text-[#4c5c23] border-[#E2F05D]/50' : 'bg-slate-100'}`}>{booking.status}</span></td>
                <td className="px-6 py-4 text-sm text-slate-600">{booking.checkIn} → {booking.checkOut}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-700">
                    {Number(booking.price).toLocaleString('vi-VN')} ₫
                    <div className="text-xs font-normal text-slate-500 mt-1">
                        {bookingNights > 0 ? `${perNight.toLocaleString('vi-VN')} ₫ / night` : ''}
                    </div>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button onClick={() => { setEditingBooking(booking); setIsModalOpen(true); }} className="p-2 rounded-full text-slate-400 hover:text-[#26402E] hover:bg-[#E2F05D]"><Edit2 size={18} /></button>
                  <button onClick={() => handleDeleteBooking(booking.id)} className="p-2 rounded-full text-slate-400 hover:text-red-600"><Trash2 size={18} /></button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHousekeeping = () => (
    <div className="space-y-6">
        <div><h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Cleaning Task Manager</h2></div>
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
                        <td className="px-6 py-4 font-bold text-slate-700">{task.roomName}<div className="text-xs font-normal opacity-60">{task.propertyName}</div>{task.isEarlyCheckinPrep && <div className="text-xs font-bold text-orange-600 flex items-center mt-1"><Sunrise size={14} className="mr-1"/> EARLY CHECK-IN</div>}{task.isLongTermCleaning && <div className="text-[11px] font-bold text-blue-700 flex items-center mt-1">Weekly long term clean</div>}</td>
                        <td className="px-6 py-4"><span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100">{task.status}</span></td>
                        <td className="px-6 py-4"><select value={task.assignedStaff} onChange={(e) => updateHousekeepingField(task.roomId, 'assignedStaff', e.target.value)} className="border rounded px-2 py-1">{STAFF.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                        <td className="px-6 py-4"><button onClick={() => markRoomClean(task.roomId)} className="px-4 py-2 rounded-full text-sm font-bold flex items-center shadow-md" style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}><CheckCircle size={16} className="mr-2"/> Mark Clean</button></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
        </div>
    </div>
  );

  const renderMaintenance = () => {
    const allOpenIssues = maintenanceIssues.filter(i => i.status !== 'completed');

    return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Maintenance Tracking</h2>
                <p className="text-slate-500">
                    Track and manage facility issues across all properties and common areas. 
                </p>
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={() => { setEditingRecurringTask(null); setIsRecurringModalOpen(true); }}
                className="px-4 py-3 rounded-full flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide"
                style={{ backgroundColor: COLORS.lime, color: COLORS.darkGreen }}
              >
                <RefreshCcw size={18} className="mr-2" />
                New Recurring Task
              </button>
              <button 
                onClick={() => { setEditingMaintenanceIssue(null); setIsMaintenanceModalOpen(true); }}
                className="px-6 py-3 rounded-full flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide"
                style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}
              >
                <ListChecks size={20} className="mr-2" />
                Report New Issue
              </button>
            </div>
        </div>

        {/* Recurring tasks overview */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-lg text-slate-800 flex items-center">
              <RefreshCcw size={18} className="mr-2 text-slate-500" />
              Recurring Tasks
            </h3>
            <span className="text-xs text-slate-500">Auto-creates issues when due</span>
          </div>
          {recurringTasks.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No recurring tasks yet. Create one to schedule monthly reminders.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recurringTasks.map((task) => {
                const loc = ALL_LOCATIONS.find((l) => l.id === task.locationId);
                const hasOpen = maintenanceIssues.some((i) => i.templateId === task.id && i.status !== 'completed');
                return (
                  <div key={task.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="font-bold text-slate-800">{task.description}</div>
                      <div className="text-xs text-slate-500">{loc?.name} · {loc?.propertyName}</div>
                      <div className="text-xs text-slate-500 mt-1">Next due: {task.nextDue}</div>
                    </div>
                    <div className="flex items-center space-x-3 text-xs">
                      <span className={`px-3 py-1 rounded-full border ${hasOpen ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                        {hasOpen ? 'Open issue' : 'Waiting for next due'}
                      </span>
                      <button onClick={() => { setEditingRecurringTask(task); setIsRecurringModalOpen(true); }} className="text-slate-400 hover:text-[#26402E]" title="Edit">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDeleteRecurringTask(task.id)} className="text-slate-400 hover:text-red-600" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* NEW OVERVIEW SECTION */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-red-50/50">
                <h3 className="font-bold text-lg text-red-800 flex items-center">
                    <AlertTriangle size={20} className="mr-2" />
                    Active Issues Overview ({allOpenIssues.length})
                </h3>
            </div>
            
            {allOpenIssues.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                    <CheckCircle size={48} className="mx-auto mb-3 text-green-500 opacity-50" />
                    <p>No active maintenance issues. Everything is running smoothly!</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Location</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Assigned</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {allOpenIssues.map(issue => {
                                const location = ALL_LOCATIONS.find(l => l.id === issue.locationId);
                                return (
                                    <tr key={issue.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-slate-700">{location?.name || 'Unknown'}</span>
                                            <div className="text-xs text-slate-500">{location?.propertyName}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={issue.description}>
                                            {issue.description}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                                issue.status === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                                'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                {issue.status === 'in-progress' ? 'In Progress' : 'Open'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            <div className="flex items-center">
                                                <User size={14} className="mr-1 text-slate-400"/>
                                                {issue.assignedStaff}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => { setEditingMaintenanceIssue(issue); setIsMaintenanceModalOpen(true); }}
                                                className="text-slate-400 hover:text-[#26402E] mr-3"
                                                title="Edit Issue"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {PROPERTIES.map(prop => {
            const propLocations = ALL_LOCATIONS.filter(loc => loc.propertyId === prop.id);
            return (
                <div key={prop.id} className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                    <div className="px-6 py-4 font-bold text-lg" style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}>{prop.name}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-1 divide-y divide-slate-100">
                        {propLocations.map(loc => {
                            const openIssues = maintenanceIssues.filter(i => i.locationId === loc.id && i.status !== 'completed');
                            return (
                                <div key={loc.id} className="p-4 flex justify-between items-center border-r border-slate-100 last:border-r-0 hover:bg-[#F9F8F2]">
                                    <div><div className="font-bold text-slate-700">{loc.name}</div><div className="text-xs text-slate-500">{loc.locationType}</div></div>
                                    <div className="flex items-center space-x-4">
                                        {openIssues.length > 0 ? <button onClick={() => { setEditingMaintenanceIssue(openIssues[0]); setIsMaintenanceModalOpen(true); }} className="px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-700"><MessageSquare size={16} className="mr-2"/>{openIssues.length} Open</button> : <span className="text-xs text-green-600 font-medium">No Open Issues</span>}
                                        <button onClick={() => { setEditingMaintenanceIssue({ locationId: loc.id }); setIsMaintenanceModalOpen(true); }} className="p-2 rounded-full text-slate-400 hover:text-[#26402E]"><Plus size={18} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        })}
    </div>
  );
  };

  // --- RENDER STATS VIEW ---
  const renderStats = () => {
    const { last6Months, revenueByProp, occupancyRate, avgLeadTime } = statsData;
    
    const maxRevenue = Math.max(...last6Months.map(d => d.revenue), 1000); // Avoid div by zero

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Business Statistics</h2>
                <p className="text-slate-500">Key performance indicators for your hospitality business.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Occupancy Rate" value={`${occupancyRate}%`} icon={<Home />} subtext="Current Month Average" />
                <StatCard title="Avg Lead Time" value={`${avgLeadTime} Days`} icon={<Clock />} subtext="Booking to Check-in" />
                <StatCard title="Townhouse Rev." value={`${(revenueByProp.Townhouse/1000000).toFixed(1)}M`} icon={<DollarSign />} subtext="Total Revenue (All Time)" />
                <StatCard title="Neighbours Rev." value={`${(revenueByProp.Neighbours/1000000).toFixed(1)}M`} icon={<DollarSign />} subtext="Total Revenue (All Time)" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue Chart */}
                <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB]">
                    <h3 className="font-serif font-bold text-xl mb-6 flex items-center" style={{ color: COLORS.darkGreen }}>
                        <TrendingUp size={20} className="mr-3 text-slate-400" />
                        Monthly Revenue Trend (Last 6 Months)
                    </h3>
                    <div className="h-64 flex items-end justify-between space-x-4 mt-8">
                        {last6Months.map((data, index) => (
                            <div key={index} className="flex flex-col items-center flex-1 group">
                                <div className="w-full relative flex flex-col justify-end h-full group-hover:opacity-80 transition-opacity">
                                    <div 
                                        className="w-full rounded-t-lg transition-all duration-500"
                                        style={{ 
                                            height: `${(data.revenue / maxRevenue) * 100}%`,
                                            backgroundColor: COLORS.darkGreen,
                                            opacity: 0.8 + (index * 0.05) // Gradient effect
                                        }}
                                    ></div>
                                    {/* Tooltip on hover could go here */}
                                </div>
                                <span className="text-xs font-medium text-slate-500 mt-3">{data.month}</span>
                                <span className="text-xs font-bold text-slate-700 mt-1">{(data.revenue/1000000).toFixed(1)}M</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Property Revenue Split (Simple Visual) */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB]">
                    <h3 className="font-serif font-bold text-xl mb-6 flex items-center" style={{ color: COLORS.darkGreen }}>
                        <PieChart size={20} className="mr-3 text-slate-400" />
                        Revenue Share
                    </h3>
                    
                    <div className="space-y-6 mt-8">
                        {Object.entries(revenueByProp).map(([name, value]) => {
                            const total = revenueByProp.Townhouse + revenueByProp.Neighbours;
                            const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                            
                            return (
                                <div key={name}>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="font-bold text-slate-700">{name}</span>
                                        <span className="text-slate-500">{percent}% ({(value/1000000).toFixed(1)}M)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                        <div 
                                            className="h-full rounded-full transition-all duration-1000"
                                            style={{ 
                                                width: `${percent}%`, 
                                                backgroundColor: name === 'Townhouse' ? COLORS.darkGreen : COLORS.lime 
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-xs text-yellow-800 leading-relaxed">
                        <strong>Insight:</strong> 
                        {revenueByProp.Townhouse > revenueByProp.Neighbours 
                            ? " Townhouse is currently your top-performing property." 
                            : " Neighbours is leading in revenue generation."}
                    </div>
                </div>
            </div>
        </div>
    );
  };

  // --- RENDER INVOICE VIEW ---
  const renderInvoices = () => {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-serif font-bold mb-2" style={{ color: COLORS.darkGreen }}>Invoices</h2>
            <p className="text-slate-500">Create and manage invoices for your guests.</p>
          </div>
          <button 
            onClick={() => setIsInvoiceModalOpen(true)}
            className="px-6 py-3 rounded-full flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide"
            style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime }}
          >
            <Plus size={20} className="mr-2" />
            Create Invoice
          </button>
        </div>

        {/* Placeholder for invoice list - functionality can be expanded later */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-slate-100 mb-4 text-slate-400">
            <FileText size={48} />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">No Invoices Generated Yet</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Use the "Create Invoice" button to generate a PDF invoice for any of your existing bookings.
          </p>
        </div>
      </div>
    );
  };

  const sessionLabel = user
    ? (user.isAnonymous ? 'Session: Anonymous' : `Session: ${user.displayName || user.email || 'Staff account'}`)
    : 'Session: Signing in...';

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#F9F8F2] text-[#26402E] font-serif font-bold text-xl">Loading Kolab Living PMS...</div>;

  return (
    <div className="flex h-screen font-sans" style={{ backgroundColor: COLORS.cream }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden border-b px-6 py-4 flex items-center justify-between" style={{ backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen }}>
          <span className="font-serif font-bold text-xl text-white">Kolab Living</span>
          <button onClick={() => setSidebarOpen(true)} className="text-white"><Menu size={24} /></button>
        </header>
        <div className="flex-1 overflow-auto p-6 md:p-10">
          <div className="max-w-7xl mx-auto">
             {dataError && (
               <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
                 Firestore read error: {dataError}. Check Firestore rules/connection and reload.
               </div>
             )}
             <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:justify-between">
               <div className="text-xs text-slate-500">{sessionLabel}</div>
               <div className="flex justify-end">
                  {activeTab !== 'maintenance' && activeTab !== 'stats' && activeTab !== 'invoices' && (
                      <button onClick={() => { setEditingBooking(null); setIsModalOpen(true); }} className="px-6 py-3 rounded-full flex items-center shadow-lg transform hover:-translate-y-0.5 transition-all font-bold text-sm uppercase tracking-wide" style={{ backgroundColor: COLORS.lime, color: COLORS.darkGreen }}>
                          <Plus size={20} className="mr-2" /> New Booking
                      </button>
                  )}
               </div>
             </div>
             {activeTab === 'dashboard' && renderDashboard()}
             {activeTab === 'calendar' && renderCalendar()}
             {activeTab === 'bookings' && renderBookingsList()}
             {activeTab === 'stats' && renderStats()} 
             {activeTab === 'invoices' && renderInvoices()}
             {activeTab === 'housekeeping' && renderHousekeeping()}
             {activeTab === 'maintenance' && renderMaintenance()}
          </div>
        </div>
      </main>
      <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveBooking} booking={editingBooking} rooms={ALL_ROOMS} allBookings={bookings} checkBookingConflict={checkBookingConflict} />
      <MaintenanceModal isOpen={isMaintenanceModalOpen} onClose={() => setIsMaintenanceModalOpen(false)} onSave={handleSaveMaintenanceIssue} issue={editingMaintenanceIssue} allLocations={ALL_LOCATIONS} />
      <RecurringTaskModal isOpen={isRecurringModalOpen} onClose={() => setIsRecurringModalOpen(false)} onSave={handleSaveRecurringTask} task={editingRecurringTask} allLocations={ALL_LOCATIONS} />
      <InvoiceModal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} bookings={bookings} />
    </div>
  );
}