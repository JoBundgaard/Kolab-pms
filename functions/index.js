const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();

// ─── Property structure (mirrors App.jsx) ────────────────────────────────────

const PROPERTIES = [
  {
    name: "Townhouse",
    rooms: [
      { id: "T1", name: "T1", type: "Garden double room" },
      { id: "T2", name: "T2", type: "Double room" },
      { id: "T3", name: "T3", type: "Single room" },
      { id: "T4", name: "T4", type: "Double room" },
      { id: "T5", name: "T5", type: "Single room" },
      { id: "T6", name: "T6", type: "Double room" },
    ],
  },
  {
    name: "Neighbours",
    rooms: [
      { id: "N1", name: "N1", type: "Small double" },
      { id: "N2", name: "N2", type: "Small double" },
      { id: "N3", name: "N3", type: "Large double" },
      { id: "N4", name: "N4", type: "Small double" },
      { id: "N5", name: "N5", type: "Large double" },
      { id: "N6", name: "N6", type: "Small double" },
      { id: "N7", name: "N7", type: "Small double" },
    ],
  },
];

const ALL_ROOMS = PROPERTIES.flatMap((p) =>
  p.rooms.map((r) => ({ ...r, propertyName: p.name }))
);

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

// ─── Date utilities ───────────────────────────────────────────────────────────

function toDateStr(val) {
  if (!val) return null;
  if (typeof val === "string") return val.substring(0, 10);
  if (val.toDate) return val.toDate().toISOString().substring(0, 10);
  if (val instanceof Date) return val.toISOString().substring(0, 10);
  return null;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}

