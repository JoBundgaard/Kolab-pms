export const normalizeEmail = (email) => {
  if (!email) return null;
  const trimmed = String(email).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

export const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, '');
  if (!digits) return null;
  return digits;
};

export const normalizeName = (name) => {
  if (!name) return null;
  const normalized = String(name).trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || null;
};
