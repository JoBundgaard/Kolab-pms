# Kolab CRM: research and proposed redesign

Prepared 25 October 2026. Scope: review of the current source and research into guest, rent, and deposit workflows. This is a design proposal; application behavior and live guest records have not been changed. The accompanying interface preview uses fictional guests and transactions.

Implementation follow-up: the user approved the redesign and specified that Airbnb guests should always be assumed prepaid via Airbnb. The implementation therefore suppresses Airbnb accommodation collection alerts instead of using the earlier proposal's unknown-payment state. See [implementation notes](crm-implementation.md) for the current code, migration workflow, and deployment status. The findings below describe the application before the redesign.

## Recommendation

Merge the CRM and Long-Term navigation items into one **Guests & CRM** workspace with three primary views:

- **Long & medium stays**: rent collection, deposits, arrivals, extensions, and balances.
- **Short stays**: arrival readiness, booking payments, deposits when required, departures, and repeat guests.
- **All guests**: the searchable guest directory, preferences, contact details, and full stay history.

Use an operational table for stay management and open a guest panel from any row. Keep one permanent guest profile, with separate bookings and financial records attached to it. A guest can return for a different type of stay without creating another identity.

This recommendation combines the existing Kolab workflows with patterns in rental and hospitality systems. It is a product judgment for this PMS, rather than a claim that one vendor's screen is universally best.

## Findings in the current application

| Area | What exists | Consequence for this redesign |
| --- | --- | --- |
| CRM | Contact lookup, tags, notes, returning-guest information, booking creation, and stay history (`src/App.jsx:9612`). | Reuse these as the shared guest profile. |
| Long-Term | Current/past long stays, rent due day, paid-month flags, extras/credits, cleaning, laundry, and copyable monthly summaries (`src/App.jsx:5960`, `8955`). | Reuse the operational context, while replacing the payment flags. |
| Stay categories | Short: 1–6 nights; medium: 7–30; long: 31+; saved categories can override inference (`src/App.jsx:4840`). | Retain existing classifications initially; show medium and long together as requested. |
| Coverage | Long-Term explicitly selects only `long` and has no upcoming-arrivals list (`src/App.jsx:6074`). | Medium stays and pre-arrival deposit work currently fall outside that workspace. |
| Payment status | A direct booking marked `paid`, a matching `rentPaidThrough` month, or a payment timestamp in the current month can each mark rent paid (`src/App.jsx:5976`). | A booking-level flag may mask later monthly debt; payment date does not identify which period was paid. |
| Past balances | Historical rent status can read paid when the extras balance is zero or negative (`src/App.jsx:6011`). | Rent debt needs its own persisted charges and payment allocations. |
| Settlement | “Settle month” marks extras `billed` and sets the rent-paid month (`src/App.jsx:7170`). | Billing, receiving money, and settling a balance need separate meanings. |
| Deposits | No dedicated deposit requirements or received/refunded deposit records found in the inspected source. | Add structured deposit tracking rather than storing this in notes. |
| Rent calculation | Existing rent uses calendar-month proration, room/rate segments, and eligible break deductions (`src/App.jsx:993`). | Preserve this pricing behavior in the first release and make its rules visible. |
| CRM search | Guest subscription is limited to 100; an empty search result falls back to the full loaded list (`src/App.jsx:5163`, `9613`). | Add explicit no-results behavior and searchable pagination. |
| Invoices | A printable invoice generator exists; the invoice-list screen is still a placeholder (`src/App.jsx:11228`). | Connect documents to the same financial records later; avoid creating a second payment tracker. |

## What the research supports

