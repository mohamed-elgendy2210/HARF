# Phase 3 — Parent Dashboard and Child Profiles

## Scope

Add parent-owned child profiles and privacy controls using the existing React/Express/MongoDB stack. Preserve the existing landing page and stop before games, learning paths, or generated reports.

## Implemented

- Arabic RTL parent dashboard accessible from the existing account modal for verified, approved, active parent accounts.
- Parent can add, list, view, edit, archive, and reactivate only their own child profiles.
- Minimum child profile fields: short display name and optional broad age band. Exact date of birth, diagnosis, medical history, school, and address are not requested or stored.
- Child profiles are archived rather than hard-deleted so future independent attempt/progress/report records are not silently orphaned.
- Server-side authorization requires an authenticated, verified, approved, active `parent`. Every child record read/update and consent operation queries by both child ID and authenticated parent ID. Ownership fields are server-assigned and rejected from client payloads.
- Child-specific, append-only grant/withdraw consent history for learning data and progress reports. Unrecorded consent is treated as not granted. The UI lets parents review current state and grant or withdraw consent.
- Mongoose models and explicit indexes for child profiles and consent history. The database schema documents owner-scoped designs for future independent game attempts, learning progress, and parent-visible reports. Those future data APIs are not implemented.
- Updated requirements, architecture, database-schema, README, security, and phase completion records.

## Verification

- Environment: Node.js `v24.18.0`, npm `12.0.2`.
- `npm test` — **22 passed, 0 failed**. Includes HTTP-level ownership checks for family isolation, child read/update/consent, pending/specialist/visitor denial, forged owner/policy fields, CSRF, archive/reactivate, and unavailable-database behavior.
- `npm run build` — **passed**; Vite production build includes the new dashboard component.
- `npm audit` — **0 vulnerabilities reported**.
- Browser smoke check used a mocked approved-parent session and confirmed the account modal navigates into the dashboard and renders the add-child form. The mocked form submission did not complete in the browser harness; create/update/consent flows are verified through API tests instead.
- Child API integration tests use an in-memory repository to verify parent isolation and request validation. A real MongoDB service is unavailable in this environment, so production index creation and live MongoDB behavior remain unverified.
- SMTP is not needed for the child APIs but was not configured; account email workflows remain unverified against a real provider.

## Remaining work and privacy decisions

- Connect a test MongoDB instance and verify index creation, child persistence, consent history, and restoration behavior.
- Review the actual consent language/policy and applicable child-data jurisdiction before collection. `harf-child-data-v1` is only a schema marker, not a legal policy version.
- Approve a retention, deletion, export, and account-closure process before using real child information. Phase 3 only archives profiles.
- Future game, progress, and report endpoints must preserve parent+child scoping and honor the current consent state. No diagnosis or medical inference is implemented.
- Specialist/administrator child-record access remains intentionally unavailable; any future exception requires a specific authorization design and audit policy.

## Phase boundary

Phase 3 is complete for parent-child profiles and consent controls. Stop here; do not begin Phase 4 until the user approves it.
