# Harf (حرف)

Arabic-first learning platform for children's interactive language and communication practice.

## Project status

The React landing page was implemented from `Branding/Landing page.png` and `Branding/Colors with logo.png`; no prior page source existed in the workspace, so no existing source implementation is claimed as preserved. Phase 2 adds authentication and account approval. Phase 3 adds child profiles and consent records; the protected parent dashboard is a separate page at `/dashboard`. The role-protected admin dashboard is at `/admin` and provides account review, a game/media library, a learning-path editor, subscription pricing/payment review, aggregate reports with CSV export, appointment monitoring, and independent video-service tests. Phase 4 adds an interactive trial game and a reusable player for five built-in games, including image matching and animal-sound recognition; Phase 5 adds administrator-managed game drafts, immutable published versions, trial selection, per-question media mapping, and safely stored media uploads. Phase 13 adds the reusable **فين المكان؟** spatial-relationships scene editor and drag/touch player with server-validated placements, Arabic instructions, graduated hints, and parent-visible educational progress; see [spatial game authoring and validation](./docs/spatial-relationships-game.md). Audio and images use API-origin-aware URLs, explicit playback/error states, and byte-range responses. Phase 6 adds active-subscription enforcement for parent games and configurable child-specific learning paths with transparent educational suggestions. Phase 7 adds dynamic monthly pricing, manual Vodafone Cash/InstaPay requests, private receipt uploads and administrator review, and historical subscription/payment records. Phase 8 adds specialist-owned availability schedules, optional child-linked appointment requests, concurrency-safe slot reservations, specialist decisions, 48-hour request expiry, and appointment history. Phase 9 adds confirmed-appointment session lifecycle tracking, specialist-only private notes, and parent-visible educational reports gated by consent. Phase 10 adds aggregate admin reports/CSV export and recipient-scoped in-app/email notifications. Phase 11 integrates Jitsi's IFrame API with appointment-linked rooms, authenticated join authorization, server-enforced time windows, and parent/specialist dashboard controls. Phase 12 adds admin-only appointment/meeting health monitoring and persistent, independent Jitsi tests. The default public Jitsi service does not guarantee participant-only access; a reviewed authenticated/self-hosted deployment is required for stronger privacy. Automated payment verification, appointment payment collection, cancellation/rescheduling, and generated game progress reports remain unimplemented.

The Arabic typography system uses Alexandria for headings and Tajawal for body and interface text. Both are loaded with `display=swap`, Arabic subset selection, and local system fallbacks.

## Requirements and architecture

- [Master project requirements](./HARF_MASTER_PROMPT.md)
- [Product requirements](./docs/requirements.md)
- [Architecture](./docs/architecture.md)
- [Phase 0 findings](./docs/phase-0-findings.md)
- [Phase 1 completion and remaining work](./docs/phase-1-completion.md)
- [Phase 2 completion and remaining work](./docs/phase-2-completion.md)
- [Phase 3 completion and remaining work](./docs/phase-3-completion.md)
- [Phase 4 game framework completion and remaining work](./docs/phase-4-completion.md)
- [Phase 5 game library and media management completion and remaining work](./docs/phase-5-completion.md)
- [Phase 6 learning paths and subscription enforcement completion and remaining work](./docs/phase-6-completion.md)
- [Phase 7 monthly subscriptions and manual payments completion and remaining work](./docs/phase-7-completion.md)
- [Phase 8 specialist appointments completion and remaining work](./docs/phase-8-completion.md)
- [Phase 9 consultation sessions, reports, and video-provider scaffold](./docs/phase-9-completion.md)
- [Phase 10 administrator reports and notifications](./docs/phase-10-completion.md)
- [Phase 11 live Jitsi sessions](./docs/phase-11-live-video-sessions.md)
- [Phase 12 admin sessions and video tests](./docs/phase-12-admin-sessions.md)
- [Spatial relationships game](./docs/spatial-relationships-game.md)
- [Parent dashboard implementation and remaining work](./docs/parent-dashboard-completion.md)
- [Security controls and open risks](./docs/security.md)
- [Account database schema](./docs/database-schema.md)
- [Deployment notes](./docs/deployment.md)
- [Arabic platform and troubleshooting guide](./docs/platform-guide-ar.md)

## Prerequisites

