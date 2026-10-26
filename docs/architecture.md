# PMS architecture

The PMS remains one application with one Firebase initialization and shared booking and guest records. Screens, dialogs, configuration and reusable calculations have separate modules so new features can be added without growing one file indefinitely.

## Module boundaries

| Location | Responsibility |
| --- | --- |
| `src/App.jsx` | Application shell, navigation, shared state and existing action handlers |
| `src/features/<feature>/` | Dashboard, bookings, calendar, housekeeping, maintenance, statistics, invoices and login screens; feature-specific dialogs |
| `src/components/common/` | Date picker, stat card and error boundaries used by screens and dialogs |
| `src/components/layout/` | Sidebar navigation |
| `src/config/` | Existing property/room definitions, colors, staff lists and PMS defaults |
| `src/data/financialBaselines.js` | Existing 2025 reference figures for statistics |
| `src/lib/` | Reusable date, occupancy, Airbnb, calendar-block, export and housekeeping calculations |
| `src/hooks/usePmsSubscriptions.js` | Authentication listener and the existing core Firestore subscriptions, including cleanup |
| `src/features/statistics/useStatistics.js` | Existing statistics calculation and memoization |
| `src/hooks/useGuestCrm.js` | Existing CRM subscriptions and actions |
| `src/services/` | Existing booking, guest, room-transfer and CRM data operations |
| `functions/` | Existing backend functions and shared CRM financial logic |

The existing CRM screen remains in `src/components/GuestCRM.jsx`, using `src/services/crmFinanceService.js` and the shared financial model in `functions/lib/crmFinance.mjs`.

Screens receive shared state and actions explicitly through props. State that previously lived in App stays there, retaining the existing persistence and reset behavior for filters, dates and selections when switching tabs. Existing dialogs stay mounted in the shell to preserve their form initialization and reset behavior.

Most screen code loads on demand through React lazy imports and Suspense. Login and the calendar load immediately; the calendar's existing parent layout effects require its timeline element to be available during mounting. CRM CSS stays eagerly imported so its order relative to Tailwind remains unchanged. No extra wrapper elements or loading messages are added to the screens.

## Preserved behavior

This refactor moves existing calculations and markup without changing booking rules, rent formulas, Airbnb prepayment assumptions, CRM payment behavior, housekeeping scheduling or room-transfer handling. It does not migrate records, rename collections, change query scope or deploy backend code. Core and CRM subscriptions retain their existing application-wide lifetimes.

Booking-date tests now import the real helpers from `src/lib/bookingDates.js`, rather than extracting snippets from App and replacing their dependencies with test stubs.

## Adding a feature

Add screens and dialogs under `src/features/<feature>/`. Keep calculations that need no React or Firebase in plain JavaScript modules, and put database operations in services or lifecycle hooks. Import shared configuration instead of duplicating room definitions or defaults. Avoid having features import App or each other's screen components.

A future Finance area can follow these boundaries within the same application. It should own its finance-specific loading and services and reference existing booking/guest IDs. New persistence, permissions, financial rules and subscription scope should be designed as separate changes with their own validation.

## Verification

Run `npm test` and `npm run build` after changes. The structural refactor was also checked with isolated fictitious data across all eight signed-in screens, login, booking and other dialogs, CRM details, weekly housekeeping, and desktop/mobile layouts. Browser comparisons included subscription counts and recorded writes; no live Firebase records were used for those checks.
