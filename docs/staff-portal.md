# Housekeeping staff portal

## Included

The existing PMS now routes authorized managers to the PMS and active staff to a phone-sized portal before mounting any manager subscriptions. Staff sign in with their own Google account at the same PMS address.

- **Today:** assigned room and shared-area cards, completion/undo, a reason for unfinished work, and a day-end review and submission. Every task must be completed or have an explanation. Future work cannot be completed. Submitted days lock until a manager reopens them with a reason.
- **My pay:** daily and Monday–Sunday weekly estimates, approved amounts, paid records, and a downloadable CSV statement. Default checkout and weekly cleaning rates are **100,000 VND**. Room checks are unpaid and omitted from statement line items. Shared-area and special-task rates start unset. A manager must set missing completed-task rates before approving pay.
- **Purchases:** property, date, description, VND amount, personal/house money, and compressed receipt photo or explanation. Personal spending is reimbursable; house money is not. JPEG, PNG and WebP input is compressed to JPEG on the device. Receipts are limited to 700,000 base64 characters and stored in a separately authorized Firestore document, never included in work-list responses.
- **Staff & pay:** Google-email onboarding, active/inactive access, property assignment, per-task-type rates, schedule publishing, extra/shared tasks, daily approval, purchase approval/rejection, weekly payment recording, and staff-view preview.

Rates are copied onto tasks when assigned. Profile changes do not rewrite old earnings. Managers can explicitly apply current rates to a draft day; this is audited. Approved days cannot be reopened or edited in this release. Payments record an actual payment already made; they do not initiate transfers. Payment is in full for the selected worker's approved records in the displayed week; partial payments and reversals are not implemented.

## Daily operations

1. Add the staff member in **Staff & pay**, using the email she uses for Google sign-in. Verify property access and rates. No email is sent by onboarding.
2. Choose a date, select rooms from the existing housekeeping schedule, and publish them to her. Add shared-area or special cleaning tasks as needed. Publication is explicit: booking changes after publication do not silently rewrite an assigned day. Review and remove/reassign pending tasks when plans change.
3. She completes tasks or records a reason, reviews her day, and submits it. Her completed room tasks also update the existing housekeeping overrides. These overrides are operational status; payroll always follows the separately submitted staff record.
4. Review the day's task list and notes. Approve, or reopen with a correction reason. After reopening, the staff member resubmits (or a manager can use the clearly labelled staff preview).
5. Review purchases, including receipts. Rejected purchases retain the reason; the staff member can submit a corrected purchase as a new record.
6. In **Week & payments**, review the statement, enter payment date/method/reference, confirm the actual total paid, and record payment.

The task claim collection prevents the same schedule task from being assigned to two people. Pending tasks can be removed and reassigned. Managers can intentionally add separate extra work. Due recurring room-cleaning tasks (such as monthly AC-filter and shower-drain cleaning) appear beneath assigned rooms, including rooms already published. Completing the room opens a checklist: staff must tick each completed item or explain why it was skipped. Confirmed items atomically update Firebase, mark the occurrence clean, and restart the template interval from the actual completion date; monthly intervals use the same calendar day, clamped at month end. Skipped items stay due and their reasons appear in manager review. Undoing the room clean does not undo separately confirmed recurring work. These checklist items do not add separate room pay. Maintenance templates and manually added special tasks remain separate and are not advanced by this checklist.

The portal refreshes on focus, after writes and every 30 seconds while visible. It shows connection and write errors, preserves a failed action's ID for retry, and disables saves offline. It does not promise offline persistence: unsaved form content remains only while that screen stays open. Browser back/reload or changing screens can discard an unfinished form.

## Accounting and audit

All staff mutations run in Firestore transactions through `staffPortal` (us-central1).

- Day approval creates exactly one `financeEntries/staff_day_<uid>_<date>` cleaning expense. Work across multiple properties is recorded as shared cost; single-property work stays allocated to that property.
- Purchase approval creates exactly one `financeEntries/staff_purchase_<id>` supplies expense. Personal purchases are unpaid liabilities until reimbursement; house-money purchases carry their original purchase/payment date.
- Payment settles those same expense records; it does not create another expense. Staff-linked expenses cannot be separately paid, voided or edited through Finance.
- Stable action IDs, task claims, revision checks and transaction retries prevent duplicated assignments, submissions, approvals, and payments. Original submission snapshots, reopen reasons, rate changes, task changes and payment records live in `staffAudit`.
- No guest billing details, booking prices, guest names or other workers' wages are included in staff board responses. Managers publish only room labels, timing, task type and necessary instructions. Do not put unnecessary guest information into those instructions.

Collections: `pmsAccess` (administrator-managed manager allowlist), `staffProfiles`, `staffDays`, `staffTaskClaims`, `staffPurchases`, `staffReceipts`, and `staffAudit`. The callable checks active access on every request. Firestore rules deny direct client access to these collections; the trusted API supplies scoped reads and validated writes. Manager finance/booking collections require an active manager allowlist record and verified email. The existing Admin-backed chatbot now checks the same manager permission.

## Deployment order — required before live staff use

