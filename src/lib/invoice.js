import { classifyStay, rentMonthPeriods } from '../../functions/lib/rentMonths.mjs';
import { calculateLongTermRentForRange, countBookingBreakNightsForRange, getBookingFinancialCheckOut, getBookingRoomStays } from './bookingDates.js';
import { ALL_ROOMS } from '../config/properties.js';
import { getBookingInvoiceAmount } from './airbnb.js';
import { calculateNights } from './dates.js';

export const invoiceAddress = '8/4B Đinh Tiên Hoàng\nPhường Sài Gòn, TP Hồ Chí Minh';
export const cancellationPolicy = [
  'Please cancel 30 days prior to the check-in time (2PM) on the arrival date to receive a full refund of the deposit.',
  'A booking confirmation and room reservation will only happen after the deposit has been received.',
  'Please note that while we accept a variety of payment methods, any applicable transfer fees are the responsibility of the sender. Kindly ensure that the full amount specified above reaches us after any fees have been deducted.',
].join('\n\n');

export function invoiceFromBooking(booking) {
  const room = ALL_ROOMS.find((r) => r.id === booking.roomId);
  const amount = getBookingInvoiceAmount(booking);
  const quantity = Math.max(1, calculateNights(booking.checkIn, booking.checkOut) || Number(booking.nights) || 1);
  const monthly = classifyStay(booking) === 'long' && booking.monthlyRentVnd != null && booking.monthlyRentVnd !== '';
  const items = [];
  const describe = (roomId) => {
    const detail = ALL_ROOMS.find((r) => r.id === roomId);
    return `${detail?.type || 'Room'} ${detail?.name || roomId || ''}${detail?.propertyName ? ` at ${detail.propertyName}` : ''}`;
  };
  if (monthly) {
    for (const period of rentMonthPeriods(booking.checkIn, getBookingFinancialCheckOut(booking), booking.rentPeriodBasis)) {
      for (const stay of getBookingRoomStays(booking, { mode: 'financial' })) {
        const startDate = stay.startDate > period.start ? stay.startDate : period.start;
        const endDate = stay.endDate < period.end ? stay.endDate : period.end;
        if (startDate >= endDate) continue;
        const nights = calculateNights(startDate, endDate) - countBookingBreakNightsForRange(booking, startDate, endDate);
        if (nights <= 0) continue;
        const fullMonth = startDate === period.start && endDate === period.end && nights === period.days;
        const item = { description: `${describe(stay.roomId)}${fullMonth ? ' - monthly rent' : ' - prorated rent'}`, startDate, endDate, quantity: fullMonth ? 1 : nights, unit: fullMonth ? 'month' : 'night', amount: calculateLongTermRentForRange(booking, startDate, endDate), rate: stay.monthlyRentVnd };
        const previous = items.at(-1);
        if (fullMonth && previous?.unit === 'month' && previous.description === item.description && previous.rate === item.rate && previous.endDate === startDate) {
          previous.quantity++;
          previous.endDate = endDate;
          previous.amount += item.amount;
        } else items.push(item);
      }
    }
  } else items.push({ description: describe(booking.roomId), startDate: booking.checkIn || '', endDate: booking.checkOut || '', quantity, unit: 'night', amount });
  return {
    guestName: booking.guestName || '',
    invoiceNumber: `INV-${booking.checkIn || ''}-${room?.name || booking.roomId || ''}`,
    currency: monthly ? 'VND' : booking.currency || (amount >= 10000 ? 'VND' : 'USD'),
    payableNow: '',
    policy: cancellationPolicy,
    items,
  };
}
export const invoiceQuantity = (item) => `${item.quantity}${item.unit ? ` ${item.unit}${Number(item.quantity) === 1 ? '' : 's'}` : ''}`;
export const invoiceSubtotal = (data) => data.items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
export const invoiceMoney = (amount, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount) || 0);
export const invoicePeriod = (item) => [item.startDate, item.endDate].map((date) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '').filter(Boolean).join(' - ');