- **Tables fit the daily task.** Staff need to locate a guest, compare dates and balances, and find exceptions. Nielsen Norman Group describes these as core data-table tasks. Use a compact table with useful sorting and filters, then disclose details on selection. [NN/g: Data Tables](https://www.nngroup.com/articles/data-tables/)
- **Payment schedules belong to the reservation.** Guesty supports recurring timing, configurable charge dates, upfront payments, and schedule previews for long stays. Adopt the pattern of visible future obligations, with a clear distinction between a scheduled charge and received money. Its 28-night product threshold does not need to replace Kolab's categories. [Guesty: Long-stay installments](https://help.guesty.com/hc/en-gb/articles/36889157718173-Managing-payment-installments-for-long-term-stays)
- **Use a transaction ledger.** Buildium describes charges, dated payments with methods/references, adjustments, deposits, and a running balance. For Kolab this supports replacing monthly checkboxes with a history that explains every balance. [Buildium: Tenant ledger](https://www.buildium.com/dictionary/tenant-ledger/)
- **Filters must not erase debt.** Cloudbeds explains that a balance can include older transactions hidden by a folio filter. Kolab should always show all outstanding debt, even when staff inspect one month's activity. [Cloudbeds: Balance Due](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/43320118470811-Balance-Due-and-Transaction-Summary)
- **Guest payment and platform payout are different events.** Airbnb collects and releases monthly-stay payments on separate timelines. A delayed host payout should create a reconciliation task, rather than an instruction to collect the same rent from the guest. [Airbnb: Monthly payouts](https://www.airbnb.com/help/article/285)
- **Reservation changes should preserve history.** Guesty's installment guidance recalculates future scheduled amounts while preserving completed transactions. Apply that principle to extensions, rate changes, room moves, and cancellations. [Guesty: Installment calculations](https://help.guesty.com/hc/en-gb/articles/36889219328925-Understanding-payment-installment-calculations)

## Layout and information hierarchy

### Shared controls

Put the three primary views at the top. Below them, offer a stay-status filter: **Active & arriving**, **Arriving**, **In-house**, **Past**, and **All stays**. Keep **Needs attention** as a separate filter so it can include an arrival, a resident, or a departed guest with money outstanding.

Default Long & medium to active and arriving stays, with arrivals in the next 30 days. Keep that window adjustable; deposit alerts must consider every due requirement even if check-in is farther away. A persistent attention count should expose outstanding issues outside the current date/status filter.

Provide name/email/phone/room search, property and channel filters, and an explicit sort. Preserve the user's selected view and filters. Scope summary counts visibly; show both the amount and number of affected stays where appropriate. Do not silently calculate totals from only the first page of results.

### Long & medium stays

Place four actionable summaries above the table:

1. **Overdue rent**: unpaid rent already past its due date.
2. **Due soon**: unpaid rent due in the next three days, including today.
3. **Deposit action**: overdue or imminent deposit requirements, including partial deposits.
4. **Ending soon**: stays ending in the next 14 days that need a renewal or departure decision.

Recommended table columns:

| Column | Main value | Supporting detail |
| --- | --- | --- |
| Guest & room | Guest name; current or upcoming room | Property, channel, medium/long badge |
| Stay | Arrival → departure | Arriving / in-house / past; on break if relevant |
| Rent | Current installment amount and coverage period | Billing plan, e.g. monthly or prepaid |
| Payment due | Oldest unpaid due date | Days overdue, or next upcoming payment when no debt remains |
| Balance | Overdue amount / total outstanding | Partial-payment amount or account credit where relevant |
| Deposit | Required, received, and remaining | Due date; held/refund status for security deposits |
| Action | Record payment | Open details; contextual follow-up |

Sort by actionable financial urgency first: overdue obligations, imminent arrivals missing required payments, due soon, then other stays. Allow room-order sorting for a property walk-through.

Keep laundry and cleaning out of the main payment table. Show their current status in the guest panel, backed by the same records used by Housekeeping. A compact service indicator can be an optional column if staff use it daily.

### Short stays

Keep the same guest panel and financial engine, but change the table emphasis to arrival/departure, booking total, collected amount, remaining payment, channel/collector, deposit if required, and readiness. Hide recurring-rent controls unless that booking actually uses installments.

### All guests

Show one row per guest, rather than per stay: name/contact, current or next stay, latest departure, stay count, tags, and aggregate account status. Expand all bookings from the profile. A person with both short and long bookings remains one guest here; operational views classify their individual stays.

Profiles with no booking remain searchable in All guests. Cancelled/no-show stays remain in history and in financial attention results when they still have obligations, credits, or deposits to resolve.

### Guest panel

Open a side panel on desktop and a full-width detail screen on mobile. Keep the selected booking explicit when the guest has multiple stays.

- **Overview**: contact details, dates, current/upcoming room, arrival readiness, notes, tags, assigned staff member, and next action.
- **Payments**: schedule, charges, payments and allocations, all outstanding debt, credits, and statement/receipt actions.
- **Deposits**: requirement, due date, receipts, security deposit held, deductions, refunds, and remaining amount.
- **Stay & services**: room moves, rent changes, break periods, cleaning/laundry context, extensions, and departure planning.
- **History**: prior stays and an activity timeline including who changed financial records.

Use text alongside color: “4 days overdue · 4,000,000 ₫ remaining” is more useful than a red dot. Keep the primary action available without hover.

## Rent and payment logic

### Separate stay length from payment plan

Stay category describes the booking; billing plan describes how money is collected. Offer **paid in full**, **deposit + balance**, **monthly**, and **custom installments**. A 21-night medium stay can be fully prepaid. A 60-night stay can also be prepaid, even though it appears in Long & medium.

Keep the current short/medium/long thresholds initially to avoid reclassifying existing bookings. These are internal operational categories, not legal tenancy definitions or channel payment rules. Consider configurable thresholds later.

### Payment setup

For each booking, store the collector (Kolab/platform/company), billing basis, rate, coverage dates, first due date, recurring due-day rule, optional reminder grace period, and deposit requirements. Present the resulting schedule before saving.

For the first release, retain Kolab's calendar-month pricing and actual-days-in-month proration. Distinguish the **period the rent covers** from the **date payment is due**. An anniversary billing plan can be added deliberately later; changing the due day alone must not silently change the rent calculation.

Rules to make explicit:

- The first partial period is due at the agreed first due date, normally no later than arrival; do not create a due date before the booking exists.
- A due day of 29, 30, or 31 clamps to the last day of a shorter month and returns to the original configured day in later months.
- Checkout is an exclusive occupancy boundary, consistent with existing nightly calculations.
- Rent changes apply from a dated effective point. Room moves change room attribution; they change rent only when a rate change is explicitly agreed.
- Preserve the existing eligible-break deduction policy initially. Show the credit once and label whether it is granted for availability or for actual resale; do not deduct it twice.
- An extension generates additional obligations. An early departure follows the agreed reimbursement policy and adds adjustments where needed.
- Saved financial transactions remain historical facts. Correct them with a reversal/credit; do not recompute them invisibly after a booking edit.

### Status is calculated from money and dates

Each rent installment has an amount, coverage period, due date, credits/adjustments, and allocated confirmed payments. Its remaining amount is its adjusted charge less those allocations. Unapplied account credit is shown separately until allocated.

- **Scheduled**: future obligation not yet posted.
- **Unpaid / due soon / due today**: posted charge still outstanding, with urgency based on its due date.
- **Partially paid**: some payment allocated, with the remaining amount always visible.
- **Paid**: remaining amount is zero.
- **Overdue**: a positive remaining amount after the local due date ends.
- **Waived / voided**: explicit reasoned adjustment; distinct from payment.

Represent payment progress and urgency independently: an installment can be both **partially paid** and **4 days overdue**. Payment attempts can be pending, failed, or reversed; none should incorrectly make a charge appear fully paid. A transfer screenshot can be recorded as awaiting verification rather than receipt of funds.

Example: October rent is 10,000,000 ₫, due 5 October. A confirmed 6,000,000 ₫ payment allocated to October leaves 4,000,000 ₫ overdue on 25 October. A payment received on 1 November can settle that October debt; its receipt date does not turn it into November rent. An advance payment for December must not erase unpaid October rent unless it is explicitly reallocated.

Show **overdue**, **due now**, **future scheduled**, **account credit**, and **security deposit held** separately. Month filters change visible activity, not the total outstanding balance. Debt persists after month-end, checkout, or cancellation until resolved.

### Record payment

Replace “Mark paid” with a short form prefilled from the selected obligation:

- Amount received; received date; method (transfer, cash, card, platform, other).
- Reference and optional note/evidence.
- Which rent period, balance charge, or deposit it covers.
- Preview of the remaining balance after allocation.

Allow partial payment, a payment covering several charges, and unallocated credit for overpayment. Suggest allocation to the oldest outstanding rent first, display the allocation, and allow staff to change it. Exclude refundable security deposits from automatic rent allocation.

Saving a confirmed payment updates the affected charge, summaries, and alerts together. Record staff member and timestamp. Prevent duplicate submissions and duplicate imported transactions. A payment receipt references received money; an invoice/statement describes charges and balance due. Creating an invoice never marks it paid.

## Deposit logic and arrival readiness

Use two distinct deposit types:

1. **Booking deposit / advance rent**: payment toward the stay; reduce the relevant rent or balance charges when allocated.
2. **Refundable security deposit**: money held for the stay; show separately from rent paid, rent owed, and rental revenue totals.

For either type, store required amount, due date, received amount, pending verification, and remainder. Requirements can be **not required**, **not yet due**, **due**, **partially received**, **received**, or **waived with a reason**. Overdue is an additional urgency state.

For a security deposit, also track held amount, deductions with reasons, refunds issued, and remaining refundable amount. A card authorization is a hold, not collected cash. Refunds must not exceed the remaining refundable amount, and a pending refund must not be recorded as completed.

An arriving guest's row should answer: **Is the booking deposit satisfied? Is required rent due before arrival satisfied? Is the security deposit collected or validly held when required?** Display “Payment ready” only when all currently required obligations are satisfied. Allow a recorded manager exception; do not silently cancel bookings or block check-in merely because a badge is red.

Deposit amounts and deadlines should be property defaults with per-booking overrides. Do not invent a one-month deposit or a universal deadline. Existing bookings with no reliable setup should show **Needs setup / unverified**, rather than a fictional zero requirement or invented payment.

## Alerts and follow-up

Use the property's local timezone (for these properties, Asia/Ho_Chi_Minh), not the staff device's timezone. The following are proposed operational defaults, configurable per property:

| Trigger | Staff-facing behavior |
| --- | --- |
| Rent due in 3 days | Due-soon count and optional internal reminder |
| Due date | Due-today badge; show amount remaining |
| Day after due date | Overdue badge/count; persistent follow-up item |
| 3 and 7 days overdue | Escalate the same item to assigned staff/manager |
| Deposit due soon or overdue | Deposit action, with required/received/remaining amounts |
| Arrival within 48 hours with a missing required payment | Prioritize arrival-readiness action |
| Departure within 14 days | Renewal/departure task; keep distinct from financial debt |
| Checkout with open debt or held deposit | Retain in attention results until settled/refunded/resolved |

An optional grace period can delay follow-up or escalation without changing the contractual due date or hiding the balance. A promised payment date is a follow-up note, not a payment or revised due date. Snoozing suppresses a reminder temporarily but does not make an overdue installment paid.

Recompute urgency in the interface and use a scheduled backend job for persistent internal alerts when no browser is open. Store a unique key per obligation and escalation stage so refreshes and retries do not create duplicates. Resolve an alert only when its underlying obligation is satisfied, waived, or otherwise explicitly resolved.

Show last follow-up, owner, and next action. Guest emails/messages can be a later opt-in workflow with templates and delivery history; no messages should be sent merely by enabling the internal CRM alerts. Start without automatic late fees.

## Channel-aware collection

Store the responsible collector on each financial obligation, including dated channel changes already supported by room segments. A direct extension following an Airbnb booking must not inherit platform collection accidentally.

For platform bookings, distinguish **guest amount collected/unknown**, **platform payout expected**, and **payout received**. If collection status is unavailable, label it unknown/platform managed rather than assuming paid. Keep gross guest charges separate from net payout, commissions, and deductions. A payout delay belongs in a staff reconciliation queue, not in guest rent reminders. Permit direct service/deposit obligations only when explicitly configured for that booking/channel.

## Suggested implementation structure

Keep existing guest IDs and bookings. Add structured financial entities, for example booking-linked `billingPlans`, `charges`, `payments`, `paymentAllocations`, `depositRequirements`, `depositTransactions`, and `followUps`. Include guest, booking, property, collector, currency, dates, source, and audit metadata as applicable.

Use integer VND amounts. Keep requirement/schedule data separate from money actually received. Preserve an immutable record of confirmed payments and reasoned reversals. Keep security-deposit movements separate from rental charges, even if both appear in a unified activity timeline.

Extract the new UI and logic from the large `src/App.jsx` into focused guest-workspace components and financial services. Use transaction-safe writes for payment recording and allocation, explicit permissions for financial adjustments, and server-side verification for imported payment status. Do not store growing payment histories inside a single `longTermOps` object.

The dashboard, CRM, booking detail, and later invoice list should all consume the same balance calculations. Aggregate money at booking/obligation level and guest counts by unique guest ID to prevent duplicate totals across views. Search and counts must work beyond the current 100-profile limit.

## Delivery order

1. **Foundation and migration preview:** establish billing/deposit requirements; inspect legacy flags; propose opening balances for review. Preserve old metadata. Treat flags as imported assertions, not proof of dated payments. Do not backfill every historical month as either paid or overdue.
2. **Core guest workspace:** merge navigation, add the three views, arrivals/in-house/past filters, shared profiles, and payment/deposit columns. Keep the old Long-Term entry as a temporary redirect.
3. **Reliable collection workflow:** confirmed payment records and allocation, partial/advance payments, outstanding balances across months, deposit receipts/refunds, and internal alert scheduling. Steps 2 and 3 should ship together before staff rely on financial statuses.
4. **Follow-up and documents:** assigned reminders, promise-to-pay notes, statements and payment receipts tied to the ledger, then optional communication/payment-provider integrations.

Acceptance scenarios should include partial rent after its due date, old arrears at month rollover, advance payments, late receipts allocated to an earlier period, short/medium prepaid stays, deposits partially received before arrival, 31st-of-month deadlines, room/rate changes, deductible breaks, early departures, cancelled bookings with unresolved deposits, platform/direct transitions, reversals, duplicate clicks, and multiple staff recording payments concurrently.

The first release is successful when staff can open the workspace and immediately answer: **Who owes what, when was it due, which arrivals are financially ready, and what should I do next?**
