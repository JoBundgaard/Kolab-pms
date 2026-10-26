import { calculateNights } from '../lib/dates.js';

export const PROPERTIES = [
  {
    id: 'prop_1',
    name: 'Townhouse',
    rooms: [
      { id: 'T1', name: 'T1', type: 'Garden double room' },
      { id: 'T2', name: 'T2', type: 'Double room' },
      { id: 'T3', name: 'T3', type: 'Single room' },
      { id: 'T4', name: 'T4', type: 'Double room' },
      { id: 'T5', name: 'T5', type: 'Single room' },
      { id: 'T6', name: 'T6', type: 'Double room' },
    ],
    commonAreas: [
      { id: 'T_Common', name: 'Common Space', type: 'Common' },
      { id: 'T_Other', name: 'Other Area', type: 'Other' },
    ]
  },
  {
    id: 'prop_2',
    name: 'Neighbours',
    rooms: [
      { id: 'N1', name: 'N1', type: 'Small double' },
      { id: 'N2', name: 'N2', type: 'Small double' },
      { id: 'N3', name: 'N3', type: 'Large double' },
      { id: 'N4', name: 'N4', type: 'Small double' },
      { id: 'N5', name: 'N5', type: 'Large double' },
      { id: 'N6', name: 'N6', type: 'Small double' },
      { id: 'N7', name: 'N7', type: 'Small double' },
    ],
    commonAreas: [
      { id: 'N_Common', name: 'Common Space', type: 'Common' },
      { id: 'N_Rooftop', name: 'Rooftop', type: 'Rooftop' },
      { id: 'N_Other', name: 'Other Area', type: 'Other' },
    ]
  },
  {
    id: 'prop_3',
    name: 'The Hem',
    openingDate: '2026-10-17',
    rooms: Array.from({ length: 8 }, (_, index) => ({
      id: `H${index + 1}`,
      name: `H${index + 1}`,
      type: 'Studio',
    })),
    commonAreas: [
      { id: 'H_Common', name: 'Common Space', type: 'Common' },
      { id: 'H_Other', name: 'Other Area', type: 'Other' },
    ]
  }
];

export const ALL_ROOMS = PROPERTIES.flatMap(p => p.rooms.map(r => ({ ...r, propertyId: p.id, propertyName: p.name })));

export const ROOM_SORT_PRIORITY = ALL_ROOMS.reduce((acc, room, index) => {
  acc[room.id] = index;
  return acc;
}, {});

export const ALL_LOCATIONS = PROPERTIES.flatMap(p => [
  ...p.rooms.map(r => ({ ...r, propertyId: p.id, propertyName: p.name, locationType: 'Room' })),
  ...p.commonAreas.map(c => ({ ...c, propertyId: p.id, propertyName: p.name, locationType: c.type })),
]);

export const getPropertyForRoom = (roomId) => PROPERTIES.find((property) =>
  property.rooms.some((room) => room.id === roomId)
);

export const isRoomOpenOnDate = (roomId, dateStr) => {
  const openingDate = getPropertyForRoom(roomId)?.openingDate;
  return !openingDate || !dateStr || dateStr >= openingDate;
};

export const countAvailableRoomNights = (rooms, startDate, endDate) => rooms.reduce((total, room) => {
  const property = getPropertyForRoom(room.id);
  const effectiveStart = property?.openingDate && property.openingDate > startDate
    ? property.openingDate
    : startDate;
  if (!effectiveStart || !endDate || effectiveStart >= endDate) return total;
  return total + Math.max(0, calculateNights(effectiveStart, endDate));
}, 0);
