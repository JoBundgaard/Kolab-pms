# Finance integration · first increment

The Finance sidebar workspace adds provisional management reporting and manual expense/other-income/payout records. It follows the categories reviewed in the user's Kolab Finance 2026 workbook. The user confirmed daily room figures are net after commission. The source workbook is unchanged; no spreadsheet rows or opening balances were imported.

## Included

- Reporting month and property filters: Townhouse, Neighbours, Roamr (District 2 in the source workbook), Company/shared, and Unassigned.
- Net accommodation estimate by stay month, based on existing PMS pricing. Short-stay totals are distributed across financial nights with integer VND remainder handling. Long stays use existing calendar-month rent semantics, room/rate moves, financial checkout, and sellable breaks. This remains an estimate: CRM rent-date billing, services, waivers, cancellations with retained charges, and charge adjustments are not reconciled into this figure.
- Manual operating expenses and overhead, interest, tax, loan principal and owner drawings. Principal and drawings affect cash only. Shared overhead affects consolidated results without being silently allocated across properties.
- Other income outside guest billing. Airbnb payouts record cash only and do not increase accommodation revenue a second time. Existing guest services/payments belong in CRM, not in manual other-income entries.
- Separate belonging-to and payment dates. Unpaid expenses can be settled in full later. Partial settlements currently require separate bill entries; do not record a full payment for a partially paid bill.
- Existing CRM receipts feed recorded cash movements directly. They include security deposits, reservation advances and account credit receipts. They are not added to the accommodation income estimate. Reversed receipts are excluded from the original receipt month; reversals represent corrections, not bank refunds.
- Voids retain original amount, description, creator, dates and a mandatory correction reason. A void changes reported records; it never refunds or transfers money. Correct an entry by voiding it and recording its replacement.

## Persistence and access

`financeEntries/{actionId}` contains `kind`, `category`, `propertyId`, `amountVnd`, `date`, `month`, `paymentDate`, `paymentMonth`, `method`, `reference`, description, creator and creation timestamp. An optional later settlement adds payment attribution/timestamp. Voiding adds status, reason, actor and timestamp without deleting the document.

Creation uses a stable form action ID and a transaction, so retries cannot write a duplicate. Settlement/void transactions read current state to protect against concurrent changes. Finance reads are scoped to the selected reporting month OR payment month through two simple queries, deduplicated by document ID. Listeners exist only while Finance is mounted and unsubscribe on leaving the screen or changing month/user.

The deployment's Firestore security rules are not in this repository. Before live use, verify that `financeEntries` follows the existing authorized-staff policy, rejects unauthorized access/deletion, validates fields and amounts, and preserves immutable original/audit fields during permitted settlements/voids. Frontend validation is not an authorization boundary. No rules or backend functions were deployed by this increment.

Reports and mutations stay unavailable until both new collection queries are confirmed by the server and existing CRM sources have loaded without errors. Cached-only, failed and unauthorized reads must not look like zero balances. Existing booking read failures also suppress reports.

## Deliberate reporting limits

- Cash movement is a total of recorded receipts and payments, not a bank balance or reconciled cash-flow statement. No opening balances, account transfers, security refunds/deductions, currency conversion, or bank matching yet.
- Free-text payment methods/accounts are temporary labels, not verified account balances.
- Receipts follow the booking's room at the receipt date, falling back to the original booked room for advance payments. Missing bookings/rooms remain Unassigned. This allocation needs review before property cash reporting becomes authoritative.
- Accommodation is generated from the current booking record, not a closed-period financial journal. Later booking edits can change historical estimates.
- The existing Airbnb pricing helper supplies the net estimate. No new commission/tax rules were introduced. Before relying on reports, compare net booking values against source sheet/payouts; never deduct those commissions again as operating expenses.
- No automatic Sheets synchronization or historical imports. Source monthly summaries and underlying detail must not both be imported as transactions.

## Next increments

1. Review one completed source month and map each source range/category to its intended import. Capture discrepancies separately, including Overview links missing October costs. Import into a preview with stable source IDs; approve reconciliation before persisting. Do not invent missing gross prices, commissions, payments or balances.
2. Add structured cash/bank accounts, verified opening balances, transfers, split settlements, deposit cash movements and bank-statement matching. Account for payments through Wise/Revolut with explicit currency and VND conversion records.
3. Reconcile earned accommodation/services and financial adjustments to CRM charges. Add reviewed financial snapshots/period close so historical profit does not change with booking edits.
4. Add recurring expenses, cleaning-hours/laundry workflows and receipt attachments; retain staff approval before operational task data creates payable amounts.
5. Add saved invoices and full property/consolidated reports, with allocations, financing and owner cash flows shown separately.

## Validation

Run `npm test`, `npm run build`, and targeted ESLint for Finance files. Tests cover net revenue without double commission, checkout/month boundaries, calendar-month room transfers and breaks, belonging-to versus payment dates, cash-only payouts/principal, shared overhead, reversals, voids, invalid entries, duplicate/concurrent creates, settlements, and subscription deduplication/cleanup. The service adapter tests model transaction retry behavior; they are not Firebase emulator or production-rules tests.

The full suite passed with 93 tests; production build and Finance-specific lint passed. Desktop and 390px mobile browser checks used fictional bookings/receipts and intercepted in-memory persistence to verify creation, settlement, totals, void history, CRM receipts, and hidden totals/disabled actions on a read error. No production records were read or written by these browser checks. Vite live-reload WebSocket connections were blocked by the test browser's local-network checks; page rendering and interactions completed without page errors.
