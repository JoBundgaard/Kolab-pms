import assert from "node:assert/strict";
import process from "node:process";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  terminate,
  setLogLevel,
} from "firebase/firestore";

setLogLevel("silent");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw new Error("A local Firestore emulator is required.");
const projectId = "demo-kolab-staff";
const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
async function seed(path, fields) {
  const response = await fetch(`${base}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  assert.equal(response.status, 200, `Seed ${path}`);
}
await seed("pmsAccess/manager", {
  role: { stringValue: "manager" },
  active: { booleanValue: true },
});
await seed("pmsAccess/disabled", {
  role: { stringValue: "manager" },
  active: { booleanValue: false },
});
await seed("staffProfiles/worker", { active: { booleanValue: true } });
await seed("financeEntries/linked", {
  sourceType: { stringValue: "staff_day" },
  sourceId: { stringValue: "day1" },
  amountVnd: { integerValue: "100000" },
  status: { stringValue: "active" },
});
const apps = [],
  databases = [];
function client(uid, verified = true) {
  const app = initializeApp(
    { projectId, apiKey: "demo-key", appId: `demo-${uid}` },
    `rules-${uid}-${verified}`,
  );
  const db = getFirestore(app),
    [hostname, port] = host.split(":");
  connectFirestoreEmulator(
    db,
    hostname,
    Number(port),
    uid === "anonymous"
      ? {}
      : {
          mockUserToken: {
            sub: uid,
            user_id: uid,
            email: `${uid}@example.test`,
            email_verified: verified,
          },
        },
  );
  apps.push(app);
  databases.push(db);
  return db;
}
const manager = client("manager"),
  worker = client("worker"),
  unknown = client("unknown"),
  disabled = client("disabled"),
  unverified = client("manager", false),
  anonymous = client("anonymous");
let checks = 0;
async function denied(promise) {
  await assert.rejects(promise, (error) => error.code === "permission-denied");
  checks++;
}
async function allowed(promise) {
  await promise;
  checks++;
}
try {
  const managerCollections = [
    "bookings",
    "calendarBlocks",
    "guests",
    "maintenance",
    "recurringTasks",
    "recurringCleaningTasks",
    "roomStatuses",
    "housekeepingOverrides",
    "crmAccounts",
    "crmPayments",
    "crmAlerts",
  ];
  for (const name of managerCollections) {
    await allowed(setDoc(doc(manager, name, "fixture"), { fixture: true }));
    await allowed(getDoc(doc(manager, name, "fixture")));
    await allowed(getDocs(collection(manager, name)));
    await denied(getDoc(doc(worker, name, "fixture")));
    await denied(setDoc(doc(worker, name, "fixture"), { fixture: false }));
  }
  for (const db of [worker, unknown, disabled, unverified, anonymous]) {
    await denied(getDocs(collection(db, "bookings")));
    await denied(getDoc(doc(db, "financeEntries", "linked")));
    await denied(setDoc(doc(db, "financeEntries", "fake"), { amountVnd: 1 }));
    await denied(
      setDoc(doc(db, "pmsAccess", "worker"), { role: "manager", active: true }),
    );
  }
  for (const name of [
    "staffProfiles",
    "staffDays",
    "staffPurchases",
    "staffReceipts",
    "staffAudit",
    "staffTaskClaims",
    "pmsAccess",
  ]) {
    for (const db of [worker, manager]) {
      await denied(getDoc(doc(db, name, "worker")));
      await denied(setDoc(doc(db, name, "worker"), { active: true }));
    }
  }
  await allowed(getDoc(doc(manager, "financeEntries", "linked")));
  await denied(
    updateDoc(doc(manager, "financeEntries", "linked"), {
      paymentDate: "2026-11-03",
    }),
  );
  await denied(deleteDoc(doc(manager, "financeEntries", "linked")));
  await denied(
    setDoc(doc(manager, "financeEntries", "new-linked"), {
      sourceType: "staff_purchase",
      amountVnd: 1,
    }),
  );
  await allowed(
    setDoc(doc(manager, "financeEntries", "manual"), {
      amountVnd: 10000,
      status: "active",
    }),
  );
  await allowed(
    updateDoc(doc(manager, "financeEntries", "manual"), {
      paymentDate: "2026-11-03",
    }),
  );
  await denied(
    updateDoc(doc(manager, "financeEntries", "manual"), {
      sourceType: "staff_day",
    }),
  );
  await denied(deleteDoc(doc(manager, "financeEntries", "manual")));
  console.log(
    `PASS: ${checks} Firestore rules checks. Manager access, staff isolation, escalation denial, and linked-finance protections verified.`,
  );
} finally {
  await Promise.all(databases.map((db) => terminate(db)));
  await Promise.all(apps.map((app) => deleteApp(app)));
}
