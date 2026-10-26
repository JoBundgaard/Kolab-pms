import { ALL_ROOMS } from '../../config/properties.js';
import { getBookingInvoiceAmount } from '../../lib/airbnb.js';
import { getLongStayCalendarMonthCount } from '../../lib/bookingDates.js';
import { parseLocalDateString } from '../../lib/dates.js';
import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const InvoiceModal = ({ isOpen, onClose, bookings }) => {
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [invoiceData, setInvoiceData] = useState(null);

  useEffect(() => {
    if (!selectedBookingId) { setInvoiceData(null); return; }
    const booking = bookings.find(b => b.id === selectedBookingId);
    if (!booking) return;

    const roomObj = ALL_ROOMS.find(r => r.id === booking.roomId);
    const roomId = roomObj?.name || booking.roomId || '';
    const roomType = roomObj?.type || '';
    const propertyName = roomObj?.propertyName || '';
    const nights = Number(booking.nights) || 0;
    const isLong = booking.isLongTerm || booking.stayCategory === 'long';

    let duration;
    if (isLong) {
      const fullCalendarMonths = getLongStayCalendarMonthCount(booking.checkIn, booking.checkOut);
      const invoiceStart = parseLocalDateString(booking.checkIn);
      const invoiceEnd = parseLocalDateString(booking.checkOut);
      const hasPartialCalendarMonth = invoiceStart.getDate() !== 1 || invoiceEnd.getDate() !== 1;
      duration = fullCalendarMonths > 0
        ? `${fullCalendarMonths} FULL CALENDAR MONTH${fullCalendarMonths === 1 ? '' : 'S'}${hasPartialCalendarMonth ? ' + PRORATED DAYS' : ''}`
        : `${nights} DAYS (PRORATED)`;
    } else {
      duration = String(nights);
    }

    const ci = (booking.checkIn || '').split('-');
    const ref = ci.length === 3
      ? `${ci[2]}${ci[1]}${roomId}`.toUpperCase()
      : `INV-${Date.now().toString().slice(-6)}`;

    setInvoiceData({
      guestName: booking.guestName || '',
      guestPhone: booking.guestPhone || booking.phone || '',
      roomId,
      roomType,
      propertyName,
      checkIn: booking.checkIn || '',
      checkOut: booking.checkOut || '',
      nights,
      duration,
      price: getBookingInvoiceAmount(booking),
      invoiceNumber: ref,
    });
  }, [selectedBookingId, bookings]);

  if (!isOpen) return null;

  const fmtAmount = (amount) => {
    const n = Number(amount);
    if (!n) return '0';
    return n >= 10000
      ? `${n.toLocaleString('vi-VN')} ₫`
      : `${n.toLocaleString('en-US')} USD`;
  };

  const fmtInvoiceDate = (dateStr, includeYear = false) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00Z');
    const opts = includeYear
      ? { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
      : { month: 'long', day: 'numeric', timeZone: 'UTC' };
    return d.toLocaleDateString('en-US', opts).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden print:shadow-none print:rounded-none print:w-full print:max-w-none">

        {/* Screen header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50 print:hidden">
          <h3 className="font-bold text-lg text-slate-800">Create Invoice</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 p-1 rounded hover:bg-slate-100">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 print:p-0">
          {/* Booking selector */}
          <div className="mb-6 print:hidden">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500">Select Booking</label>
            <select
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#E2F05D] outline-none"
              value={selectedBookingId}
              onChange={e => setSelectedBookingId(e.target.value)}
            >
              <option value="">-- Select a Guest --</option>
              {bookings.map(b => (
                <option key={b.id} value={b.id}>{b.guestName} — {b.checkIn}</option>
              ))}
            </select>
          </div>

          {invoiceData ? (
            <div className="invoice-content">

              {/* ── Top banner ── */}
              <div className="flex items-center justify-between px-8 py-5" style={{ backgroundColor: '#26402E' }}>
                {/* Logo */}
                <div className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-[#c8d89a]" style={{ backgroundColor: '#F5F0DC' }}>
                  <div className="text-center leading-none">
                    <span className="block font-bold text-xl" style={{ color: '#26402E' }}>ko</span>
                    <span className="block text-[7px] font-semibold tracking-widest uppercase" style={{ color: '#26402E' }}>living</span>
                  </div>
                </div>
                <h1 className="text-5xl font-light tracking-wide" style={{ color: '#F5F0DC' }}>Invoice</h1>
              </div>

              {/* ── Billed to ── */}
              <div className="px-8 pt-7 pb-2">
                <p className="text-xl font-bold text-slate-800 mb-3">BILLED TO:</p>
                <hr className="border-slate-300 mb-3" />
                <p className="text-sm text-slate-700 mb-1">
                  <span className="font-semibold">GUEST NAME:</span> {invoiceData.guestName}
                </p>
                {invoiceData.guestPhone && (
                  <p className="text-sm text-slate-700 mb-1">
                    <span className="font-semibold">CONTACT INFO:</span> {invoiceData.guestPhone}
                  </p>
                )}
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">INVOICE REF:</span> {invoiceData.invoiceNumber}
                </p>
                <hr className="border-slate-300 mt-3" />
              </div>

              {/* ── Line items ── */}
              <table className="w-full mt-2">
                <thead>
                  <tr style={{ backgroundColor: '#d4edaa' }}>
                    <th className="px-8 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-700">Room Info</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-700 w-36">Duration (Days)</th>
                    <th className="px-8 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-700 w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-8 py-5 text-sm">
                      <p className="font-bold text-slate-800">{invoiceData.roomType} ROOM {invoiceData.roomId}</p>
                      <p className="text-slate-500 mt-1">
                        {fmtInvoiceDate(invoiceData.checkIn)} – {fmtInvoiceDate(invoiceData.checkOut, true)}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">Included all listed services as mentioned in the contract</p>
                    </td>
                    <td className="px-4 py-5 text-center text-sm text-slate-700">{invoiceData.duration}</td>
                    <td className="px-8 py-5 text-right text-sm text-slate-700">{fmtAmount(invoiceData.price)}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Totals ── */}
              <div className="px-8 pt-4 pb-8">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-t border-slate-200">
                      <td className="py-3 text-slate-700">TOTAL AMOUNT</td>
                      <td className="py-3 text-right text-slate-700">{fmtAmount(invoiceData.price)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="py-3 text-slate-700">VAT (8%)</td>
                      <td className="py-3 text-right text-slate-700">0</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="py-2" colSpan={2}>
                        <table className="w-full" style={{ backgroundColor: '#d4edaa' }}>
                          <tbody>
                            <tr>
                              <td className="px-3 py-3 font-bold text-slate-800">TOTAL</td>
                              <td className="px-3 py-3 text-right font-bold text-slate-800">{fmtAmount(invoiceData.price)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl print:hidden">
              Select a booking above to generate an invoice preview.
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t flex justify-end space-x-3 print:hidden">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center transition-colors">
            <X size={16} className="mr-2" /> Close
          </button>
          <button
            onClick={() => window.print()}
            disabled={!invoiceData}
            className={`px-6 py-2 rounded-lg flex items-center transition-colors ${
              invoiceData ? 'bg-[#26402E] text-white hover:bg-[#1a2e20] shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Download size={16} className="mr-2" /> Download PDF
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fixed.inset-0, .fixed.inset-0 * { visibility: visible; }
          .fixed.inset-0 {
            position: absolute; left: 0; top: 0;
            width: 100%; height: 100%;
            background: white; padding: 0;
          }
          .bg-slate-900\\/60 { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .invoice-content { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default InvoiceModal;