function dateRange(start, end) {
  const dates = [];
  let cur = start;
  while (cur < end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

// ─── Booking helpers ──────────────────────────────────────────────────────────

function isInBreak(booking, dateStr) {
  const breaks = booking.guestBreakPeriods || [];
  return breaks.some((bp) => {
    const s = toDateStr(bp.start || bp.from);
    const e = toDateStr(bp.end || bp.to);
    return s && e && dateStr >= s && dateStr < e;
  });
}

// Returns the room this booking occupies on dateStr, or null if none
function getRoomForDate(booking, dateStr) {
  const ci = toDateStr(booking.checkIn);
  const co = toDateStr(booking.checkOut);
  if (!ci || !co || dateStr < ci || dateStr >= co) return null;
  if (isInBreak(booking, dateStr)) return null;

  const moves = (booking.roomMoves || [])
    .filter((m) => m.moveDate && m.roomId)
    .sort((a, b) => (a.moveDate > b.moveDate ? 1 : -1));

  let room = booking.roomId;
  for (const move of moves) {
    if (move.moveDate <= dateStr) room = move.roomId;
  }
  return room;
}

// ─── Availability: free segments per room ─────────────────────────────────────

function getFreeSegments(bookings, roomId, startDate, endDate) {
  const occupied = new Set();
  for (const b of bookings) {
    for (const d of dateRange(startDate, endDate)) {
      if (getRoomForDate(b, d) === roomId) occupied.add(d);
    }
  }

  const segments = [];
  let segStart = null;
  for (const d of dateRange(startDate, addDays(endDate, 1))) {
    const free = !occupied.has(d) && d < endDate;
    if (free) {
      if (!segStart) segStart = d;
    } else {
      if (segStart) {
        segments.push({ start: segStart, end: d });
        segStart = null;
      }
    }
  }
  return segments;
}

// Finds the best availability options for a requested stay period.
// Returns single-room options first; falls back to two-room combos.
function findAvailabilityOptions(bookings, startDate, endDate) {
  const result = { singleRoom: [], twoRooms: [] };
  const segmentsByRoom = {};

  for (const room of ALL_ROOMS) {
    segmentsByRoom[room.id] = getFreeSegments(bookings, room.id, startDate, endDate);
  }

  // Single room covering full period
  for (const room of ALL_ROOMS) {
    const covers = segmentsByRoom[room.id].some(
      (s) => s.start <= startDate && s.end >= endDate
    );
    if (covers) {
      result.singleRoom.push(`${room.name} (${room.propertyName} – ${room.type})`);
    }
  }

  if (result.singleRoom.length > 0) return result;

  // Two-room combos with earliest possible switch
  const seen = new Set();
  for (const roomA of ALL_ROOMS) {
    for (const segA of segmentsByRoom[roomA.id]) {
      if (segA.start > startDate) continue;
      const switchDate = segA.end;
      if (switchDate >= endDate) continue;

      for (const roomB of ALL_ROOMS) {
        if (roomB.id === roomA.id) continue;
        const segB = segmentsByRoom[roomB.id].find(
          (s) => s.start <= switchDate && s.end >= endDate
        );
        if (!segB) continue;

        const key = `${roomA.id}→${roomB.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        result.twoRooms.push(
          `${roomA.name} (${roomA.propertyName}) ${startDate} → ${switchDate}, ` +
          `then ${roomB.name} (${roomB.propertyName}) ${switchDate} → ${endDate}`
        );
        if (result.twoRooms.length >= 6) break;
      }
      if (result.twoRooms.length >= 6) break;
    }
    if (result.twoRooms.length >= 6) break;
  }

  return result;
}

// ─── Housekeeping schedule ────────────────────────────────────────────────────

function buildHousekeepingSchedule(bookings, today, days = 14) {
  const schedule = [];

  for (let i = 0; i < days; i++) {
    const dateStr = addDays(today, i);
    const weekday = WEEKDAYS[new Date(dateStr + "T00:00:00Z").getUTCDay()];
    const confirmed = [];
    const possible = [];

    for (const room of ALL_ROOMS) {
      // Confirmed: checkout today (room was occupied yesterday)
      const yesterday = addDays(dateStr, -1);
      const checkoutToday = bookings.find(
        (b) =>
          toDateStr(b.checkOut) === dateStr &&
          getRoomForDate(b, yesterday) === room.id
      );

      // Confirmed: long-term weekly service clean
      const weeklyClean =
        !checkoutToday &&
        bookings.find(
          (b) =>
            b.isLongTerm &&
            b.weeklyCleaningDay === weekday &&
            getRoomForDate(b, dateStr) === room.id
        );

      if (checkoutToday) {
        confirmed.push({
          room: room.name,
          property: room.propertyName,
          reason: "checkout",
          guest: checkoutToday.guestName,
        });
      } else if (weeklyClean) {
        confirmed.push({
          room: room.name,
          property: room.propertyName,
          reason: `weekly service (${weekday})`,
          guest: weeklyClean.guestName,
        });
      } else {
        // Possible: room is unbooked — could get a last-minute booking
        const unbooked = !bookings.find((b) => getRoomForDate(b, dateStr) === room.id);
        if (unbooked) {
          possible.push({ room: room.name, property: room.propertyName });
        }
      }
    }

    schedule.push({ date: dateStr, weekday, confirmed, possible });
  }

  return schedule;
}

// ─── Room occupancy summary (next 120 days) ───────────────────────────────────

function buildRoomSummary(bookings, today) {
  const horizon = addDays(today, 120);
  const summary = {};

  for (const room of ALL_ROOMS) {
    const currentGuest = bookings.find((b) => getRoomForDate(b, today) === room.id);
    const upcomingPeriods = [];

    for (const b of bookings) {
      const days = dateRange(today, horizon).filter(
        (d) => getRoomForDate(b, d) === room.id
      );
      if (days.length === 0) continue;
      upcomingPeriods.push({
        from: days[0],
        to: addDays(days[days.length - 1], 1),
        guest: b.guestName,
        type: b.stayCategory || "short",
        status: b.status,
      });
    }

    summary[room.id] = {
      name: room.name,
      property: room.propertyName,
      type: room.type,
      occupiedNow: currentGuest
        ? { guest: currentGuest.guestName, checkOut: toDateStr(currentGuest.checkOut) }
        : null,
      upcomingBookings: upcomingPeriods,
    };
  }
  return summary;
}

// ─── System instruction for Gemini ───────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are Kolab Assistant — a smart, concise AI built into the Kolab property management system in Vietnam. You help staff with availability, bookings, housekeeping, and daily operations.

PROPERTIES:
- Townhouse (6 rooms): T1 Garden double, T2 Double, T3 Single, T4 Double, T5 Single, T6 Double
- Neighbours (7 rooms): N1/N2/N4/N6/N7 Small double, N3/N5 Large double
- Total: 13 guest rooms across 2 properties

BOOKING RULES:
- Stay categories: short (1–6 nights), medium (7–27 nights), long (28+ nights / monthly)
- Long-term bookings have a weeklyCleaningDay (e.g. "monday") — the room gets a service clean that day every week
- Bookings can have roomMoves: pre-planned room switches mid-stay (guest moves to a different room on a specific date)
- Bookings can have guestBreakPeriods: guest is temporarily away and the room may or may not be re-let during that time
- Active statuses: confirmed, checked-in, pending. Cancelled and checked-out are inactive.

AVAILABILITY:
- A room is free on a date if no active booking occupies it (checkIn ≤ date < checkOut, excluding break periods and accounting for room moves)
- For long-term stay requests: first look for a single room covering the full period. If none exists, suggest the best 2-room combo with the fewest room switches. Always explain the switch date clearly.
- Always tell the user how many total rooms are free and list them grouped by property.

HOUSEKEEPING:
- Confirmed clean: room has a checkout today OR it's a long-term guest's weekly service day
- Possible clean: room is currently unbooked (could receive a last-minute booking before that date)
- Present as: "X confirmed cleans, possibly Y more"
- The housekeepingNext14Days array in your data already has this pre-computed — use it directly for housekeeping questions.

STYLE:
- Be concise and practical — you're talking to hotel staff, not guests
- Group rooms by property when listing
- Use clear date formatting: e.g. "Jul 1 – Aug 31"
- Currency is Vietnamese Dong (VND)
- If a question is ambiguous, ask one short clarifying question`;

// ─── Main Cloud Function ──────────────────────────────────────────────────────

exports.chatbot = onRequest(
  { cors: true, secrets: ["GEMINI_API_KEY"], invoker: "public" },
  async (req, res) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY secret not configured." });
      return;
    }

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    const { question, history = [] } = req.body || {};
    if (!question) {
      res.status(400).json({ error: "question is required." });
      return;
    }

    try {
      const db = admin.firestore();
      const snapshot = await db.collection("bookings").get();
      const today = new Date().toISOString().substring(0, 10);

      // Normalise and filter bookings
      const bookings = [];
      snapshot.forEach((doc) => {
        const d = { id: doc.id, ...doc.data() };
        const ci = toDateStr(d.checkIn);
        const co = toDateStr(d.checkOut);
        if (!ci || !co) return;
        if (d.status && String(d.status).toLowerCase().startsWith("cancel")) return;
        if (co < addDays(today, -1)) return; // skip old check-outs
        bookings.push({
          id: d.id,
          guestName: d.guestName || "Unknown",
          roomId: d.roomId,
          checkIn: ci,
          checkOut: co,
          status: d.status || "confirmed",
          stayCategory: d.stayCategory || "short",
          isLongTerm: !!d.isLongTerm,
          weeklyCleaningDay: d.weeklyCleaningDay || null,
          channel: d.channel || null,
          price: d.price || null,
          roomMoves: d.roomMoves || [],
          guestBreakPeriods: d.guestBreakPeriods || [],
        });
      });

      const housekeeping = buildHousekeepingSchedule(bookings, today, 14);

      const context = {
        today,
        totalRooms: 13,
        bookings,
        housekeepingNext14Days: housekeeping,
      };

      // Build Gemini chat
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0.3 },
      });

      // Convert frontend history (last 6 messages = 3 turns) to Gemini format
      const trimmedHistory = history.slice(-6);
      const chatHistory = trimmedHistory.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));

      const chat = model.startChat({ history: chatHistory });

      const prompt =
        SYSTEM_INSTRUCTION +
        `\n\n---\nLive PMS data (today: ${today}):\n` +
        JSON.stringify(context, null, 2) +
        `\n\n---\nQuestion: ${question}`;

      // Retry up to 3 times on 503 (model overloaded)
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await chat.sendMessage(prompt);
          const answer = result.response.text();
          return res.status(200).json({ answer });
        } catch (err) {
          lastErr = err;
          if (err.status !== 503) break;
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
        }
      }
      throw lastErr;
    } catch (err) {
      logger.error("Chatbot error:", err);
      const msg = err.status === 503
        ? "The AI is busy right now — please try again in a moment."
        : "Failed to generate a response. Please try again.";
      res.status(500).json({ error: msg });
    }
  }
);
