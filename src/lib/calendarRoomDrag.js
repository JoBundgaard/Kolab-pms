const ROOM_STAY_TYPE = 'application/x-kolab-room-stay';

export function startRoomDrag(event, draggedRoomStay, payload) {
  draggedRoomStay.current = payload;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(ROOM_STAY_TYPE, JSON.stringify(payload));
  event.dataTransfer.setData('text/plain', JSON.stringify(payload));
}

export function roomDropHandlers(roomId, draggedRoomStay, saving, prepareRoomTransfer) {
  return {
    onDragOver(event) {
      if (saving || (!draggedRoomStay.current && !Array.from(event.dataTransfer.types).includes(ROOM_STAY_TYPE))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    onDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      if (saving) return;
      let payload = draggedRoomStay.current;
      if (!payload) {
        try {
          payload = JSON.parse(event.dataTransfer.getData(ROOM_STAY_TYPE));
        } catch {
          return;
        }
      }
      draggedRoomStay.current = null;
      if (!payload?.bookingId || !payload.fromRoomId || !payload.date || payload.fromRoomId === roomId) return;
      prepareRoomTransfer(roomId, payload);
    },
  };
}