- Node.js 22.12 or later and npm 10 or later.
- MongoDB 5.2 or later for `$topN` aggregation used by learning-path progress; required for authentication and learning features.
- MongoDB is optional for viewing the public landing page, but required for authentication, the specialist directory, parent-child profiles, and a ready API. Data APIs return 503 when MongoDB is unavailable.
- SMTP configuration is required to send verification and password-recovery email. Production startup requires SMTP host/from settings.

## Local setup

From the project root:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

The React/Vite development server uses the host and port in `APP_ORIGIN` (by default `http://localhost:5173`) and fails clearly if that port is occupied instead of silently choosing a CORS-disallowed origin. The API listens on `http://127.0.0.1:4000`. Vite forwards `/api` requests to the configured `VITE_DEV_API_TARGET`, so the browser can use same-origin relative API paths. Set `MONGODB_URI=mongodb://127.0.0.1:27017/harf` when MongoDB is running locally; otherwise leave it empty. Development startup continues without a database, but account routes report a clear 503 and readiness reports disconnected.

Use only synthetic accounts and test data over local HTTP. Do not submit real passwords, child information, payment evidence, or consultation data over unencrypted HTTP.

Set the SMTP fields in the untracked `.env` to a test mail provider before trying registration or account recovery. No credentials are included in `.env.example`. In development without SMTP, registration clearly reports that email delivery is unavailable. To create the first administrator, run `npm run admin:create --workspace @harf/api` from an interactive terminal after configuring MongoDB; the command prompts for an un-echoed password and refuses to run if an administrator already exists. Additional administrator accounts can only be created or removed by a signed-in administrator through the protected dashboard; there is no public admin-registration route.

For local HTTPS browser testing, set `APP_ORIGIN` and `CLIENT_ORIGINS` to the exact HTTPS origin (for example `https://localhost:5173`) and set both `VITE_HTTPS_KEY_FILE` and `VITE_HTTPS_CERT_FILE` in the untracked `.env` to paths for a locally trusted certificate/key pair. Vite reads those files only in serve mode. Never commit private keys. Leave the certificates unset and use an HTTP `APP_ORIGIN` for ordinary local development.

To verify the application:

```powershell
npm test
npm run build
```

Check API liveness at `http://127.0.0.1:4000/api/v1/health/live` and database readiness at `http://127.0.0.1:4000/api/v1/health/ready`.

## Environment configuration

`.env.example` contains local development values only and no credentials. `.env` is ignored by Git. Configure `APP_ORIGIN` and `CLIENT_ORIGINS` to exact origins; do not use wildcard CORS when credentials are enabled.

For a separately hosted frontend/API, set `VITE_API_BASE_URL` to the API origin at frontend build time and add the exact frontend origin to backend `CLIENT_ORIGINS`. The frontend rejects an HTTP API URL if it is loaded over HTTPS. See [deployment notes](./docs/deployment.md) before HTTPS testing or production.

The API defaults to `JITSI_DOMAIN=meet.jit.si` and configurable parent/specialist early-join and post-appointment grace windows. Admin test rooms default to a 30-minute application lifetime, configurable with `VIDEO_TEST_LIFETIME_MINUTES` (5–60). These values are server-side; the authorized video-access response supplies the configured Jitsi hostname and opaque room name to the IFrame API. Review the public-server limitation and production CSP requirements in [Phase 11 documentation](./docs/phase-11-live-video-sessions.md) and [Phase 12 documentation](./docs/phase-12-admin-sessions.md) before deployment.

## Project structure

```text
apps/
  api/
    src/
      config/       Environment, cookies, SMTP settings
      db/           Mongo connection and account repository
      models/       User, session, auth token, audit event, child, consent, game answer receipts/attempts, subscriptions, appointments, learning paths, game library, media
      middleware/   Authentication, authorization, errors, validation
      routes/       Auth, admin, directory, parent children, specialist, appointments, games, and media APIs
      services/     Auth lifecycle, parent/child management, subscription entitlements, appointments, learning paths, game library, media, attempts, email
      scripts/      Initial administrator provisioning
    test/
  web/
    src/
      components/   Reusable visual components
      lib/          Configurable API client
      App.jsx       Arabic RTL landing page
      styles.css    Responsive Harf visual identity
    index.html
    vite.config.js
Branding/           Supplied logo/brand board and landing-page reference
docs/               Requirements, architecture, and phase records
```

