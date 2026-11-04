import { CALENDAR_ERROR_CODE, COLORS, DATE_HEADER_HEIGHT } from '../../config/pms.js';
import { PROPERTIES, isRoomOpenOnDate } from '../../config/properties.js';
import { getDisplayPriceForBooking } from '../../lib/airbnb.js';
import { bookingOccupiesDate, isCancelledStatus } from '../../lib/bookingDates.js';
import { calendarBlockOccupiesDate, getCalendarBlockLabel, getCalendarBlockStatusClass, getCalendarPmsBlockClass } from '../../lib/calendarBlocks.js';
import { addDays, formatDate, getWeekdayKey } from '../../lib/dates.js';
import { formatCompactCurrencyVND } from '../../lib/formatting.js';
import { getDaySummaryForDate } from '../../lib/housekeepingSchedule.js';
import { ChevronLeft, ChevronRight, Download, Plus, Sunrise } from 'lucide-react';
import React from 'react';

export default function CalendarView({
  TODAY_STR,
  bookings,
  calendarBlocks,
  calendarBookings,
  calendarCreateMode,
  calendarLastActionRef,
  calendarLastErrorRef,
  calendarView,
  dates,
  draggedRoomStay,
  ensureDateVisible,
  getBookingStayCategory,
  handleTimelineScroll,
  hoveredCalendarDate,
  neighboursBikeCountMap,
  openBookingDetails,
  openRoomNightExportModal,
  prepareRoomTransfer,
  savingBookingId,
  scrollTimelineByViewport,
  selectedCalendarDate,
  setCalendarCreateMode,
  setCalendarView,
  setEditingBooking,
  setEditingCalendarBlock,
  setHoveredCalendarDate,
  setIsCalendarBlockModalOpen,
  setIsModalOpen,
  setSelectedCalendarDate,
  timelineRef,
  visibleEndDate,
  visibleStartDate,
}) {
    try {
    if (!dates.length) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-6 text-slate-600">
          Calendar is initializing…
        </div>
      );
    }

    const getBookingForCell = (roomId, date) => {
      const dateStr = formatDate(date);
      return calendarBookings.find((b) => b.roomId === roomId && !isCancelledStatus(b.status) && bookingOccupiesDate(b, dateStr, roomId));
    };
    const getCalendarBlockForCell = (roomId, date) => {
      const dateStr = formatDate(date);
      return calendarBlocks.find((block) => block.roomId === roomId && calendarBlockOccupiesDate(block, dateStr, roomId));
    };
      const dateIndexMap = new Map(dates.map((d, i) => [formatDate(d), i]));
    const monthGroups = dates.reduce((groups, date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const last = groups[groups.length - 1];
      if (last?.key === key) last.days += 1;
      else groups.push({ key, date, days: 1 });
      return groups;
    }, []);
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] flex flex-col flex-1 min-h-0">
        <div className="p-5 border-b border-[#E5E7EB] flex flex-wrap gap-3 justify-between items-center bg-[#F9F8F2] shrink-0">
          <div className="flex items-center space-x-6">
            <div><h2 className="text-xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>Calendar</h2><p className="text-xs text-slate-500">Drag a guest to another room to move or swap. Dates stay the same.</p></div>
            <div className="flex space-x-2">
              <button onClick={() => scrollTimelineByViewport(-1)} className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200"><ChevronLeft size={20} /></button>
              <button onClick={() => { setSelectedCalendarDate(TODAY_STR); ensureDateVisible(TODAY_STR); }} className="px-4 py-1.5 text-sm font-medium hover:bg-white rounded-full border border-transparent hover:border-slate-200 transition-colors">Today</button>
              <button onClick={() => scrollTimelineByViewport(1)} className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200"><ChevronRight size={20} /></button>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setCalendarView('guestName')} className={`px-4 py-1.5 text-sm font-medium rounded-full border ${calendarView === 'guestName' ? 'bg-slate-200' : 'hover:bg-white'}`}>Guest Name</button>
              <button onClick={() => setCalendarView('price')} className={`px-4 py-1.5 text-sm font-medium rounded-full border ${calendarView === 'price' ? 'bg-slate-200' : 'hover:bg-white'}`}>Price</button>
            </div>
            {calendarCreateMode === 'block' && (
              <div className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700">
                Click an empty room/date cell to place a PMS block
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCalendarCreateMode((prev) => (prev === 'block' ? 'booking' : 'block'))}
              className={`px-4 py-2 rounded-full border transition-colors text-sm font-semibold flex items-center gap-2 ${calendarCreateMode === 'block' ? 'border-slate-500 bg-slate-500 text-white hover:bg-slate-600' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <Plus size={16} />
              {calendarCreateMode === 'block' ? 'Cancel PMS Block' : 'Add PMS Block'}
            </button>
            <button
              onClick={openRoomNightExportModal}
              className="px-4 py-2 rounded-full border border-[#26402E] bg-white text-[#26402E] hover:bg-[#EAF0E6] transition-colors text-sm font-semibold flex items-center gap-2"
            >
              <Download size={16} />
              Export Room Nights
            </button>
            <div className="text-sm font-medium font-serif" style={{ color: COLORS.darkGreen }}>
               {`${formatDate(visibleStartDate)} – ${formatDate(visibleEndDate)}`}
            </div>
          </div>
        </div>
        <div className="bg-slate-50 overflow-auto flex-1 min-h-0 relative isolate" ref={timelineRef} onScroll={handleTimelineScroll}>
          <div className="grid grid-cols-[14rem_minmax(0,1fr)] min-h-0" style={{ width: `max(100%, calc(14rem + ${dates.length * 48}px))` }}>
            {/* Left column: rooms/sections, no horizontal scroll */}
            <div className="bg-white border-r border-slate-200 min-h-0 sticky left-0 z-40">
              <div
                className="border-b border-slate-200 bg-[#F9F8F2] flex items-center px-4 text-xs font-bold uppercase tracking-wider sticky top-0 z-30"
                style={{ color: COLORS.darkGreen, height: DATE_HEADER_HEIGHT }}
              >
                Room
              </div>
              {PROPERTIES.map((prop) => (
                <React.Fragment key={prop.id}>
                  <div
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider sticky z-20"
                    style={{ backgroundColor: COLORS.darkGreen, color: COLORS.lime, top: DATE_HEADER_HEIGHT }}
                  >
                    {prop.name}
                  </div>
                  {prop.name === 'Neighbours' && (
                    <div className="h-10 border-b border-slate-100 bg-white" />
                  )}
                  {prop.rooms.map((room) => (
                    <div
                      key={room.id}
                      className="h-16 border-b border-slate-100 flex flex-col justify-center px-4 bg-white hover:bg-[#F9F8F2] transition-colors"
                    >
                      <span className="font-bold text-sm" style={{ color: COLORS.darkGreen }}>{room.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">{room.type}</span>
                    </div>
                  ))}
                  {prop.name === 'Neighbours' && (
                    <div className="h-16 border-b border-slate-100 flex flex-col justify-center px-4 bg-white hover:bg-[#F9F8F2] transition-colors">
                      <span className="font-bold text-sm" style={{ color: COLORS.darkGreen }}>🚲 Bikes</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">Capacity: 2</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Right pane: shared horizontal scroll for header + grid; vertical height driven by container */}
            <div className="min-w-0">
              <div className="relative">
                <div className="absolute inset-0 pointer-events-none flex z-0">
                  {dates.map((date) => {
                    const dateStr = formatDate(date);
                    const isToday = dateStr === TODAY_STR;
                    return (
                      <div
                        key={dateStr}
                        className={`flex-1 min-w-[3rem] border-r ${isToday ? 'border-[#d9a25c]/70 bg-[#E2F05D]/12' : 'border-slate-400/70'}`}
                        style={isToday ? { boxShadow: 'inset 0 0 0 1px rgba(217, 162, 92, 0.25)' } : undefined}
                      />
                    );
                  })}
                </div>
                <div className="relative z-10">
                  <div className="sticky top-0 z-30 bg-white shadow-sm" style={{ height: DATE_HEADER_HEIGHT }}>
                  <div className="flex h-8 bg-[#26402E] text-white border-b border-slate-300">
                    {monthGroups.map((month) => (
                      <div key={month.key} className="min-w-0 border-r border-white/30 flex items-center" style={{ flex: `${month.days} 0 ${month.days * 48}px` }}>
                        <span className="sticky left-[14rem] px-3 truncate text-xs font-bold tracking-wide">
                          {month.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex h-[68px] border-b border-slate-300">
                  {dates.map(date => {
                    const dateStr = formatDate(date);
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = dateStr === selectedCalendarDate;
                    const isHovered = dateStr === hoveredCalendarDate;
                    const summary = getDaySummaryForDate(dateStr, bookings);
                    return (
                      <div
                        key={dateStr}
                        data-date={dateStr}
                        data-day-cell
                        className={`relative flex-1 min-w-[3rem] px-1 py-2 text-center text-xs border-r ${date.getDate() === 1 ? 'border-l-2 border-l-[#26402E] border-r-slate-200' : 'border-slate-200'} ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-slate-100' : 'bg-white'}`}
                        onMouseEnter={() => setHoveredCalendarDate(dateStr)}
                        onMouseLeave={() => setHoveredCalendarDate(null)}
                        onClick={() => setSelectedCalendarDate(dateStr)}
                      >
                        <button
                          type="button"
                          aria-label={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          aria-pressed={isSelected}
                          className={`w-full flex flex-col items-center justify-center rounded-md py-1 transition-colors leading-tight ${isSelected ? 'bg-[#E2F05D]/70 text-[#26402E] font-bold' : 'text-slate-500'} ${isToday ? 'font-bold' : ''}`}
                          style={{ color: isSelected || isToday ? COLORS.darkGreen : COLORS.textMuted, backgroundColor: isToday && !isSelected ? '#E2F05D22' : undefined }}
                        >
                          <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          <span className="text-xl font-bold tabular-nums">{date.getDate()}</span>
                        </button>

                        {isToday && (
                          <div className="absolute inset-y-1 left-0 w-[3px] bg-[#d9a25c] rounded-full pointer-events-none" />
                        )}

                        {isHovered && (
                          <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-3 text-[11px] text-left z-50 min-w-[180px]">
                            <div className="font-bold text-slate-800 mb-1">
                              {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Check-ins</span>
                              <span className="font-semibold text-slate-800">{summary.checkIns}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Early check-ins</span>
                              <span className="font-semibold text-orange-600">{summary.earlyCheckIns}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Check-outs</span>
                              <span className="font-semibold text-slate-800">{summary.checkOuts}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Long term cleans</span>
                              <span className="font-semibold text-blue-700">{summary.longTermCleans}</span>
                            </div>
                            <div className="flex justify-between mt-1 pt-1 border-t border-slate-100">
                              <span className="text-slate-500">Rooms to clean</span>
                              <span className="font-semibold text-red-700">{summary.roomsToClean}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                  </div>

                  {PROPERTIES.map(prop => (
                    <React.Fragment key={prop.id}>
                      <div className="h-[46px] border-b border-slate-200 bg-white/80" />

                      {prop.name === 'Neighbours' && (
                        <div
                          className="flex border-b border-slate-200 h-10 sticky z-20 bg-white/80 backdrop-blur-sm"
                          style={{ top: DATE_HEADER_HEIGHT }}
                        >
                          {dates.map((date) => {
                            const dateStr = formatDate(date);
                            const isToday = dateStr === TODAY_STR;
                            return (
                              <div
                                key={dateStr}
                                className={`flex-1 min-w-[3rem] text-[11px] font-semibold text-center border-r border-slate-200/60 flex items-center justify-center ${isToday ? 'text-[#26402E] bg-[#E2F05D]/16' : 'text-slate-500'}`}
                              >
                                <span className="leading-none">{date.toLocaleDateString(undefined, { day: 'numeric' })}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {prop.rooms.map((room, roomIndex) => (
                        <div key={room.id}
                          onDragOver={(event) => { if (draggedRoomStay.current && !savingBookingId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
                          onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const payload = draggedRoomStay.current; draggedRoomStay.current = null; prepareRoomTransfer(room.id, payload); }}
                          className={`flex border-b border-slate-200 h-16 relative transition-colors group ${roomIndex % 2 === 0 ? 'bg-white/70' : 'bg-slate-50/70'} hover:bg-[#F9F8F2]/80`}>
                        {dates.map(date => {
                          const dateStr = formatDate(date);
                          const isPreOpening = !isRoomOpenOnDate(room.id, dateStr);
                          const weekdayKey = getWeekdayKey(dateStr);
                          const booking = getBookingForCell(room.id, date);
                          const calendarBlock = booking ? null : getCalendarBlockForCell(room.id, date);
                          const dateIndex = dateIndexMap.get(dateStr) ?? 0;
                          const previousDateStr = addDays(dateStr, -1);
                          const isBookingStart = !!booking && !bookingOccupiesDate(booking, previousDateStr, room.id);
                          const isBookingTruncatedAtStart = !!booking && dateIndex === 0 && bookingOccupiesDate(booking, previousDateStr, room.id);
                          const isBlockStart = !!calendarBlock && !calendarBlockOccupiesDate(calendarBlock, previousDateStr, room.id);
                          const isBlockTruncatedAtStart = !!calendarBlock && dateIndex === 0 && calendarBlockOccupiesDate(calendarBlock, previousDateStr, room.id);
                          const lastDateStr = formatDate(dates[dates.length - 1]);
                          const hasLongTermCleaningToday = calendarBookings.some((b) => {
                            if (!b.isLongTerm) return false;
                            if (isCancelledStatus(b.status)) return false;
                            if (b.roomId !== room.id) return false;
                            return bookingOccupiesDate(b, dateStr, room.id) && b.weeklyCleaningDay === weekdayKey;
                          });
                          let bookingColSpan = 0;
                          if (booking) {
                            if (isBookingStart || isBookingTruncatedAtStart) {
                              for (let idx = dateIndex; idx < dates.length; idx += 1) {
                                const segmentDateStr = formatDate(dates[idx]);
                                if (!bookingOccupiesDate(booking, segmentDateStr, room.id)) break;
                                bookingColSpan += 1;
                              }
                            }
                          }
                          let blockColSpan = 0;
                          if (calendarBlock) {
                            if (isBlockStart || isBlockTruncatedAtStart) {
                              for (let idx = dateIndex; idx < dates.length; idx += 1) {
                                const segmentDateStr = formatDate(dates[idx]);
                                if (!calendarBlockOccupiesDate(calendarBlock, segmentDateStr, room.id)) break;
                                blockColSpan += 1;
                              }
                            }
                          }
                          const shouldRenderBookingBlock = booking && (isBookingStart || (isBookingTruncatedAtStart && dateIndex === 0));
                          const shouldRenderPmsBlock = calendarBlock && (isBlockStart || (isBlockTruncatedAtStart && dateIndex === 0));
                          const gapPx = 4; // Small gap so adjacent bookings touch without overlap
                          const bookingWidthCalc = `calc(${bookingColSpan * 100}% - ${gapPx}px)`;
                          const pmsBlockWidthCalc = `calc(${blockColSpan * 100}% - ${gapPx}px)`;
                          const leftOffset = '0%';
                          const isTodayCol = dateStr === TODAY_STR;
                          const todayCellHighlight = isTodayCol
                            ? {
                                backgroundImage: 'linear-gradient(180deg, #fff8ed 0%, #fff3e2 100%)',
                                boxShadow: 'inset 0 0 0 1px rgba(226, 190, 140, 0.25)',
                              }
                            : undefined;
                          const handleCellClick = () => {
                            if (isPreOpening) return;
                            if (booking) {
                              openBookingDetails(booking.sourceBookingId || booking.id);
                              return;
                            }
                            if (calendarBlock) {
                              setEditingCalendarBlock(calendarBlock);
                              setIsCalendarBlockModalOpen(true);
                              return;
                            }
                            if (calendarCreateMode === 'block') {
                              setEditingCalendarBlock({
                                roomId: room.id,
                                startDate: dateStr,
                                endDate: addDays(dateStr, 1),
                                blockType: 'long_term_priority',
                                title: '',
                                notes: '',
                              });
                              setIsCalendarBlockModalOpen(true);
                              return;
                            }
                            setEditingBooking({ roomId: room.id, checkIn: dateStr, checkOut: formatDate(new Date(date.getTime() + 86400000)) });
                            setIsModalOpen(true);
                          };
                          return (
                            <div key={dateStr} title={isPreOpening ? `${prop.name} opens ${prop.openingDate}` : undefined} className={`flex-1 min-w-[3rem] border-r border-slate-200 relative ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-slate-50/70' : ''} ${dateStr === selectedCalendarDate ? 'bg-[#E2F05D]/12' : ''} ${isPreOpening ? 'bg-slate-200/70 cursor-not-allowed' : ''} ${calendarCreateMode === 'block' && !booking && !calendarBlock && !isPreOpening ? 'cursor-cell hover:bg-slate-100/80' : ''}`} style={todayCellHighlight} onClick={handleCellClick}>
                              {isPreOpening && <div className="absolute inset-0 bg-slate-200/60 z-20 flex items-center justify-center text-[9px] text-slate-500">Closed</div>}
                              {isTodayCol && <div className="absolute inset-y-1 left-0 w-[3px] bg-[#d9a25c] rounded-full pointer-events-none" />}
                              {booking && shouldRenderBookingBlock && (
                                (() => {
                                  const stayCat = getBookingStayCategory(booking);
                                  const catBorder = stayCat === 'long'
                                    ? 'ring-2 ring-blue-200'
                                    : stayCat === 'medium'
                                      ? 'ring-2 ring-amber-200'
                                      : 'ring-1 ring-white/40';
                                  return (
                                    <div draggable={!savingBookingId}
                                      title="Drag to another room to move or swap guests; dates stay the same"
                                      onDragStart={(event) => {
                                        draggedRoomStay.current = { bookingId: booking.sourceBookingId || booking.id, fromRoomId: room.id, date: dateStr };
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', booking.guestName || 'Guest');
                                      }}
                                      onDragEnd={() => { draggedRoomStay.current = null; }}
                                      className={`absolute top-2.5 bottom-2.5 rounded-lg z-30 cursor-grab active:cursor-grabbing text-xs px-3 py-1 overflow-hidden whitespace-nowrap shadow-sm flex items-center gap-1.5 transition-all hover:scale-[1.02] hover:shadow-md hover:z-40 ${getCalendarBlockStatusClass(booking.status)} ${catBorder}`}
                                      style={{
                                        width: bookingWidthCalc,
                                        left: leftOffset,
                                        zIndex: 10,
                                        outline: '1px solid rgba(255,255,255,0.35)',
                                      }}
                                      onClick={(e) => { e.stopPropagation(); openBookingDetails(booking.sourceBookingId || booking.id); }}
                                    >
                                      {booking.isLongTerm && hasLongTermCleaningToday && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block mr-1.5" title="Weekly cleaning today"></span>
                                      )}
                                      <span className="font-semibold truncate mr-1.5">
                                        {calendarView === 'guestName'
                                          ? booking.guestName
                                          : `${formatCompactCurrencyVND(getDisplayPriceForBooking(booking))} for ${booking.nights} nights`}
                                      </span>
                                      {booking.earlyCheckIn && <Sunrise size={12} className="text-orange-600 ml-1"/>}
                                      {booking.bikeParkingNeeded && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/80 text-[#26402E] ml-1 border border-white/60">
                                          Bike {booking.bikeCount || 1}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()
                              )}
                              {calendarBlock && shouldRenderPmsBlock && (
                                <div
                                  className={`absolute top-2.5 bottom-2.5 rounded-lg z-20 cursor-pointer text-xs px-3 py-1 overflow-hidden whitespace-nowrap shadow-sm flex items-center gap-1.5 transition-all hover:scale-[1.02] hover:shadow-md hover:z-40 ${getCalendarPmsBlockClass(calendarBlock.blockType)}`}
                                  style={{
                                    width: pmsBlockWidthCalc,
                                    left: leftOffset,
                                    outline: '1px dashed rgba(255,255,255,0.55)',
                                  }}
                                  title={calendarBlock.notes || getCalendarBlockLabel(calendarBlock)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCalendarBlock(calendarBlock);
                                    setIsCalendarBlockModalOpen(true);
                                  }}
                                >
                                  <span className="font-semibold truncate mr-1.5">
                                    {getCalendarBlockLabel(calendarBlock)}
                                  </span>
                                  <span className="text-[10px] uppercase tracking-wide opacity-80">PMS</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      ))}

                      {prop.name === 'Neighbours' && (
                        <div className={`flex border-b border-slate-200 h-16 relative transition-colors group bg-white/70 hover:bg-[#F9F8F2]/80`}>
                          {dates.map(date => {
                            const dateStr = formatDate(date);
                            const count = neighboursBikeCountMap[dateStr] || 0;
                            const overCapacity = count > 2;
                            const iconCount = Math.min(count, 4);
                            const remaining = Math.max(0, count - iconCount);
                            const icons = iconCount > 0 ? '🚲'.repeat(iconCount) : '';
                            const showZero = count === 0;
                            const tooltip = overCapacity ? `Over capacity: ${count} bikes (max 2)` : undefined;
                            const isTodayCol = dateStr === TODAY_STR;
                            const todayCellHighlight = isTodayCol
                              ? {
                                  backgroundImage: 'linear-gradient(180deg, #fff8ed 0%, #fff3e2 100%)',
                                  boxShadow: 'inset 0 0 0 1px rgba(226, 190, 140, 0.25)',
                                }
                              : undefined;
                            return (
                              <div
                                key={dateStr}
                                className={`flex-1 min-w-[3rem] border-r border-slate-200 relative ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-slate-50/70' : ''} ${dateStr === selectedCalendarDate ? 'bg-[#E2F05D]/12' : ''} ${overCapacity ? 'bg-red-50' : ''}`}
                                title={tooltip}
                                style={todayCellHighlight}
                              >
                                {isTodayCol && <div className="absolute inset-y-1 left-0 w-[3px] bg-[#d9a25c] rounded-full pointer-events-none" />}
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-xs">
                                  {overCapacity && <span className="text-red-600 font-bold mb-0.5">⚠️</span>}
                                  <div className={`flex items-center justify-center gap-1 ${overCapacity ? 'text-red-700 font-semibold' : 'text-slate-700 font-semibold'}`}>
                                    {icons && <span className="leading-none">{icons}</span>}
                                    {remaining > 0 && <span className="text-[11px] text-slate-600">+{remaining}</span>}
                                    <span className="text-sm">{showZero ? '0' : count}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
    } catch (err) {
      /* eslint-disable react-hooks/refs -- Keep the existing calendar diagnostic fallback unchanged during extraction. */
      console.error('[calendar] render failed', err);
      calendarLastErrorRef.current = { message: err?.message || 'Unknown error', stack: err?.stack };
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6 text-red-700 space-y-2">
          <div className="font-semibold">Calendar failed to render.</div>
          <div className="text-sm">Code: {CALENDAR_ERROR_CODE}</div>
          <div className="text-sm break-words">{calendarLastErrorRef.current?.message}</div>
          <div className="text-xs text-slate-600">Last action: {calendarLastActionRef.current?.event} @ {calendarLastActionRef.current?.ts}</div>
          <div className="text-xs text-slate-500">See console for stack trace.</div>
        </div>
      );
      /* eslint-enable react-hooks/refs */
    }
  }
