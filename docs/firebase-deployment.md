# Firebase deployment

Project: `kolab-living-pms`  
Live app: https://kolab-living-pms.web.app

Use Node.js 24 and a Firebase account with deployment access. Install frontend and functions dependencies with their respective lockfiles before deployment:

```sh
npm ci
npm ci --prefix functions
npm test
npm run build
firebase deploy --only hosting,functions --project kolab-living-pms
```

Hosting serves `dist` and rewrites application routes to `index.html`. Build before each Hosting deploy. The Firebase cache is ignored by Git.

The backend includes the chatbot, `crmAccountChanged`, `crmBookingChanged`, and `crmDailyAlerts`. The daily refresh runs at 09:00 Vietnam time. The booking and account triggers keep rent schedules and internal collection alerts synchronized. Deploy shared rent calculations in `functions/lib/crmFinance.mjs` with the functions as well as the frontend.

The chatbot includes all three properties, including Roamr's eight rooms labelled R1–R8. Persisted H1–H8 IDs are retained to keep existing bookings linked.

Firestore rules are now managed in `firestore.rules`, with indexes in `firestore.indexes.json`. The staff rollout on 3 November 2026 replaced the previous authenticated-user-wide policy with an explicit manager allowlist and a scoped staff API. See the staff rollout section below before adding accounts or changing rules.

For the first deployment of Firestore event triggers, Eventarc service identity permissions can take a few minutes to propagate. If Firebase reports that initial propagation delay, retry the affected trigger deployment after it completes.

## 2 November 2026 verification

The frontend includes Finance, the Roamr rename, CRM dated rent rates, and saved weekly housekeeping ordering. All 32 existing CRM accounts were refreshed and verified against their booking fingerprints; no accounts remained pending or failed schedule validation. For postponed arrivals, a tracked start before the revised check-in is aligned to check-in. Daily refreshes process other accounts even if one fails, then report failures for retry.

Validation: 99 tests passed, production build passed, and the Hosting entry point was checked against the built JavaScript asset. Function deployments were verified separately from Hosting.

## Staff portal rollout

The staff portal adds repository-managed Firestore rules, indexes, and an authenticated callable. For deployment and recovery, follow [Staff portal deployment order](staff-portal.md#deployment-order--required-before-live-staff-use). Existing manager accounts must be explicitly allowlisted before activating the new rules. The prior authenticated-user-wide rules are not suitable for staff access.


On 3 November 2026, `staffPortal`, the authenticated `chatbot`, staff indexes, Firestore rules, and Hosting were deployed using `--account jobundgaard19@gmail.com`. Use the explicit account argument: another locally signed-in Firebase account lacks the required deployment permissions. The approved manager list is Jonas, Van Anh, and Kolab Living only. Live manager sign-in and Staff & pay were verified; housekeeping onboarding awaits her Google email.

Final staff rollout checks: both functions ACTIVE, staffDays/staffPurchases indexes READY, rules and Hosting asset matched the local files, and unauthenticated staff API requests returned HTTP 401. Validation: 120 unit/service tests and 111 Firestore emulator permission checks passed.