## Current API capabilities

- `GET /api/v1/health/live` reports API liveness without exposing environment details.
- `GET /api/v1/health/ready` returns 503 until MongoDB is connected.
- `/dashboard` is a separate frontend route. It displays family data only to a verified, active, approved parent; protected child APIs independently enforce the same backend authorization and owner scoping.
- `/admin` is a separate frontend route for active, email-verified administrators. Its account, administrator-user, content, learning-path, pricing, and payment-review tools call APIs that enforce administrator authorization, CSRF, account-state rules, and audit records server-side. The account endpoint returns at most 100 records; pagination is not yet implemented.
- `POST /api/v1/auth/register`, `/login`, `/logout`, `/email/verify`, `/email/resend`, `/password/forgot`, and `/password/reset` implement account lifecycle and recovery.
- `GET /api/v1/auth/session` and `/me` expose only the authenticated user's account state.
- `PATCH /api/v1/auth/specialist/profile` edits only the authenticated specialist's professional profile.
- `/api/v1/admin/accounts` supports administrator review, approval/rejection, suspension/reactivation, and removal of pending parent/specialist registration requests. Removal is server-restricted to pending accounts.
- `/api/v1/admin/games` and `/api/v1/admin/assets` provide administrator-only draft, publication, four-game public-trial selection, and media workflows. `/api/v1/admin/administrators` lists and creates administrator accounts; `DELETE /api/v1/admin/administrators/:accountId` removes another administrator, never the active or final administrator. `/api/v1/media/:assetId` serves only active assets referenced by a published game; administrator previews use a separate protected route.
- `/api/v1/admin/learning-path` remains available for legacy default-path compatibility. `/api/v1/admin/learning-paths` manages multiple paths, `/api/v1/admin/learning-questionnaire` publishes versioned parent questionnaires, and `/api/v1/admin/learning-assignments` supports assignment review.
- `GET /api/v1/children/:childId/learning-questionnaire` returns the active questionnaire version. `POST /api/v1/children/:childId/learning-recommendations` validates parent answers and returns server-calculated explanations; `POST /api/v1/children/:childId/learning-path-assignments` stores the response and assigns only recommendations the parent confirms. `GET /api/v1/children/:childId/learning-progress` returns actual progress for confirmed paths with active subscription and current learning-data consent.
- `/api/v1/admin/reports` and `/api/v1/admin/reports/export.csv` provide date-filtered aggregate reports and CSV downloads. They omit child identifiers and distinguish requested/submitted/rejected payment amounts from administrator-confirmed payments.
- `/api/v1/notifications` provides authenticated, recipient-scoped inbox and read-state operations. SMTP notifications are optional; delivery failures do not undo saved in-app notifications.
- `GET /api/v1/payments/plan` returns the configured monthly price and enabled manual payment instructions for the landing page. If no price has been configured, it explicitly reports that the plan is not configured.
- `GET /api/v1/directory/specialists` lists only active, verified, approved specialists who have complete profiles and opted into public listing. `GET /api/v1/directory/specialists/:specialistId/availability?from=...&days=...` returns their offered appointment slots and booking-time terms.
- `POST /api/v1/appointments/:appointmentId/session/start` and `/session/complete` let only the assigned specialist record execution timestamps, private notes, and a separate parent-visible educational report. Parent appointment responses omit private notes.
- `POST /api/v1/appointments/:appointmentId/video-access` rechecks confirmed-appointment participant ownership on every call. It fails closed with `503 VIDEO_PROVIDER_NOT_CONFIGURED`; no video provider is selected/configured and no credentials are issued.
- `GET/PUT /api/v1/specialist/availability` lets an approved specialist read or update their own time zone, price/duration, weekly windows, and date-specific exceptions.
- `POST /api/v1/appointments` creates an optional appointment request for an active child owned by the authenticated parent. `GET /api/v1/appointments` and `GET /api/v1/appointments/:appointmentId` return only the parent's or assigned specialist's records. `POST /api/v1/appointments/:appointmentId/decision` allows only the assigned specialist to accept/reject a pending request.
- Pending appointments expire after 48 hours and release their slot. A unique MongoDB reservation index prevents overlapping bookings, including concurrent submissions. Appointment booking is independent of subscription access.
- `GET/PUT /api/v1/admin/subscription/settings` lets administrators configure the monthly EGP price and Vodafone Cash/InstaPay recipient instructions and enabled state. `GET /api/v1/admin/payments` lists payment requests for review.
- `POST /api/v1/payments` creates a parent-owned manual payment request with a transaction reference and optional private receipt. `GET /api/v1/payments` returns that parent's payment history; the parent and admin receipt routes enforce ownership/admin authorization.
- `POST /api/v1/admin/payments/:paymentId/review` approves or rejects a request. Approval creates or renews a calendar-month subscription; receipt upload alone never enables paid access. `GET /api/v1/auth/subscription` returns the parent's current/most recent period, subscription history, and payment history.
- `/api/v1/games/:gameId` and answer/attempt endpoints restrict non-trial activities to active subscriptions and current learning-data consent; parent answers require a child profile ID. Learning paths guide progression without limiting subscribed parents to only assigned games. The public trial remains unauthenticated and is never persisted.
- `GET /api/v1/directory/specialists` returns only verified, approved, active specialists with complete profiles and explicit public-listing opt-in.
- `/api/v1/children` supports parent-owned profile list/create; `/api/v1/children/:childId` supports scoped read/update and archive/reactivate. `/consents` routes record and read child-specific consent history.
- Child APIs require an authenticated, verified, approved parent. The server scopes each record operation by both child ID and session owner; parents cannot change ownership through request bodies.
- Child profiles store only a short display name and optional broad age band. No exact birth date or health information is requested. Archived profiles remain stored; hard deletion and retention policy are not yet implemented.
- The dashboard uses a fixed, enum-validated animal avatar; it does not accept image uploads. It displays child-scoped game attempts with pagination when present, learning paths, consented appointment-linked specialist reports, and the authenticated parent's own notifications. Generated game-progress reports remain unavailable.
- `GET /api/v1/children/:childId/game-attempts?page=1&limit=10&gameId=...` returns paginated history scoped to the authenticated parent and child. `GET /api/v1/games` lists published game metadata; game content and answers for parent activities require an active subscription, child ownership, and current learning-data consent. `POST /api/v1/games/:gameId/attempts` stores an aggregate result for a consented, owned child. Trial answers/results are not persisted.
- The game library supports multiple-choice, matching-pairs, and audio-choice templates. Per-question images/audio, feedback, and difficulty are administrator-mapped and validated before publication; visual games require verified image mappings and audio-choice games also require a verified sound. The admin asset library supports image metadata/alt text, category/tag search, usage lookup, preview, activation, and safe replacement; replacing an asset creates a new record for draft references while immutable published versions keep their historical asset. Images, audio, animation, and MP4 content are signature-checked, size-bounded, stored outside the app tree, and served with `nosniff`, restrictive CSP, and byte-range support. The responsive child game environment places the seven official mascot expressions prominently beside the activity, transitions between states/questions, and respects reduced-motion preferences. Result clips use the supplied `Branding/Character/Videos/Winnig.mp4` and `Loose.mp4` assets as borderless, organically cropped character animations: playback starts muted automatically, with separate sound/replay actions and static-expression fallbacks. The 80% success threshold is based on authoritative answer/attempt results. Audio controls and media placeholders remain accessible; JSON Lottie files are validated and managed but are not rendered by the current game player.
- Current account/admin mutations enforce exact Origin, session CSRF token, request schemas, and server-side role/account-state checks. Auth endpoints have in-memory rate limits.
- Passwords are hashed with Node scrypt; opaque session and one-time token values are stored only as hashes. Sensitive account actions are audited.
- Express JSON parsing is bounded; Helmet, redacted Pino request logs, safe centralized errors, and production HTTPS enforcement are configured.
- Production index creation is explicit. MongoDB and SMTP must be configured for real account flows.

Run `npm test`, `npm run build`, and `npm audit` to check the current implementation. See [Phase 10 completion](./docs/phase-10-completion.md), [Phase 9 completion](./docs/phase-9-completion.md), [Phase 8 completion](./docs/phase-8-completion.md), [Phase 7 completion](./docs/phase-7-completion.md), [Phase 6 completion](./docs/phase-6-completion.md), [parent dashboard completion](./docs/parent-dashboard-completion.md), [database schema](./docs/database-schema.md), and [security notes](./docs/security.md) for verified boundaries and unresolved risks.
