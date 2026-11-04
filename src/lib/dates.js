

export const formatDate = (date) => {
  const input = date?.toDate ? date.toDate() : date;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export function getWeekdayKey(dateStr) {
  const d = new Date(dateStr);
  const idx = d.getDay();
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[idx];
}

export const calculateNights = (checkInDateStr, checkOutDateStr) => {
  const checkInInput = checkInDateStr?.toDate ? checkInDateStr.toDate() : checkInDateStr;
  const checkOutInput = checkOutDateStr?.toDate ? checkOutDateStr.toDate() : checkOutDateStr;
  const checkIn = new Date(checkInInput);
  const checkOut = new Date(checkOutInput);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return 0;
  }
  const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const addMonths = (dateStr, months = 1) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setMonth(d.getMonth() + months);
  return formatDate(d);
};

export const addDays = (dateStr, days = 1) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

export const getWeekMonday = (date) => {
  const d = new Date(typeof date === 'string' ? date + 'T00:00:00' : date);
  if (isNaN(d.getTime())) return formatDate(new Date());
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
};

export const addYears = (dateStr, years = 1) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setFullYear(d.getFullYear() + years);
  return formatDate(d);
};

export const parseLocalDateString = (dateStr) => {
  if (!dateStr) return new Date('');
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    return new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  }
  return new Date(dateStr);
};

export const getMonthBounds = (monthValue) => {
  if (!/^\d{4}-\d{2}$/.test(monthValue || '')) return { startDate: '', endDate: '' };
  const [yearStr, monthStr] = monthValue.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return { startDate: '', endDate: '' };
  }
  return {
    startDate: formatDate(new Date(year, monthIndex, 1)),
    endDate: formatDate(new Date(year, monthIndex + 1, 0)),
  };
};

export const getDateRangeDays = (startDate, endDate) => {
  if (!startDate || !endDate || startDate > endDate) return [];
  const days = [];
  let current = startDate;
  let guard = 0;
  while (current <= endDate && guard < 370) {
    days.push(current);
    const next = addDays(current, 1);
    if (next === current) break;
    current = next;
    guard += 1;
  }
  return days;
};

export const getWeekdayLabel = (dateStr) => {
  const date = parseLocalDateString(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

export const timeToMinutes = (timeStr, fallbackMinutes = 0) => {
  if (typeof timeStr !== 'string') return fallbackMinutes;
  const [h, m] = timeStr.split(':').map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallbackMinutes;
  return h * 60 + m;
};

export const minutesToTime = (mins) => {
  if (!Number.isFinite(mins)) return '';
  const clamped = Math.max(0, Math.round(mins));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`;
};

export const getDaysArray = (start, end) => {
  const arr = [];
  for(let dt = new Date(start); dt <= end; dt.setDate(dt.getDate()+1)){
      arr.push(new Date(dt));
  }
  return arr;
};
