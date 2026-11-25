import { addDays, addMonths, addYears, formatDate } from './dates.js';

export const severityMeta = (sev) => {
  const key = sev || 'normal';
  if (key === 'critical') return { label: 'Critical', color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500' };
  if (key === 'low') return { label: 'Low', color: 'text-slate-600', bg: 'bg-slate-50', dot: 'bg-slate-400' };
  return { label: 'Normal', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' };
};

export const normalizeDescription = (text) => (text || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const buildRecurringGroupKey = (task) => `${normalizeDescription(task.description)}|${task.frequency || 'monthly'}`;

export const computeDuplicateIssues = (issues) => {
  const buckets = {};
  issues.forEach((issue) => {
    const dateKey = formatDate(issue.reportedAt || issue.createdAt || new Date());
    const descKey = normalizeDescription(issue.description);
    const primaryKey = issue.recurringTaskId
      ? `${issue.recurringTaskId}|${issue.recurringDueDateKey || dateKey}|${issue.locationId || 'unknown'}`
      : `${descKey}|${issue.locationId || 'unknown'}|${dateKey}`;
    if (!buckets[primaryKey]) buckets[primaryKey] = [];
    buckets[primaryKey].push(issue);
  });

  const duplicates = [];
  Object.values(buckets).forEach((list) => {
    if (list.length <= 1) return;
    const sorted = [...list].sort((a, b) => new Date(a.reportedAt || a.createdAt || 0) - new Date(b.reportedAt || b.createdAt || 0));
    duplicates.push(...sorted.slice(1)); // keep oldest, mark rest as dupes
  });
  return duplicates;
};

export const RECURRING_FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'every_45_days', label: 'Every 45 days' },
  { value: 'bimonthly', label: 'Every 2 months (bi-monthly)' },
  { value: 'every_3_months', label: 'Every 3 months' },
  { value: 'every_4_months', label: 'Every 4 months' },
  { value: 'every_5_months', label: 'Every 5 months' },
  { value: 'every_6_months', label: 'Every 6 months' },
  { value: 'yearly', label: 'Yearly' },
];

export const FREQUENCY_LABELS = RECURRING_FREQUENCY_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

export const getFrequencyLabel = (frequency) => FREQUENCY_LABELS[frequency] || frequency || 'Monthly';

export const getNextRecurringDueDate = (dateStr, frequency) => {
  switch (frequency) {
    case 'weekly':
      return addDays(dateStr, 7);
    case 'every_45_days':
      return addDays(dateStr, 45);
    case 'bimonthly':
      return addMonths(dateStr, 2);
    case 'every_3_months':
      return addMonths(dateStr, 3);
    case 'every_4_months':
      return addMonths(dateStr, 4);
    case 'every_5_months':
      return addMonths(dateStr, 5);
    case 'every_6_months':
      return addMonths(dateStr, 6);
    case 'yearly':
      return addYears(dateStr, 1);
    case 'monthly':
    default:
      return addMonths(dateStr, 1);
  }
};
