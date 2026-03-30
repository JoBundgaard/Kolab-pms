/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions/v1");
const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

admin.initializeApp();

// TODO: Make sure to set the GEMINI_API_KEY environment variable in the
// Google Cloud console.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});
const generationConfig = {
  temperature: 0.9,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048,
};
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

async function getRent(guestName) {
  const db = admin.firestore();
  const bookingsRef = db.collection("bookings");
  const snapshot = await bookingsRef.where("guestName", "==", guestName).get();
  if (snapshot.empty) {
    return `I couldn't find any bookings for ${guestName}.`;
  }
  const bookings = [];
  snapshot.forEach((doc) => {
    bookings.push(doc.data());
  });
  const parts = [
    {
      text: "You are a helpful assistant for a property management system " +
          "called Kolab.",
    },
    {
      text: "You can answer questions about bookings, guests, and rooms.",
    },
    {
      text: "Here are some examples of questions you can answer:",
    },
    {
      text: "- How much rent is [guest name] paying?",
    },
    {
      text: "- Are there any available rooms this weekend?",
    },
    {
      text: "Based on the following question, please provide a helpful " +
          `answer: How much rent is ${guestName} paying?`,
    },
    {
      text: "Here is the booking information for your reference:",
    },
    {
      text: JSON.stringify(bookings),
    },
  ];

  const result = await model.generateContent({
    contents: [{role: "user", parts}],
    generationConfig,
    safetySettings,
  });

  const response = result.response;
  return response.text();
}

async function checkAvailability() {
  const db = admin.firestore();
  const bookingsRef = db.collection("bookings");
  const today = new Date();
  const weekendStart = new Date(today);
  weekendStart.setDate(today.getDate() + (6 - today.getDay()));
  const weekendEnd = new Date(weekendStart);
  weekendEnd.setDate(weekendStart.getDate() + 2);

  const snapshot = await bookingsRef
      .where("checkIn", ">=", weekendStart)
      .where("checkIn", "<=", weekendEnd)
      .get();
  if (snapshot.empty) {
    return "All rooms are available this weekend.";
  }
  const bookings = [];
  snapshot.forEach((doc) => {
    bookings.push(doc.data());
  });

  const parts = [
    {
      text: "You are a helpful assistant for a property management system " +
          "called Kolab.",
    },
    {
      text: "You can answer questions about bookings, guests, and rooms.",
    },
    {
      text: "Here are some examples of questions you can answer:",
    },
    {
      text: "- How much rent is [guest name] paying?",
    },
    {
      text: "- Are there any available rooms this weekend?",
    },
    {
      text: "Based on the following question, please provide a helpful " +
          "answer: Are there any available rooms this weekend?",
    },
    {
      text: "Here is the booking information for your reference:",
    },
    {
      text: JSON.stringify(bookings),
    },
  ];

  const result = await model.generateContent({
    contents: [{role: "user", parts}],
    generationConfig,
    safetySettings,
  });
  const response = result.response;
  return response.text();
}

exports.chatbot = onRequest(async (req, res) => {
  if (!GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY is not set.");
    res.status(500).send("Chatbot is not configured.");
    return;
  }

  const question = req.body.question;
  if (!question) {
    res.status(400).send("Question is required.");
    return;
  }

  try {
    let answer;
    if (question.toLowerCase().includes("how much rent is")) {
      const guestName = question.split("how much rent is")[1].split("paying")[0]
          .trim();
      answer = await getRent(guestName);
    } else if (question.toLowerCase().includes("available rooms this weekend")) {
      answer = await checkAvailability();
    } else {
      answer = "I can only answer questions about rent and room " +
          "availability at the moment.";
    }
    res.status(200).send(answer);
  } catch (error) {
    logger.error("Error generating content:", error);
    res.status(500).send("Error generating content.");
  }
});
