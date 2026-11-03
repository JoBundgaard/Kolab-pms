// Run explicitly with Application Default Credentials for the intended project.
// This does not grant access based on the fact that an account can sign in.
const admin = require("../functions/node_modules/firebase-admin");
const [projectId, email] = process.argv.slice(2);
if (!projectId || !email) {
  console.error(
    "Usage: node scripts/grant-manager.cjs PROJECT_ID MANAGER_GOOGLE_EMAIL",
  );
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
});
(async () => {
  const user = await admin.auth().getUserByEmail(email);
  await admin
    .firestore()
    .doc(`pmsAccess/${user.uid}`)
    .set({
      role: "manager",
      active: true,
      email: user.email,
      grantedAt: new Date().toISOString(),
    });
  console.log(`Manager access granted to ${email} on ${projectId}.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
