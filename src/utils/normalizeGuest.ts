export const normalizeEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

export const normalizePhone = (phone?: string | null): string | null => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, '');
  if (!digits) return null;
  return digits;
};

export const normalizeName = (name?: string | null): string | null => {
  if (!name) return null;
  const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || null;
};
