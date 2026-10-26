import { accountSummary, propertyToday } from '../../../functions/lib/crmFinance.mjs';
import { COLORS } from '../../config/pms.js';
import { ALL_ROOMS } from '../../config/properties.js';
import { getDisplayPriceForBooking } from '../../lib/airbnb.js';
import { getBookingChannelForDate, getBookingChannelSummary, getBookingEarlyCheckoutMeta, getBookingFinancialCheckOut, getBookingOccupancyCheckOut, getBookingRoomIdForDate } from '../../lib/bookingDates.js';
import { addDays, calculateNights } from '../../lib/dates.js';
import { formatCurrencyVND } from '../../lib/formatting.js';
import { Edit2, Search, Sunrise, Trash2 } from 'lucide-react';

export default function BookingsView({
  TODAY_STR,
  bookingCategoryFilter,
  bookingSearchTerm,
  bookingTimeFilter,
  bookings,
  crm,
  formatChannelLabel,
  formatStayCategoryLabel,
  getBookingStayCategory,
  handleDeleteBooking,
  setBookingCategoryFilter,
  setBookingSearchTerm,
  setBookingTimeFilter,
  setEditingBooking,
  setIsModalOpen,
}) {
    const statusRank = {
      'checked-in': 0,
      confirmed: 1,
      pending: 2,
      'checked-out': 3,
      cancelled: 4,
    };

    const todayTs = new Date(TODAY_STR).getTime();

    const searchNorm = (bookingSearchTerm || '').trim().toLowerCase();

    const filteredBookings = bookings
      .filter((b) => {
        const stayCat = getBookingStayCategory(b);
        if (bookingCategoryFilter !== 'all' && stayCat !== bookingCategoryFilter) return false;

        const checkInTs = new Date(b.checkIn).getTime();
        const occupancyCheckOut = getBookingOccupancyCheckOut(b);
        const checkOutTs = new Date(occupancyCheckOut).getTime();

        if (bookingTimeFilter === 'current') return todayTs >= checkInTs && todayTs < checkOutTs;
        if (bookingTimeFilter === 'future') return checkInTs > todayTs;
        if (bookingTimeFilter === 'past') return checkOutTs < todayTs;
        return true;
      })
      .filter((b) => {
        if (!searchNorm) return true;
        const guest = (b.guestName || '').toLowerCase();
        const email = (b.guestEmail || '').toLowerCase();
        const phone = (b.guestPhone || '').toLowerCase();
        const roomName = (ALL_ROOMS.find((r) => r.id === b.roomId)?.name || '').toLowerCase();
        const propertyName = (ALL_ROOMS.find((r) => r.id === b.roomId)?.propertyName || '').toLowerCase();
        const channel = [getBookingChannelSummary(b), ...(b.roomMoves || []).map((move) => move.channel || '')].join(' ').toLowerCase();
        const dates = `${b.checkIn} ${b.checkOut}`.toLowerCase();
        return [guest, email, phone, roomName, propertyName, channel, dates].some((field) => field.includes(searchNorm));
      })
      .sort((a, b) => {
        const rankA = statusRank[a.status] ?? 5;
        const rankB = statusRank[b.status] ?? 5;
        if (rankA !== rankB) return rankA - rankB;
        const aCheckIn = new Date(a.checkIn).getTime();
        const bCheckIn = new Date(b.checkIn).getTime();
        return aCheckIn - bCheckIn;
      });

    const timeTabs = [
      { id: 'current', label: 'Current' },
      { id: 'future', label: 'Future' },
      { id: 'past', label: 'Past' },
    ];

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
        <div className="p-6 border-b border-[#E5E7EB] space-y-4 bg-[#F9F8F2]">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 className="text-xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>All Bookings</h2>
            <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <input
                   type="text"
                   value={bookingSearchTerm}
                   onChange={(e) => setBookingSearchTerm(e.target.value)}
                   placeholder="Search guest, room, channel, dates"
                   className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-full text-sm focus:ring-2 focus:ring-[#E2F05D] focus:border-[#26402E] outline-none w-64 shadow-sm bg-white"
                    />
                    <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
              </div>
              <select
                value={bookingCategoryFilter}
                onChange={(e) => setBookingCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-full text-sm bg-white shadow-sm"
              >
                <option value="all">All Categories</option>
                <option value="short">Short Term</option>
                <option value="medium">Medium Term</option>
                <option value="long">Long Term</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {timeTabs.map((tab) => {
              const active = bookingTimeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBookingTimeFilter(tab.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${active ? 'bg-[#26402E] text-[#E2F05D] border-[#26402E]' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#26402E] text-white text-xs uppercase font-bold tracking-wider">
              <tr><th className="px-6 py-4">Guest</th><th className="px-6 py-4">Room</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Channel</th><th className="px-6 py-4">Dates</th><th className="px-6 py-4">Price</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBookings.length === 0 ? <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-500">No bookings found for this view.</td></tr> : filteredBookings
              .map((booking) => {
                  const earlyCheckoutMeta = getBookingEarlyCheckoutMeta(booking);
                  const occupancyCheckOut = getBookingOccupancyCheckOut(booking) || booking.checkOut;
                  const financialCheckOut = getBookingFinancialCheckOut(booking) || booking.checkOut;
                  const bookingNights = booking.nights || calculateNights(booking.checkIn, booking.checkOut);
                  const billableNights = calculateNights(booking.checkIn, financialCheckOut) || bookingNights;
                  const displayPrice = getDisplayPriceForBooking(booking);
                  const perNight = billableNights > 0 ? Math.round(displayPrice / billableNights) : 0;
                  const stayCat = getBookingStayCategory(booking);
                  const displayRoomDate = bookingTimeFilter === 'current' ? TODAY_STR : (bookingTimeFilter === 'past' ? addDays(occupancyCheckOut, -1) : booking.checkIn);
                  const displayRoomId = getBookingRoomIdForDate(booking, displayRoomDate);
                  const displayRoom = ALL_ROOMS.find((r) => r.id === displayRoomId) || ALL_ROOMS.find((r) => r.id === booking.roomId);
                  const channelValue = getBookingChannelForDate(booking, displayRoomDate);
                  const guestFinancialAccount = crm.accounts.find((account) => account.bookingId === booking.id);
                  const guestPaymentSummary = accountSummary(booking, guestFinancialAccount, propertyToday());
                  const isPastContext = bookingTimeFilter === 'past';
                  const rowTone = isPastContext ? 'text-slate-500' : 'text-slate-700';
                  const rowBg = booking.status === 'checked-in' ? 'bg-lime-50' : booking.status === 'confirmed' ? 'bg-white' : 'bg-white';
                  const statusBadgeClass = (() => {
                    if (booking.status === 'checked-in') return 'bg-[#26402E] text-[#E2F05D] border-[#26402E]';
                    if (booking.status === 'confirmed') return 'bg-[#E2F05D]/20 text-[#4c5c23] border-[#E2F05D]/50';
                    if (booking.status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
                    if (booking.status === 'checked-out') return 'bg-slate-100 text-slate-600 border-slate-200';
                    return 'bg-slate-100 text-slate-600 border-slate-200';
                  })();
                  return (
                <tr key={booking.id} className={`${rowBg} hover:bg-[#F9F8F2] transition-colors group ${rowTone}`}>
                  <td className="px-6 py-4 font-bold flex items-center gap-2">
                    <span className={`${isPastContext ? 'text-slate-600' : 'text-slate-800'}`}>{booking.guestName}</span>
                    {booking.earlyCheckIn && <Sunrise size={16} className="text-orange-500"/>}
                    {booking.isReturningGuest && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Returning</span>
                    )}
                    {booking.bikeParkingNeeded && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-white text-slate-700 border-slate-200">Bike {booking.bikeCount || 1}</span>
                    )}
                    {earlyCheckoutMeta.endedEarly && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Ended early</span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${stayCat === 'long' ? 'bg-blue-50 text-blue-700 border-blue-200' : stayCat === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {formatStayCategoryLabel(stayCat)}
                    </span>
                  </td>
                  <td className={`px-6 py-4 font-semibold ${isPastContext ? 'text-slate-600' : 'text-slate-800'}`}>
                    {displayRoom?.name || 'Unknown room'}
                    <div className="text-xs opacity-60">{displayRoom?.propertyName || 'Unknown property'}</div>
                    {booking.hasMultipleRoomStay && (booking.roomMoves || []).length > 0 && (
                      <div className="text-[11px] text-slate-500 mt-1">{(booking.roomMoves || []).length} room change{(booking.roomMoves || []).length === 1 ? '' : 's'}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusBadgeClass}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${channelValue === 'direct' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : channelValue === 'coliving' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      {formatChannelLabel(channelValue)}
                    </span>
                    {getBookingChannelSummary(booking) === 'mixed' && (
                      <span className="ml-2 text-xs text-slate-500">Segmented</span>
                    )}
                    <span className="ml-2 text-xs text-slate-500">{channelValue === 'airbnb' ? 'Prepaid via Airbnb' : crm.loading || crm.error ? 'Payment records unavailable' : guestPaymentSummary.needsSetup ? 'Review payments in CRM' : `${formatCurrencyVND(guestPaymentSummary.totalOutstanding)} open`}</span>
                  </td>
                  <td className={`px-6 py-4 text-sm ${isPastContext ? 'text-slate-500' : 'text-slate-700'}`}>
                    <div className={`font-semibold ${isPastContext ? 'text-slate-600' : 'text-slate-800'}`}>{booking.checkIn}</div>
                    <div className={`${isPastContext ? 'text-slate-500' : 'text-slate-600'}`}>{booking.checkOut}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {bookingNights} night{bookingNights !== 1 ? 's' : ''}
                      {earlyCheckoutMeta.endedEarly ? ` booked · moved out ${earlyCheckoutMeta.actualCheckoutDate}` : ''}
                    </div>
                    {earlyCheckoutMeta.endedEarly && (
                      <div className="text-xs mt-1 text-amber-700">
                        {earlyCheckoutMeta.reimbursed ? 'Unused days reimbursed' : 'Unused days not reimbursed'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {displayPrice.toLocaleString('vi-VN')} ₫
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
  }
