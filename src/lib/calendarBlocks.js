import { isCancelledStatus } from './bookingDates.js';
import { formatDate } from './dates.js';

export const getCalendarBlockStatusClass = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'checked-in') return 'bg-[#26402E] text-[#E2F05D]';
  if (normalizedStatus === 'confirmed') return 'bg-[#E2F05D] text-[#26402E]';
  if (normalizedStatus === 'pending') return 'bg-amber-50 text-amber-700';
  if (normalizedStatus === 'checked-out') return 'bg-slate-100 text-slate-600';
  if (isCancelledStatus(normalizedStatus)) return 'bg-rose-100 text-rose-700';
  return 'bg-slate-300 text-slate-600';
};

export const getCalendarPmsBlockClass = (blockType) => {
  if (blockType === 'long_term_priority') return 'bg-slate-400/95 text-white';
  if (blockType === 'owner_hold') return 'bg-slate-500/95 text-white';
  if (blockType === 'manual_block') return 'bg-slate-300/95 text-slate-800';
  return 'bg-slate-300/95 text-slate-800';
};

export const CALENDAR_BLOCK_TYPE_OPTIONS = [
  { value: 'long_term_priority', label: 'Long-term priority' },
  { value: 'owner_hold', label: 'Owner hold' },
  { value: 'manual_block', label: 'Manual block' },
  { value: 'other', label: 'Other' },
];

export const normalizeCalendarBlock = (block = {}) => {
  const startDate = formatDate(block?.startDate || block?.checkIn || '');
  const endDate = formatDate(block?.endDate || block?.checkOut || '');
  const blockType = block?.blockType || 'long_term_priority';
  const title = (block?.title || '').trim();
  const notes = (block?.notes || '').trim();
  return {
    ...block,
    startDate,
    endDate,
    blockType,
    title,
    notes,
    roomId: block?.roomId || '',
    createdAt: block?.createdAt || null,
    updatedAt: block?.updatedAt || null,
  };
};

export const getCalendarBlockLabel = (block) => {
  if (block?.title) return block.title;
  const match = CALENDAR_BLOCK_TYPE_OPTIONS.find((option) => option.value === block?.blockType);
  return match?.label || 'PMS block';
};

export const calendarBlockOccupiesDate = (block, dateStr, roomId = null) => {
  if (!block || !dateStr) return false;
  const normalized = normalizeCalendarBlock(block);
  if (!normalized.roomId || !normalized.startDate || !normalized.endDate) return false;
  if (roomId && normalized.roomId !== roomId) return false;
  return normalized.startDate <= dateStr && normalized.endDate > dateStr;
};

export const getCalendarBlockDateKeys = (block) => {
  const normalized = normalizeCalendarBlock(block);
  if (!normalized.startDate || !normalized.endDate || normalized.startDate >= normalized.endDate) return [];
  const keys = [];
  for (let ts = new Date(normalized.startDate).getTime(); ts < new Date(normalized.endDate).getTime(); ts += 86_400_000) {
    keys.push(formatDate(new Date(ts)));
  }
  return keys;
};
