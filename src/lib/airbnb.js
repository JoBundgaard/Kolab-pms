import { formatDate } from './dates.js';

export const AIRBNB_COMMISSION_BASE_RATE = 0.155;

export const AIRBNB_COMMISSION_VAT_RATE = 0.10;

export const AIRBNB_COMMISSION_RATE = AIRBNB_COMMISSION_BASE_RATE * (1 + AIRBNB_COMMISSION_VAT_RATE);

export const AIRBNB_PAYOUT_RATE = 1 - AIRBNB_COMMISSION_RATE;

export const AIRBNB_VAT_RATE = 0.05;

export const AIRBNB_INCOME_TAX_RATE = 0.02;

export const AIRBNB_TAX_WITHHOLDING_END_DATE = '2026-07-19';

export const isAirbnbTaxExemptBooking = (booking) => {
  const checkIn = formatDate(booking?.checkIn || booking?.startDate || '');
  return !!checkIn && checkIn >= AIRBNB_TAX_WITHHOLDING_END_DATE;
};

export const deriveAirbnbGrossAmount = (booking) => {
  const legacyBase = Number(booking?.airbnbBaseEarningsVnd ?? booking?.netEarningsFromEmail);
  if (Number.isFinite(legacyBase) && legacyBase > 0) return Math.round(legacyBase);

  const explicitGross = Number(booking?.grossPrice);
  if (Number.isFinite(explicitGross) && explicitGross > 0) return Math.round(explicitGross);

  const payoutBeforeTax = Number(booking?.price);
  if (Number.isFinite(payoutBeforeTax) && payoutBeforeTax > 0) {
    return Math.round(payoutBeforeTax / AIRBNB_PAYOUT_RATE);
  }

  return null;
};

export const computeAirbnbWithholding = (booking) => {
  const channel = (booking?.channel || '').toLowerCase();
  const baseEarnings = deriveAirbnbGrossAmount(booking);
  const hasBaseEarnings = Number.isFinite(baseEarnings) && baseEarnings > 0;

  const base = {
    status: 'not_applicable',
    grossPrice: booking?.grossPrice ?? null,
    commissionWithheld: null,
    vatWithheld: null,
    incomeTaxWithheld: null,
    totalWithheld: null,
    finalCountedIncome: null,
    netEarningsFromEmail: booking?.netEarningsFromEmail ?? null,
    airbnbBaseEarningsVnd: booking?.airbnbBaseEarningsVnd ?? booking?.netEarningsFromEmail ?? null,
  };

  if (channel !== 'airbnb') return base;

  if (!hasBaseEarnings) {
    return {
      ...base,
      status: 'withholding_unknown',
      grossPrice: booking?.grossPrice ?? null,
      netEarningsFromEmail: booking?.netEarningsFromEmail ?? null,
      airbnbBaseEarningsVnd: booking?.airbnbBaseEarningsVnd ?? booking?.netEarningsFromEmail ?? null,
    };
  }

  const commissionWithheld = Math.round(baseEarnings * AIRBNB_COMMISSION_RATE);
  const payoutBeforeTax = Math.round(baseEarnings - commissionWithheld);
  const taxExempt = isAirbnbTaxExemptBooking(booking);
  const vatWithheld = taxExempt ? 0 : Math.round(baseEarnings * AIRBNB_VAT_RATE);
  const incomeTaxWithheld = taxExempt ? 0 : Math.round(baseEarnings * AIRBNB_INCOME_TAX_RATE);
  const totalWithheld = commissionWithheld + vatWithheld + incomeTaxWithheld;
  const finalCountedIncome = Math.round(baseEarnings - totalWithheld);

  return {
    status: 'computed',
    taxExempt,
    grossPrice: baseEarnings,
    payoutBeforeTax,
    commissionWithheld,
    vatWithheld,
    incomeTaxWithheld,
    totalWithheld,
    finalCountedIncome,
    netEarningsFromEmail: baseEarnings,
    airbnbBaseEarningsVnd: baseEarnings,
  };
};

export const getDisplayPriceForBooking = (booking) => {
  if (!booking) return 0;
  const withholding = booking._withholding || computeAirbnbWithholding(booking);
  if (withholding.status === 'computed' && Number.isFinite(withholding.finalCountedIncome)) {
    return withholding.finalCountedIncome;
  }
  const explicitFinal = Number(booking.finalCountedIncome);
  if (Number.isFinite(explicitFinal) && explicitFinal > 0) return explicitFinal;
  return Number(booking.price) || 0;
};

export const getBookingInvoiceAmount = (booking) => {
  if (!booking) return 0;
  if ((booking.channel || '').toLowerCase() === 'airbnb') {
    const grossAmount = deriveAirbnbGrossAmount(booking);
    if (Number.isFinite(grossAmount) && grossAmount > 0) return grossAmount;
  }
  return Number(booking.price) || 0;
};
