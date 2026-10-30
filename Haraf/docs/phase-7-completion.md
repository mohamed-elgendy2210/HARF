# Phase 7 — Monthly Subscriptions and Manual Payments

## Status

Implemented in the existing React/Vite, Express, and MongoDB/Mongoose architecture. This phase implements manual payment requests and administrator review only; it does not integrate with a bank, wallet, or payment gateway.

## Implemented

- Added administrator settings for one monthly EGP price and enabled/disabled Vodafone Cash and InstaPay methods, including recipient details and instructions.
- The public landing page fetches the configured monthly price. It does not show a fabricated default price when no configuration exists or when the request fails.
- Parents can create one open payment request at a time, provide a transfer reference, optionally attach a receipt, and see their payment and subscription histories.
- Payment requests capture the amount, currency, selected method, and instructions at submission. Updating settings cannot change historical requests or subscription periods.
- Administrators can review payment requests and their protected receipt, confirm that the transfer was manually checked, then approve or reject with an optional note. The approval operation creates a one-calendar-month entitlement; renewal extends from an unexpired subscription. Rejection does not grant access.
- Receipt uploads accept signature-checked PNG, JPEG, WebP, or PDF files up to 5 MiB. Files use generated names in private storage outside the application tree. Receipt reads require the request-owning parent or an authenticated administrator.
- Payment request uploads are limited to 10 attempts per IP per 15-minute window before multipart parsing.
- Subscription entitlements remain enforced by the backend on paid game and learning-path access. The public trial remains free and unauthenticated. Existing children and historical attempts are not deleted when access expires.
- Administrator settings, payment request submission, review decisions, and subscription access changes are represented in the existing audit log without recording receipt contents.
- The parent dashboard now includes payment submission/history. The admin dashboard includes method/price settings, request history, secure receipt access, and approve/reject controls.

## API and database changes

New collections:

- `subscriptionSettings`: singleton monthly price, enabled methods, recipient/instruction configuration, and updater.
- `paymentRequests`: owner-scoped manual payment requests, immutable price/instruction snapshots, private receipt metadata, request state, and admin review metadata.

Extended collection:

- `subscriptions`: retains access periods and adds optional payment request reference, amount, currency, method, and transaction reference snapshots.

Key indexes include the singleton settings key, one-open-request-per-parent partial unique index, parent/payment history indexes, review status index, and unique sparse payment-request linkage to a subscription.

Routes:

- `GET /api/v1/payments/plan`
- `POST /api/v1/payments`
- `GET /api/v1/payments`
- `GET /api/v1/payments/:paymentId/receipt`
- `GET /api/v1/admin/subscription/settings`
- `PUT /api/v1/admin/subscription/settings`
- `GET /api/v1/admin/payments`
- `POST /api/v1/admin/payments/:paymentId/review`
- `GET /api/v1/admin/payments/:paymentId/receipt`
- `GET /api/v1/auth/subscription` now includes current/most-recent status, subscription history, and payment history.

## Verification performed

- `npm test` — passed: 25 API tests, 0 failures. The payment scenario checks dynamic plan configuration, role boundaries, settings validation, receipt upload and owner/admin receipt access, no subscription before review, immutable price snapshots, approval/rejection, renewal extension, and subscription-gated access.
- `npm run build` — passed. Vite reports the existing main JavaScript chunk exceeds 500 kB after minification.
- No live MongoDB-backed Phase 7 index/persistence/recovery test or browser end-to-end payment test was run. API tests use in-memory repositories for payment scenarios.

## Unresolved policies and operational risks

- Vodafone Cash/InstaPay transfers are not automatically verified. An administrator must verify each transfer outside Harf; a receipt is evidence only and never activates access by itself.
- Cancellation, refunds, failed/duplicate transfer handling, pending-request expiry, reminders, auto-renewal, proration, and grace periods are not implemented or specified. The current approval issues a one-calendar-month period and an approved later request extends from the unexpired period.
- Review creation/finalization is idempotency-aware through a unique payment-to-subscription link and a recoverable review claim, but it does not use a MongoDB transaction. A database failure can leave a created subscription while the payment request is still in review; retry can discover and finalize that subscription. This recovery path needs integration testing against the production MongoDB topology.
- Receipt storage is local filesystem storage. Define retention/deletion, access, backup/restore, capacity, and cross-node storage policies before production use.
- Payment history endpoints are bounded (parents: 50; administrators: 100); pagination for older records is not yet available.
- This phase did not implement the specialist appointment features delivered in Phase 8; appointment charges remain uncollected and separate from subscriptions.

Phase 7 stops here.