The portal was rolled out to `kolab-living-pms` on 3 November 2026. The previous rules allowed every authenticated account to read and write every document; the deployed rules now enforce explicit manager access. Hosting, API, rules and indexes are part of the same access boundary. The sequence below is retained for future environments and recovery.

1. Confirm the list of existing managers. With Application Default Credentials for the intended Firebase project, grant each already-existing manager account before changing access rules:

   ```sh
   node scripts/grant-manager.cjs kolab-living-pms MANAGER_GOOGLE_EMAIL
   ```

   This creates `pmsAccess/<uid>` with `{ role: 'manager', active: true }`. The script looks up an existing Firebase Auth account and requires an explicit project and email. It does not infer managers from account creation, names, domains or old unrestricted sign-ins. The backend itself cannot grant manager access.

2. Review the managed production rules and merge any additional legitimate manager collections/integrations into `firestore.rules`. The repository rules cover collections used by the current frontend. Preserve any other production indexes when deploying the included new staff indexes; do not approve deletion of unrelated indexes. Validate rules against an emulator or staging project before production. A Java 21+ runtime is required for the Firestore emulator. The first rollout used a checksum-verified temporary Azul Java 21 runtime and passed 111 permission checks.
3. Deploy the API and the authenticated chatbot, then the rules and new indexes. Wait for indexes to become ready:

   ```sh
   firebase deploy --only functions:staffPortal,functions:chatbot --project kolab-living-pms
   firebase deploy --only firestore:rules,firestore:indexes --project kolab-living-pms
   ```

4. Build and deploy Hosting in the same rollout. Between the chatbot deployment and Hosting deployment, older clients must reload to use authenticated chatbot requests:

   ```sh
   npm test
   npm run build
   firebase deploy --only hosting --project kolab-living-pms
   ```

5. Verify a manager login, a staff login, and an unapproved Google login. Confirm that staff cannot directly read bookings, guest records, other pay records or receipts, grant roles, or write financial approvals. Verify the complete assignment → completion → submission → approval → payment flow with a clearly marked staging worker before onboarding live staff.

Manager access can be revoked by setting `pmsAccess/<uid>.active` to false with administrator credentials. Staff access can be disabled from Profile & rates. Staff history remains available to managers for review and settlement.

## Validation

`npm test` includes tests for calendar boundaries/timezones, 100,000 VND cleans and unpaid checks, rate snapshots, missing-rate approval blocks, task ownership, inactive/unknown users, API read scoping, immutable submissions, stale revisions, duplicate/concurrent assignments and approvals, purchase validation, receipt validation, reimbursement accounting and duplicate/concurrent payments. The in-memory transaction adapter rejects read-after-write ordering and simulates optimistic retries.

Local browser checks use fictional data and the real transaction handler, with all live Firebase requests blocked. They cover phone sizing, task completion, day submission, zero-pay checks omitted from statements, a lost-response purchase retry, Vietnamese switching, offline saves disabled, manager approval and combined payment. They are not a substitute for staging Firestore-rules verification or live deployment validation.

The browser check is retained as `scripts/staff-browser-check.cjs`. With the local Vite server running, use:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node scripts/staff-browser-check.cjs
```

It uses installed Chrome by default on macOS; set `CHROME_EXECUTABLE` for another Chrome installation, and `PMS_TEST_URL` for a different local port. The script prints its screenshot output directory. It rejects non-local app URLs and blocks live Firebase traffic.


## 3 November 2026 rollout verification

- Live frontend: https://kolab-living-pms.web.app. The deployed entry-point asset was compared with the local production build.
- Manager access is explicitly provisioned for Jonas (`jobundgaard19@gmail.com`), Van Anh (`vananhkieu2908@gmail.com`), and Kolab Living (`kolabliving@gmail.com`). Kenny was not granted manager access, per the owner's instruction. No housekeeping profile was created; add the housekeeper with her own Google email in Staff & pay.
- Live Google sign-in as Kolab Living, the manager dashboard, Staff & pay, and the onboarding form were verified in the browser. The form defaults to Vietnamese, 100,000 VND checkout/weekly cleans, and unpaid room checks.
- 120 unit/service tests pass. A live check exposed a CommonJS/ESM `HttpsError` constructor mismatch; the API now uses the same constructor as the callable HTTP entry point. A regression test verifies that unauthenticated and permission-denied errors retain their correct HTTP error type.
- The repeatable rules test is `scripts/staff-rules-check.mjs`. It covers manager collection reads/writes, staff isolation, unapproved/disabled/unverified identities, role escalation denial, and protected staff-linked finance entries. Run with Java 21+ available:

  ```sh
  firebase emulators:exec --only firestore --project demo-kolab-staff --config firebase.emulators.json 'node scripts/staff-rules-check.mjs'
  ```

  This test refuses non-local emulator addresses and uses only the demo project. All 111 checks passed before production rules deployment.

Final live checks confirmed both backend functions are ACTIVE, both staff indexes are READY, deployed rules match the repository, and the hosted JavaScript asset matches the production build. Anonymous and invalid-token staff API calls both return HTTP 401 after the error-constructor fix. No live housekeeping work, purchases, wages or payments were created during verification.
