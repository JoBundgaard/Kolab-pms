import { accountSummary, propertyToday } from '../../../functions/lib/crmFinance.mjs';
import StatCard from '../../components/common/StatCard.jsx';
import { COLORS } from '../../config/pms.js';
import { ALL_ROOMS, isRoomOpenOnDate } from '../../config/properties.js';
import { bookingOccupiesDate, expandBookingToRoomStays, isCancelledStatus } from '../../lib/bookingDates.js';
import { formatCurrencyVND } from '../../lib/formatting.js';
import { splitCleaningByPriority } from '../../lib/housekeepingSchedule.js';
import { AlertTriangle, CheckCircle, Clock, Sunrise } from 'lucide-react';

export default function DashboardView({
  TODAY_STR,
  TOMORROW_STR,
  bookings,
  cleaningTasks,
  cleaningTasksTomorrow,
  crm,
  isResolvedStatus,
  maintenanceIssues,
  openBookingDetails,
  setActiveTab,
  tomorrowHighPriorityRooms,
  tomorrowLowPriorityRooms,
  tomorrowNormalPriorityRooms,
}) {
    const occupancyBookings = bookings.flatMap((booking) => expandBookingToRoomStays(booking));
    const activeBookings = occupancyBookings.filter((b) => !isCancelledStatus(b.status) && bookingOccupiesDate(b, TODAY_STR, b.roomId));
    const checkingIn = occupancyBookings.filter((b) => b.checkIn === TODAY_STR && b.status !== 'cancelled');
    const checkingOutToday = occupancyBookings.filter((b) => b.checkOut === TODAY_STR && b.status !== 'cancelled');
    const checkingInTomorrow = occupancyBookings.filter((b) => b.checkIn === TOMORROW_STR && b.status !== 'cancelled');
    const checkingOutTomorrow = occupancyBookings.filter((b) => b.checkOut === TOMORROW_STR && b.status !== 'cancelled');

    const openRoomsToday = ALL_ROOMS.filter((room) => isRoomOpenOnDate(room.id, TODAY_STR));
    const occupancyRate = openRoomsToday.length > 0 ? Math.round((activeBookings.length / openRoomsToday.length) * 100) : 0;
    const tasksTodayCount = cleaningTasks ? cleaningTasks.length : 0;
    const tasksTomorrowCount = cleaningTasksTomorrow ? cleaningTasksTomorrow.length : 0;
    const openMaintenanceIssues = maintenanceIssues.filter(i => !isResolvedStatus(i.status)).length;
    const {
      high: todayHighPriorityRooms,
      normal: todayNormalPriorityRooms,
      low: todayLowPriorityRooms,
    } = splitCleaningByPriority(cleaningTasks);

    const findIncomingForDate = (roomId, targetDate) => occupancyBookings.find(
      (b) => b.roomId === roomId && b.checkIn === targetDate && !isCancelledStatus(b.status)
    );

    const findInHouseForDate = (roomId, targetDate) => occupancyBookings.find(
      (b) => b.roomId === roomId && !isCancelledStatus(b.status) && bookingOccupiesDate(b, targetDate, roomId)
    );

    const getRoomTagClasses = (roomId, { highlightPriority, highlightWeekly } = {}) => {
      const room = ALL_ROOMS.find(r => r.id === roomId);
      const isTownhouse = room?.propertyName === 'Townhouse';
      const base = 'text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1';
      const palette = isTownhouse
        ? 'bg-[#26402E] text-[#E2F05D] border-[#26402E]'
        : 'bg-[#E2F05D] text-[#26402E] border-[#E2F05D]';
      const priorityOutline = highlightPriority ? 'outline outline-2 outline-red-400/70' : '';
      const weeklyOutline = highlightWeekly ? 'outline outline-2 outline-blue-400/70' : '';
      return `${base} ${palette} ${priorityOutline} ${weeklyOutline}`.trim();
    };

    const rowIcon = (icon) => <span className="text-sm mr-2">{icon}</span>;

    const interactiveHandlers = (bookingId) => ({
      role: 'button',
      tabIndex: 0,
      onClick: () => openBookingDetails(bookingId),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBookingDetails(bookingId);
        }
      },
    });

    const renderPlanGroup = (items, accentDotClass, targetDate) => (
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">No rooms in this category.</div>
        ) : (
          items.map((task) => {
            const incoming = findIncomingForDate(task.roomId, targetDate);
            const inHouse = findInHouseForDate(task.roomId, targetDate);
            const isEarly = !!(incoming && incoming.earlyCheckIn);
            const bikeBooking = incoming?.bikeParkingNeeded ? incoming : inHouse?.bikeParkingNeeded ? inHouse : null;
            const startLabel = task.earliestLabel || '—';
            const endLabel = task.latestLabel || '—';
            const conflict = task.hasScheduleConflict;
            const targetBookingId = incoming?.sourceBookingId || incoming?.id || inHouse?.sourceBookingId || inHouse?.id || null;
            const interactive = targetBookingId ? interactiveHandlers(targetBookingId) : {};
            const clickClasses = targetBookingId ? 'cursor-pointer hover:bg-[#F9F8F2]' : 'cursor-default';
            return (
              <div
                key={task.roomId}
                className={`flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm transition-colors ${clickClasses}`}
                {...interactive}
              >
                <div className="space-y-1">
                  <div className="flex items-center font-bold text-slate-800">
                    <span className={`w-2 h-2 rounded-full mr-2 ${accentDotClass}`}></span>
                    <span>{task.roomName}</span>
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">{task.propertyName}</div>
                  {incoming && <div className="text-xs text-slate-600">Incoming: {incoming.guestName}</div>}
                  {inHouse && !incoming && <div className="text-xs text-slate-600">In-house: {inHouse.guestName}</div>}
                  {bikeBooking && <div className="text-xs text-slate-600">Bike parking: {bikeBooking.bikeCount || 1}</div>}
                  <div className="text-xs text-slate-600 flex items-center gap-1"><Clock size={14} className="text-slate-500"/>Clean between {startLabel} and {endLabel}{conflict && <span className="ml-2 text-red-600 font-semibold flex items-center gap-1"><AlertTriangle size={12}/>Conflict</span>}</div>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  <span className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${task.priorityLabel === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' : task.priorityLabel === 'low' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>{task.priorityLabel ? task.priorityLabel.toUpperCase() : 'NORMAL'}</span>
                  {task.isWeeklyServiceClean && <span className="text-blue-700 font-semibold">Weekly</span>}
                  {isEarly && <span className="text-orange-600 font-semibold flex items-center"><Sunrise size={14} className="mr-1"/>Early</span>}
                  <span className={getRoomTagClasses(task.roomId, { highlightPriority: isEarly || task.hasEarlyCheckIn, highlightWeekly: task.isWeeklyServiceClean })}>
                    {incoming ? 'Incoming' : task.propertyName}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    );

    const paymentAttention = crm.accounts.map((account) => {
      const booking = bookings.find((entry) => entry.id === account.bookingId);
      return booking ? accountSummary(booking, account, propertyToday()) : null;
    }).filter((summary) => summary && (summary.overdueVnd > 0 || summary.depositAction));

    return (
      <div className="space-y-14">
        {!crm.loading && !crm.error && paymentAttention.length > 0 && <button type="button" onClick={() => setActiveTab('crm')} className="w-full text-left flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900"><span><strong>{paymentAttention.length} stays need payment attention</strong><span className="block text-sm mt-1">{formatCurrencyVND(paymentAttention.reduce((total, summary) => total + summary.overdueVnd, 0))} overdue · review rent and reservation payments in Guests & CRM</span></span><AlertTriangle size={24} /></button>}
        <div className="space-y-3">
          <h2 className="text-3xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>Today</h2>
          <p className="text-slate-500 text-sm">Snapshot for {TODAY_STR}.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="🏠 Occupancy" value={`${occupancyRate}%`} icon={null} subtext={`${activeBookings.length} / ${openRoomsToday.length} open rooms`} />
            <StatCard title="👤 Check-ins" value={checkingIn.length} icon={null} subtext="Happening today" />
            <StatCard title="🧹 Cleaning" value={tasksTodayCount} icon={null} subtext="Must be ready today" />
            <StatCard title="⚙ Open Issues" value={openMaintenanceIssues} icon={null} subtext="Maintenance tickets" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
               <h3 className="font-serif font-bold text-xl mb-4" style={{ color: COLORS.darkGreen }}>
                 ⬅️ Checking Out Today ({checkingOutToday.length})
               </h3>
               <div className="space-y-3">
                 {checkingOutToday.length === 0 ? (
                     <p className="text-slate-400 text-sm p-4 rounded-xl border border-dashed border-slate-200 text-center">
                         No check-outs scheduled for today.
                     </p>
                 ) : (
                       checkingOutToday.map(booking => {
                       const roomName = ALL_ROOMS.find(r => r.id === booking.roomId)?.name || 'Unknown room';
                       return (
                         <div
                           key={booking.id}
                           className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-white transition-colors"
                           {...interactiveHandlers(booking.sourceBookingId || booking.id)}
                         >
                           <div className="flex items-center text-sm font-bold text-slate-800">{rowIcon('⬅️')}<span>{booking.guestName}</span></div>
                           <span className={getRoomTagClasses(booking.roomId)}>
                             {roomName}
                           </span>
                         </div>
                       );
                       })
                 )}
               </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-md border border-red-200/70">
               <h3 className="font-serif font-bold text-xl mb-4" style={{ color: COLORS.darkGreen }}>
                 🟥 Checking In Today ({checkingIn.length})
               </h3>
               <div className="space-y-3">
                 {checkingIn.length === 0 ? (
                     <p className="text-green-600 text-sm flex items-center bg-green-50 p-4 rounded-xl border border-green-100">
                         <CheckCircle size={18} className="mr-2" /> No check-ins scheduled.
                     </p>
                 ) : (
                     checkingIn.map(booking => (
                           <div
                             key={booking.id}
                             className={`flex items-center justify-between p-3 rounded-xl border shadow-sm cursor-pointer hover:brightness-[0.98] transition-all ${
                               booking.earlyCheckIn ? 'bg-yellow-50/70 border-yellow-200' : 'bg-[#E2F05D]/40 border-[#E2F05D]'
                             }`}
                             {...interactiveHandlers(booking.sourceBookingId || booking.id)}
                           >
                             <div className="flex items-center text-sm font-bold text-slate-800">
                               {rowIcon('👤')}
                               <span>{booking.guestName}</span>
                             </div>
                             <div className="flex items-center gap-2">
                               {booking.earlyCheckIn && <span className="text-[11px] font-bold text-orange-600 flex items-center"><Sunrise size={14} className="mr-1"/>Early</span>}
                                {booking.bikeParkingNeeded && (
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">Bike {booking.bikeCount || 1}</span>
                                )}
                               <span className={getRoomTagClasses(booking.roomId, { highlightPriority: booking.earlyCheckIn })}>
                                 {(ALL_ROOMS.find(r => r.id === booking.roomId)?.name) || 'Unknown room'}
                               </span>
                             </div>
                           </div>
                     ))
                 )}
               </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB] mt-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-serif font-bold text-xl mb-1" style={{ color: COLORS.darkGreen }}>Today's Cleaning Plan</h3>
                <p className="text-slate-500 text-sm">Prioritized by today's arrivals and weekly long-stay cleans.</p>
              </div>
              <span className="text-xs text-slate-500 px-2 py-1 rounded-full border border-slate-200 cursor-help" title="High = early check-in today (ready before 13:30). Normal = standard turnovers (before 15:00). Low = weekly long-stay cleans (flexible).">i</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center text-sm font-semibold text-orange-700 mb-3">
                  <span className="mr-2">🔥</span> High Priority <span className="ml-2 text-xs text-orange-600">Clean before 13:30</span>
                </div>
                {renderPlanGroup(todayHighPriorityRooms, 'bg-orange-500', TODAY_STR)}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center text-sm font-semibold text-slate-800 mb-3">
                  <span className="mr-2">✔</span> Normal Priority <span className="ml-2 text-xs text-slate-500">Clean before 15:00</span>
                </div>
                {renderPlanGroup(todayNormalPriorityRooms, 'bg-slate-400', TODAY_STR)}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center text-sm font-semibold text-blue-800 mb-3">
                  <span className="mr-2">🌙</span> Low Priority <span className="ml-2 text-xs text-blue-700">Weekly long-stay</span>
                </div>
                {renderPlanGroup(todayLowPriorityRooms, 'bg-blue-600', TODAY_STR)}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-6">
          <h2 className="text-3xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>Tomorrow</h2>
          <p className="text-slate-500 text-sm">Plan for {TOMORROW_STR}.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="👤 Check-ins" value={checkingInTomorrow.length} icon={null} subtext="Arriving tomorrow" />
            <StatCard title="➡️ Check-outs" value={checkingOutTomorrow.length} icon={null} subtext="Departing tomorrow" />
            <StatCard title="🧹 Cleaning" value={tasksTomorrowCount} icon={null} subtext="Scheduled for tomorrow" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-serif font-bold text-xl mb-4" style={{ color: COLORS.darkGreen }}>
                👤 Checking In Tomorrow ({checkingInTomorrow.length})
              </h3>
              <div className="space-y-3">
                {checkingInTomorrow.length === 0 ? (
                    <p className="text-slate-400 text-sm p-4 rounded-xl border border-dashed border-slate-200 text-center">
                        No check-ins scheduled for tomorrow.
                    </p>
                ) : (
                    checkingInTomorrow.map(booking => (
                          <div
                            key={booking.id}
                            className="flex items-center justify-between p-3 rounded-xl border shadow-sm bg-slate-50 cursor-pointer hover:bg-white transition-colors"
                            {...interactiveHandlers(booking.sourceBookingId || booking.id)}
                          >
                            <div className="flex items-center text-sm font-bold text-slate-800">{rowIcon('👤')}<span>{booking.guestName}</span></div>
                            <div className="flex items-center gap-2">
                              {booking.earlyCheckIn && <span className="text-[11px] font-bold text-orange-600 flex items-center"><Sunrise size={14} className="mr-1"/>Early</span>}
                              {booking.bikeParkingNeeded && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">Bike {booking.bikeCount || 1}</span>
                              )}
                              <span className={getRoomTagClasses(booking.roomId, { highlightPriority: booking.earlyCheckIn })}>
                                {(ALL_ROOMS.find(r => r.id === booking.roomId)?.name) || 'Unknown room'}
                              </span>
                            </div>
                          </div>
                    ))
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
               <h3 className="font-serif font-bold text-xl mb-4" style={{ color: COLORS.darkGreen }}>
                 ➡️ Checking Out Tomorrow ({checkingOutTomorrow.length})
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
                         <div
                           key={booking.id}
                           className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-white transition-colors"
                           {...interactiveHandlers(booking.sourceBookingId || booking.id)}
                         >
                           <div className="flex items-center text-sm font-bold text-slate-800">{rowIcon('➡️')}<span>{booking.guestName}</span></div>
                           <span className={getRoomTagClasses(booking.roomId)}>
                             {roomName}
                           </span>
                         </div>
                       );
                       })
                 )}
               </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E5E7EB] mt-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-serif font-bold text-xl mb-1" style={{ color: COLORS.darkGreen }}>Tomorrow's Cleaning Plan</h3>
                <p className="text-slate-500 text-sm">Prioritized by check-in type and long-stay weekly cleans.</p>
              </div>
              <span className="text-xs text-slate-500 px-2 py-1 rounded-full border border-slate-200 cursor-help" title="High = early check-in tomorrow (ready before 13:30). Normal = standard turnovers (before 15:00). Low = weekly long-stay cleans (flexible).">i</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center text-sm font-semibold text-orange-700 mb-3">
                  <span className="mr-2">🔥</span> High Priority <span className="ml-2 text-xs text-orange-600">Clean before 13:30</span>
                </div>
                {renderPlanGroup(tomorrowHighPriorityRooms, 'bg-orange-500', TOMORROW_STR)}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center text-sm font-semibold text-slate-800 mb-3">
                  <span className="mr-2">✔</span> Normal Priority <span className="ml-2 text-xs text-slate-500">Clean before 15:00</span>
                </div>
                {renderPlanGroup(tomorrowNormalPriorityRooms, 'bg-slate-400', TOMORROW_STR)}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center text-sm font-semibold text-blue-800 mb-3">
                  <span className="mr-2">🌙</span> Low Priority <span className="ml-2 text-xs text-blue-700">Weekly long-stay</span>
                </div>
                {renderPlanGroup(tomorrowLowPriorityRooms, 'bg-blue-600', TOMORROW_STR)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
