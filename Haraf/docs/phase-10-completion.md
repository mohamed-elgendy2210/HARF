# Phase 10 — Administrator Reports and Notifications

## Delivered

- Added administrator-only, date-filterable reports for registrations and approval states, specialist categories, completed game attempts, aggregate learning-path completion, subscription periods, manual-payment request states, appointments/session statuses, and audit-event counts.
- Reports and CSV exports are protected by the administrator router's authenticated, verified, approved, role, and CSRF middleware. Date ranges accept ISO timestamps and are capped at 366 days.
- Learning-path reporting returns aggregate counts only; reports and exports contain no child IDs, names, parent IDs, or consultation content.
- Payment reporting separates all requested amounts, pending/reviewing submissions, administrator-approved amounts, and rejected amounts. Confirmed amounts are derived only from approved manual-payment requests; an uploaded receipt is not revenue.
- Added recipient-scoped in-app notification storage and APIs for account approval/rejection, new manual-payment review requests and decisions, appointment requests and decisions, and completed sessions.
- Parents, specialists, and administrators can review and mark their own notifications as read. Recipient IDs are never accepted from the client, notification reads and updates are scoped to the current session, and API responses omit the recipient user ID.
- When SMTP is configured, notification email is sent with generic event content. Email delivery failures are logged and do not roll back a completed business action or the saved in-app notification. Messages do not include child names, receipts, private notes, or report text.
- Added an Arabic RTL reporting view with date filters, aggregate metric cards, status tables, and CSV export, plus a shared notification center on parent, specialist, and administrator dashboards.

## Data and endpoints

- `notifications` records contain recipient, allow-listed event type, generic title/message, resource kind/ID, read timestamp, and creation timestamp. Recipient/time and unread indexes are created explicitly during API startup.
- `GET /api/v1/admin/reports?from=...&to=...` returns administrator aggregate reports.
- `GET /api/v1/admin/reports/export.csv?from=...&to=...` returns a UTF-8 CSV download with private/no-store caching.
- `GET /api/v1/notifications`, `POST /api/v1/notifications/read-all`, and `POST /api/v1/notifications/:notificationId/read` operate only on the current approved account's notifications.

## Verification

- `npm test` — passed; includes admin-only report/export authorization, date-range bounds, payment total distinctions, notification recipient isolation, read state, response minimization, and optional email failure behavior.
- `npm run build` — passed. Vite retains the existing warning that the main JavaScript chunk exceeds 500 kB.

## Remaining work and boundaries

- Reports are administrator-only; parents continue to see their own child progress and consented appointment reports through existing parent APIs. This phase does not add generated or diagnosis-like child reports.
- Account dashboard listing still has its existing maximum of 100 accounts; reports themselves aggregate the entire selected date range. No operational report pagination was necessary for aggregate output.
- Email is best-effort SMTP delivery, not a queued/retried delivery system. Configure and monitor SMTP before relying on delivery.
- Audit-event retention/access policies, legal child-consent language, and deployment-specific data-retention decisions remain unresolved.
- Appointment fees remain outside subscription/payment reporting because appointment payment collection is not implemented. Cancellation, lateness, no-show, and refund policies remain unresolved.
- Video remains disabled because a provider is not selected/configured. Phase 11 has not started.
