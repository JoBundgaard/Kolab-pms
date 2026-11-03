const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.staffPortal = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    const { staffApi } = await import("./lib/staffApi.mjs");
    return staffApi({ db: admin.firestore(), authAdmin: admin.auth(), request });
  },
);
