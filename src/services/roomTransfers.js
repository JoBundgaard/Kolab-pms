// Change only room assignments inside a date window, preserving existing rent/channel changes.
export function transferRoomWithinDates(booking, { fromRoomId, toRoomId, startDate, endDate }, roomAtDate) {
  const originalMoves = booking.roomMoves || [];
  const remap = (date) => {
    const room = roomAtDate(booking, date);
    return date >= startDate && date < endDate && room === fromRoomId ? toRoomId : room;
  };
  const boundaries = new Set(originalMoves.map((move) => move.moveDate));
  for (const date of [startDate, endDate]) {
    if (date > booking.checkIn && date < booking.checkOut) boundaries.add(date);
  }
  let currentRoom = remap(booking.checkIn);
  const roomId = currentRoom;
  const roomMoves = [...boundaries].sort().flatMap((date) => {
    const existing = originalMoves.find((move) => move.moveDate === date);
    const nextRoom = remap(date);
    // Keep original entries even when rooms match: they can carry financial changes.
    if (!existing && nextRoom === currentRoom) return [];
    currentRoom = nextRoom;
    return [{ ...(existing || { id: `transfer_${booking.id}_${date}`, moveDate: date, useDifferentMonthlyRent: false, useDifferentChannel: false }), roomId: nextRoom }];
  });
  return { ...booking, roomId, roomMoves, hasMultipleRoomStay: roomMoves.length > 0 };
}

export function buildRoomTransferPlan(bookings, transfer, { roomAtDate, occupiedDates, isBlocking }) {
  const { bookingId, fromRoomId, toRoomId, startDate, endDate } = transfer;
  if (fromRoomId === toRoomId || !startDate || !endDate || startDate >= endDate) throw new Error('Choose a different room and a valid stay period.');
  const source = bookings.find((booking) => booking.id === bookingId);
  if (!source || !isBlocking(source.status)) throw new Error('This booking is no longer available to move.');
  if (!occupiedDates(source, fromRoomId).some((date) => date >= startDate && date < endDate)) throw new Error('The guest is no longer in the source room for these dates.');
  return bookings.filter((booking) => isBlocking(booking.status)).flatMap((booking) => {
    const isSource = booking.id === bookingId;
    const from = isSource ? fromRoomId : toRoomId;
    if (!occupiedDates(booking, from).some((date) => date >= startDate && date < endDate)) return [];
    const updated = transferRoomWithinDates(booking, { fromRoomId: from, toRoomId: isSource ? toRoomId : fromRoomId, startDate, endDate }, roomAtDate);
    return [{ before: booking, after: updated, fromRoomId: from, toRoomId: isSource ? toRoomId : fromRoomId }];
  });
}
