# Guests & CRM implementation

Implemented locally on 25 October 2026. No live financial records were migrated and no Firebase deployment was performed.

## Trying the workspace

Run `npm run dev` and open Guests & CRM in the sidebar. CRM and Long-Term are now one workspace with Long & medium stays, Short stays, and All guests views. Search covers the complete loaded guest directory; results paginate at 25 rows. An empty search stays empty.

Airbnb accommodation is always assumed prepaid via Airbnb, as requested. It never creates guest rent-collection alerts. A dated switch from Airbnb to direct billing creates direct obligations only for that portion of the stay. Separately configured services and security deposits can still be tracked.

For an existing direct booking, open the guest and choose Set up billing. Review:

1. The first date/month to track and the first due date.
2. Calendar-month rent or a per-stay amount.
3. Any confirmed older unpaid rent, kept separate from the tracked period.
4. Booking deposit/advance rent and security deposit requirements.
5. Existing unbilled extras/credits to include once.

Confirm the opening review, then record already-received payments with their actual receipt dates. Old `paymentStatus`, `rentPaidThrough`, and `rentLastPaidAt` values remain in the booking but do not fabricate payments or settle new charges. The booking form directs staff to CRM instead of offering another Paid/Unpaid switch.

## Financial behavior

- Charges have stable IDs, amounts, due dates, and coverage periods. Confirmed payments allocate to a selected charge or oldest outstanding rent. Partial payments remain outstanding; excess rent payments become explicit account credit.
- Booking deposits allocate toward rent. Security deposits remain separate, including received, deducted, refunded, and held amounts. A recorded refund means money has already been returned; it does not initiate a transfer.
- Credits, changed due dates, reversals, and deposit movements retain staff attribution and reasons. Financial history is stored separately from guest notes.
- Payment writes use a Firestore transaction and stable action ID. Concurrent updates retry against the current account; repeating an action does not create a second receipt.
- Calendar-month pricing follows actual month lengths, room/rate changes, agreed sellable breaks, and the existing early-departure reimbursement setting. Due days 29–31 clamp to the shorter month's last day.
- Booking changes update unpaid future charges and import newly added service items once. Due and paid rent remain historical records; adjustments are explicit. Without deployed backend triggers, the panel offers a schedule-update action.
- Unpaid past charges remain visible after checkout/cancellation. Unpaid future rent is cancelled. Bookings with CRM financial accounts cannot be permanently deleted from the normal booking action; cancel them to preserve history.
- Cleaning day changes also update the booking's weekly cleaning field, keeping Housekeeping aligned. Laundry status resets for the next operational week.

Account balance includes future scheduled charges; overdue and due-soon figures are shown separately. Arrival readiness considers obligations due by arrival, rather than future payments agreed for later.

## Data and access

New collections:

| Collection | Purpose |
| --- | --- |
| `crmAccounts/{bookingId}` | Reviewed plan, bounded charge schedule, current credit and account version |
| `crmPayments/{actionId}` | Receipt, adjustment, reversal, charge and setup audit history |
| `crmAlerts/{bookingId}__{obligationId}` | Current internal alert for one obligation |

Accounts are transaction serialization points. Payment history does not grow inside bookings or `longTermOps`. Schedules are bounded to ten years and 240 charge records per account.

The repository does not contain the deployed Firestore security rules. Before production rollout, grant these collections the same **existing authorized-staff** access policy used for booking finances; preserve the deployment's staff restrictions. Do not replace production rules with broad public access. Account and payment deletion should remain prohibited. The UI disables financial actions if any financial collection fails to sync, rather than treating unread records as zero balances.

No Firestore rules are deployed by this change, and no existing access policy is weakened. If the current deployed policy already grants staff access to these collections, the local workspace can use it immediately.

## Internal background alerts

`functions/crmAlerts.js` defines:

- `crmDailyAlerts`: runs at 09:00 in Asia/Ho_Chi_Minh; posts due-soon, due-today, overdue, three-day follow-up, and seven-day escalation states.
- `crmAccountChanged`: refreshes alerts after payment/account changes.
- `crmBookingChanged`: updates unpaid future schedules and alerts after a booking changes.

Alert IDs are stable and resolved obligations are marked resolved. The browser computes current statuses immediately and writes affected alerts atomically with payments. Background jobs are necessary for persisted daily alerts while nobody has the PMS open. No guest emails/messages or automated money collection are enabled.

After reviewing the project's production access rules and enabling the required Firebase services, deploy the new functions using:

```sh
firebase deploy --only functions:crmDailyAlerts,functions:crmAccountChanged,functions:crmBookingChanged
```

Deploy the frontend through the project's normal hosting workflow. This repository currently has only Functions configuration in `firebase.json`; this implementation does not invent or replace a hosting target.

## Validation

`npm test` runs the existing date, room-transfer, housekeeping, and export tests alongside new financial and transaction tests. Financial coverage includes Airbnb prepayment and direct transitions, month-end due dates, proration, overlapping breaks, partial/advance receipts, deposits, credit allocation, refunds, reversals, migration, schedule changes, internal alert stages, and concurrent/idempotent writes.

The React workspace was exercised in a browser with isolated fictional data, including payment and deposit forms, setup, profiles, no-results search, historical debt, and layouts at 736, 390, and 320 pixels. No production guest records were written during testing.

The production build and targeted lint for the new code pass. Repository-wide lint has pre-existing errors in the large App component, Housekeeping component, and existing chatbot helpers. Firebase emulator integration is not verified here because a Java runtime is unavailable. Local function discovery also stalled while loading the existing `firebase-admin` dependency; syntax checks passed, but background functions require runtime/deployment verification.

## Rent-date billing correction (25 October 2026)

New monthly setups default to rent-date months anchored to arrival. Existing plans without `periodBasis` remain calendar-month plans until explicitly corrected. Rent-date months clamp the anchor day in shorter months and restore it afterward. Partial periods use nights divided by the full rent cycle length; checkout is exclusive. Rate changes, direct/Airbnb transitions and agreed sellable breaks still apply.

For Kim's existing setup, enable **Correct billing periods / paid-through date** in Billing settings, choose **Monthly · from rent date**, set the anchor to **24 September 2026**, the paid-through / first unpaid date to **24 October 2026**, and the first due date to **24 October 2026**. Enter a correction reason and review the schedule before saving. At a monthly rate of 15,505,478 VND, 24 October–12 November is 19 of the 31 nights in the 24 October–24 November cycle: **9,503,357 VND** (unless other booking rate changes or agreed breaks apply).

Corrections replace unreceived scheduled rent, including overdue charges. Opening arrears, services, deposits and receipt history remain separate. The transaction stores the previous plan and charges in the audit event and resolves superseded alerts. Changing period structure is blocked where scheduled rent has recorded payments or credits; staff must reverse those allocations first. The paid-through date excludes earlier coverage without inventing a receipt. Existing guest records are not automatically migrated.
