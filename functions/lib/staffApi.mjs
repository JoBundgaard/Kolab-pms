import { createRequire } from "node:module";

// The callable entry point uses CommonJS. Use its HttpsError constructor too:
// firebase-functions ships separate ESM/CJS classes, and the HTTP serializer
// recognizes only instances of the constructor from its own module graph.
const { HttpsError } = createRequire(import.meta.url)("firebase-functions/v2/https");

export async function staffApi({ db, authAdmin, request }) {
  if (!request.auth || !request.auth.token.email_verified)
    throw new HttpsError(
      "unauthenticated",
      "Sign in with a verified Google account.",
    );
  const { safeId, normalizeProfile, requireDay, weekStart } = await import(
    "./staffDomain.mjs"
  );
  const { staffAction } = await import("./staffActions.mjs");
  const actorUid = request.auth.uid;
  const access = await db.doc(`pmsAccess/${actorUid}`).get();
  const manager =
    access.exists &&
    access.data().role === "manager" &&
    access.data().active === true;
  const profileSnap = await db.doc(`staffProfiles/${actorUid}`).get();
  const profile = profileSnap.exists
    ? { ...profileSnap.data(), uid: actorUid }
    : null;
  const allowed = manager || profile?.active;
  const { action, ...input } = request.data || {};
  if (action === "session")
    return {
      role: manager ? "manager" : profile?.active ? "staff" : "pending",
      profile,
    };
  if (!allowed)
    throw new HttpsError(
      "permission-denied",
      "Your account has not been given access.",
    );
  try {
    if (action === "team") {
      if (!manager)
        throw new HttpsError("permission-denied", "Manager access required.");
      const profiles = await db.collection("staffProfiles").get();
      return {
        profiles: profiles.docs.map((d) => ({ ...d.data(), uid: d.id })),
      };
    }
    if (action === "saveProfile") {
      if (!manager)
        throw new HttpsError("permission-denied", "Manager access required.");
      const normalized = normalizeProfile(input);
      let user;
      try {
        user = await authAdmin.getUserByEmail(normalized.email);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        user = await authAdmin.createUser({
          email: normalized.email,
          displayName: normalized.name,
        });
      }
      if (input.uid && input.uid !== user.uid)
        throw new Error(
          "An existing staff email cannot be changed to another account.",
        );
      const actionId = safeId(input.actionId),
        now = new Date().toISOString();
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`staffProfiles/${user.uid}`),
          old = await tx.get(ref);
        const audit = db.doc(`staffAudit/${actorUid}_${actionId}`);
        if ((await tx.get(audit)).exists) return;
        tx.set(ref, {
          ...normalized,
          updatedAt: now,
          updatedBy: actorUid,
          createdAt: old.data()?.createdAt || now,
        });
        tx.set(audit, {
          action,
          uid: user.uid,
          actor: actorUid,
          at: now,
          previous: old.data() || null,
          profile: normalized,
        });
      });
      return { uid: user.uid };
    }
    const uid = safeId(manager ? input.uid || actorUid : actorUid);
    if (!manager && input.uid && input.uid !== actorUid)
      throw new HttpsError(
        "permission-denied",
        "You can only access your own records.",
      );
    if (action === "board") {
      const date = requireDay(input.date),
        week = weekStart(date);
      const [staff, day, days, purchases] = await Promise.all([
        db.doc(`staffProfiles/${uid}`).get(),
        db.doc(`staffDays/${uid}_${date}`).get(),
        db
          .collection("staffDays")
          .where("uid", "==", uid)
          .where("week", "==", week)
          .get(),
        db
          .collection("staffPurchases")
          .where("uid", "==", uid)
          .where("week", "==", week)
          .get(),
      ]);
      if (!staff.exists) throw new Error("Staff member not found.");
      return {
        profile: { ...staff.data(), uid },
        day: day.exists ? { ...day.data(), id: day.id } : null,
        days: days.docs.map((d) => ({ ...d.data(), id: d.id })),
        purchases: purchases.docs.map((d) => ({ ...d.data(), id: d.id })),
      };
    }
    if (action === "receipt") {
      const id = safeId(input.purchaseId),
        receipt = await db.doc(`staffReceipts/${id}`).get();
      if (!receipt.exists || (!manager && receipt.data().uid !== actorUid))
        throw new HttpsError("permission-denied", "Receipt unavailable.");
      return { data: receipt.data().data };
    }
    return await staffAction({
      db,
      actor: {
        uid: actorUid,
        manager,
        name: request.auth.token.name || request.auth.token.email,
      },
      action,
      input,
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code === 9)
      throw new HttpsError(
        "failed-precondition",
        "Staff indexes are still being prepared. Please try again shortly.",
      );
    throw new HttpsError(
      "failed-precondition",
      error.message || "Could not save. Please retry.",
    );
  }
}