export function buildInvoiceDefinition(data) {
  const subtotal = invoiceSubtotal(data);
  const deposit = Number(data.payableNow);
  if (!data.guestName.trim() || !data.invoiceNumber.trim()) throw new Error('Enter the guest name and invoice number.');
  if (!data.items.length || data.items.some((item) => !item.description.trim() || !item.startDate || !item.endDate || item.endDate <= item.startDate || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0)) throw new Error('Complete every line item with valid dates, a positive quantity and a non-negative amount.');
  if (data.payableNow === '' || !Number.isFinite(deposit) || deposit < 0 || deposit > subtotal) throw new Error('Enter a payable-now amount between zero and the subtotal.');
  const money = (value) => invoiceMoney(value, data.currency);
  return {
    pageSize: 'A4', pageMargins: [56, 50, 56, 50],
    info: { title: `Invoice ${data.invoiceNumber}` },
    background: () => ({ canvas: [{ type: 'rect', x: 35, y: 35, w: 525, h: 772, color: '#fffbe3' }] }),
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111111' },
    content: [
      { table: { widths: ['*'], body: [[{ stack: [{ text: 'INVOICE', bold: true, fontSize: 19 }, { text: 'Kolab Living', fontSize: 13, margin: [0, 3, 0, 3] }, { text: invoiceAddress, fontSize: 9 }], fillColor: '#30492f', color: '#fffbe3', margin: [25, 20, 25, 20] }]] }, layout: 'noBorders', margin: [-21, -15, -21, 25] },
      { columns: [ { width: '*', stack: [{ text: 'Invoice for', bold: true, margin: [0, 0, 0, 5] }, { text: data.guestName }] }, { width: '*', stack: [{ text: 'Payable to', bold: true, margin: [0, 0, 0, 5] }, { text: 'Kolab Living Company Limited' }, { text: invoiceAddress, margin: [0, 4, 0, 0] }] }, { width: 100, stack: [{ text: 'Invoice #', bold: true, margin: [0, 0, 0, 5] }, { text: data.invoiceNumber }] }], columnGap: 16, margin: [0, 0, 0, 35] },
      { table: { headerRows: 1, widths: ['*', 60, 65, 65], body: [
        ['Description', 'Qty', 'Unit price', 'Total price'].map((text, i) => ({ text, bold: true, alignment: i ? 'right' : 'left', margin: [0, 8, 0, 8] })),
        ...data.items.map((item) => [{ stack: [{ text: item.description }, { text: invoicePeriod(item), fontSize: 9, margin: [0, 3, 0, 0] }], margin: [0, 5, 0, 8] }, { text: invoiceQuantity(item), alignment: 'right' }, { text: money(Number(item.amount) / Number(item.quantity)), alignment: 'right' }, { text: money(item.amount), alignment: 'right' }]),
      ] }, layout: { hLineWidth: (i) => i === 0 ? 0.6 : 0, vLineWidth: () => 0, hLineColor: () => '#c7c7b9', paddingLeft: () => 0, paddingRight: () => 5 }, margin: [0, 0, 0, 35] },
      { table: { widths: ['*', 100], body: [['Subtotal', money(subtotal)], ['Payable now:', money(deposit)], ['Payment on arrival:', money(Math.round((subtotal - deposit) * 100) / 100)]].map(([label, value]) => [{ text: label, alignment: 'right', bold: true }, { text: value, alignment: 'right', bold: true }]) }, layout: 'noBorders', margin: [200, 0, 0, 12] },
      { text: 'Cancellation Policy:', bold: true, margin: [0, 8, 0, 12] },
      { text: data.policy, fontSize: 9, lineHeight: 1.15 },
    ],
  };
}
export async function downloadInvoice(data) {
  const definition = buildInvoiceDefinition(data);
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  await pdfMake.createPdf(definition).download(`${data.invoiceNumber.replace(/[^a-z0-9_-]/gi, '-')}.pdf`);
}
