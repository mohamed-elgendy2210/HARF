# Harf Architecture

## Document status and evidence boundary

This document records the Phase 0 initial inventory and implemented Phase 1–9 application foundation, account/family features, games, administrator game/media library, subscriptions, learning paths, specialist appointments, session tracking, and educational reports. It is not a description of a deployed production system.

- At Phase 0, the workspace contained only the two branding PNG assets and Phase 0 documents. The Phase 1 React/Express/Mongoose foundation described below has since been added.
- `HARF_MASTER_PROMPT.md` was absent during Phase 0 and is now created from the approved requirements supplied in the user request.
- No production deployment or live MongoDB service is configured by this repository.

## Phase 0 baseline

```text
Haraf/
└── Branding/
    ├── Colors with logo.png
    └── Landing page.png
```

These are design references, not executable application screens.

## Current project structure

```text
Haraf/
├── apps/
│   ├── api/       Express API, account/family services/models/routes, MongoDB connection, middleware, tests
│   └── web/       React/Vite Arabic RTL landing page and reusable components
├── Branding/      Supplied brand board and landing-page reference
├── docs/          Requirements, architecture, phase findings/completion, deployment
├── .env.example
├── HARF_MASTER_PROMPT.md
└── package.json   npm workspace root
```

| Area | Verified implementation / boundary |
|---|---|
| Frontend | React 19 + Vite 7; RTL public landing page and separate `/dashboard` parent, `/specialist` specialist, and `/admin` administrator routes, reusable brand/components, responsive CSS. No original page source existed to preserve. |
| Client assets | Brand image served from the existing `Branding` directory via Vite public assets; no asset was overwritten. |
| API | Express 5, REST prefix `/api/v1`; liveness/readiness, account authentication, admin account and game/media routes, public specialist directory/availability, parent-child/consent routes, appointment/specialist APIs, dynamic game catalog/attempt APIs, and protected/public media serving. |
| Account domain | Auth service separates account lifecycle from Express routes; Mongoose repository, strict schemas, scrypt password hashing, purpose-bound email tokens, opaque hashed session tokens, and explicit audit records. |
| Validation/errors/logging/security headers | Strict Zod request schemas; centralized safe JSON errors; Pino/Pino HTTP excludes query strings and redacts sensitive fields; Helmet; bounded JSON bodies. |
| MongoDB | Mongoose 8 models/indexes for users, sessions, auth tokens, audit events, child profiles/consent history, game attempts, subscriptions/payments, specialist availability/appointments, multiple learning paths, versioned questionnaires, parent/child assignment and response history, game definitions/versions/settings, and media metadata. Production disables automatic indexing and explicitly creates all indexes at startup. Data routes return 503 while MongoDB is unavailable. |
| CORS and origins | Exact configured origins; `APP_ORIGIN`, `CLIENT_ORIGINS`, `VITE_API_BASE_URL`, and `VITE_DEV_API_TARGET`. |
| HTTP/HTTPS | HTTP permitted in development. Vite supports an optional local certificate/key pair for HTTPS testing. Production non-health API requests reject unrecognized HTTP without redirect; production origins must use HTTPS; trust proxy defaults false and is configurable. |
| Authentication/authorization | Parent/specialist signup, login/logout, email verification/resend, password recovery, session lookup, specialist profile editing, administrator bootstrap and account approval/suspension are implemented. Admin routes enforce role/approval/email checks server-side. |
| Frontend account surfaces | Branded account modal supports login, signup, verification status, password recovery, and specialist profile. The dedicated `/admin` page provides a real-data overview and account-management interface. Approved specialists with complete opted-in profiles appear in the public directory. |
| Parent dashboard | A standalone `/dashboard` frontend route for verified, approved, active parents. Parents can create, list, view, edit, archive, and reactivate their own child profiles; use a fixed animal avatar; manage learning/report consent; complete a configurable questionnaire, preview and confirm multiple explainable learning-path recommendations, and review actual child-scoped progress per assigned path; inspect subscription status; follow educational suggestions; browse specialists; request a child-owned appointment; inspect appointment history; view consented appointment reports; and review recipient-scoped notifications. Appointment booking is not required for games. Generated game progress reports remain unavailable. |
| Specialist dashboard | A standalone `/specialist` route for approved specialists. It manages weekly availability, time zone, appointment price/duration, date-specific exceptions, professional listing details, pending decisions, session start/completion, private notes, and parent-visible educational reports. Specialist access to a child's data is limited to appointments requested with that specialist. |
| Administrator dashboard | A standalone `/admin` page for email-verified, active administrator accounts. It reviews parent/specialist accounts, creates and removes additional administrators, manages multiple-choice, matching-pairs, and audio-choice game drafts and media assets, selects four published games for public trials, creates and publishes multiple learning paths, versions the questionnaire and its skill mappings, reviews/pause/reactivates/removes path assignments, configures monthly subscription/payment instructions, reviews manual payment requests, and provides date-filtered aggregate reports and CSV export. Account summaries are based on the maximum 100 records returned by the existing account endpoint. Appointment schedules/decisions remain specialist-managed. |
| Reporting and notifications | Admin reports aggregate registration/approval, specialist categories, game use, learning completion, subscription periods, manual-payment states, appointment/session states, and audit events. Payment requested, pending/reviewing, administrator-approved, and rejected totals are separate. Learning reports omit child identifiers. Parent, specialist, and admin notification inboxes are recipient-scoped; optional SMTP delivery is generic and best-effort. |
| Game/media administration | The game library assigns supported image/audio/GIF/Lottie/MP4 assets to allow-listed events and per-question prompt/answer media. Audio-choice questions require an assigned audio file and image per option; matching-pairs questions require prompt and option images before publication. The admin library edits image alt text/category/tags, searches and filters assets, previews dimensions/type/size, lists draft and version usage, and replaces assets using new IDs so draft references move while immutable published history retains its original references. Drafts are validated, immutable versions are retained on publish, and deletion is blocked while any draft or published version references the file. Stored files are signature-checked again when read; media responses support byte ranges. Only administrators can call media-management APIs. |
| Child gameplay world | The existing parent-launched game route preserves the selected child ID and authorization context and provides an RTL full-page illustrated environment, large official mascot expressions, responsive activity/mascot composition, reduced-motion-aware transitions, audio mute control, visual answer cards, keyboard/click and drag matching, and missing-image placeholders. Result clips autoplay muted without native controls, with separate sound/replay actions and same-scale static-expression fallbacks. They use server-validated attempt counts (or verified answer responses for the public trial) and the existing rounded-percent rule with success at 80%; navigation returns to the selected child's dashboard context. |
| Subscription entitlement | Each subscription record is time-bounded and retained. A parent has protected access only when `startsAt <= now < expiresAt`. Administrators can grant eligible approved accounts access through an audited route or approve a manually reviewed payment request; payment verification is not automated. |
| Learning paths | Multiple stable-key administrator-configurable paths store lifecycle status, age/skill criteria, questionnaire matching rules, ordered published game activities, and bounded minimum-attempt/sample-size/accuracy rules. A versioned questionnaire maps explicit option IDs to skills; the server computes and explains eligible recommendations, and parents must confirm before assignment. Responses and assignment/review history are retained separately from per-path completion milestones. Parents' progress APIs require active subscription, active owned child, and current learning-data consent. |
| Parent learning experience | Progress view presents actual attempt counts/accuracy when available, all confirmed path sequences, transparent recommendation reasons, repeat-activity links, and explicit consent/subscription errors. New children receive no default path assignment. It does not show fabricated charts or medical diagnoses. |
| Administrator learning experience | `/admin` manages multiple paths, their activity order, eligibility/matching rules, progression thresholds, questionnaire versions/option-skill mappings, and assignment review. Only currently published, non-trial games can be added; published paths containing a newly selected trial game must retain at least one other activity. |
| Appointment domain | Approved specialists publish weekly windows and date overrides. Booking requests snapshot the specialist's price, duration, and time zone; unique quarter-hour reservation keys prevent overlapping concurrent reservations. Pending requests expire after 48 hours and release their slot. Confirmed sessions track status and execution timestamps; specialists store private notes separately from parent reports gated by current report consent. Jitsi rooms are stored on appointments with unique opaque IDs; the API authorizes parent/specialist access and enforces configurable join windows. Appointment payment, cancellation/lateness/no-show policies remain out of scope. |
| Video integration | A backend `VideoProviderService` defines an adapter boundary and validates HTTPS room URLs and participant credentials expiring within five minutes. No provider has been selected or configured. Room-access API requests still authenticate the parent/specialist, load the appointment scoped to that user, and require confirmed status; otherwise provider calls fail closed. No token is issued until a provider adapter and credentials are configured. |
| Child-data isolation | Every child item/consent lookup requires both the child ID and authenticated parent ID. Appointment child access is limited to the owning parent and the specialist assigned to that appointment; visitors, other families, administrators, and unrelated specialists receive no appointment child data. |
| Version control | Workspace has no Git metadata; no baseline/commit history is available. |

## Product architecture requirements

The following logical boundaries keep the product's domains separate. Implemented behavior and future gaps are called out below.

### Logical boundaries

The requested product would need clearly separated responsibilities for:

1. **Arabic-first web client** — preserve the supplied landing-page design; support responsive RTL content, public directory and free-trial access, parent/specialist/admin experiences, and accessible game interactions.
2. **REST API** — authenticate callers, validate requests, enforce role and object-level authorization on every protected operation, and coordinate domain services.
3. **Identity and approval** — secure account lifecycle, email verification and recovery, administrator approval for parents and specialists, and session/cookie controls.
4. **Learning and game content** — published game catalog, reusable interaction templates, attempts/outcomes, and transparent configurable activity recommendations without diagnosis.
5. **Subscription and manual payment** — administrator-managed price/instructions, payment evidence review, authorized confirmation, subscription status/expiry, and historical records; separate from appointment charges.
6. **Appointments and consultations** — specialist availability, concurrency-safe slot reservation, acceptance/rejection, 48-hour pending expiry with slot release, and participant-restricted consultation access.
7. **Media handling** — administrator-managed images/audio/approved animation files with validation, size/type limits, safe storage, and no execution of uploaded code.
8. **Persistence and operations** — database models, indexes, consistency rules, audit events, privacy/consent and retention controls, safe logs/errors, backups, and deployment configuration.

### Implemented account, family, game-library, subscription, learning, and appointment data

The account, child profile/consent, subscription/payment, game attempt, learning-path, progress, specialist availability, appointment, game library and media collections, indexes, and consistency rules are documented in `docs/database-schema.md`. Remaining dependent data design includes:

- Generated per-child game-progress reports derived from learning records (appointment-linked specialist reports are implemented separately).
- Consultation authorization/metadata, without unnecessary recording of sensitive content.
- Notifications and security-sensitive audit events.

Critical invariants include: parents can only address their own authorized children; specialists can only access authorized records; receipt upload never activates a subscription; administrator approval is required for manual-payment confirmation; subscription and appointment charges remain separate; historical subscription records are retained; appointment slot booking is concurrency-safe; and an expired pending appointment releases its slot.

The dynamic game catalog, existing React game player, administrator content management, immutable published versions, public anonymous trial, subscription entitlements, and configurable educational learning paths are implemented. The `spatial-relationships` template adds a responsive scene editor/player with real pointer-based object movement, server-validated relationships, Arabic instruction/audio, progressive assistance, and owner-scoped progress fields on existing game attempts. The child player imports the seven expression images from `Branding/Character` and uses `Winnig.mp4`/`Loose.mp4` for result feedback; the source spelling `Winnig.mp4` is intentional. Trial answers are not persisted. Authenticated parent attempts require current learning-data consent and are displayed as educational activity results, not diagnoses. Learning recommendations remain educational suggestions rather than diagnoses; generated game-progress reports remain future work. Appointment-linked reports use the session completion workflow and require current report consent. Uploaded Lottie JSON is validated and assigned but is not rendered by the current player; the companion fallback is used instead.

Media bytes live outside the application tree under `MEDIA_STORAGE_DIR` (default: a sibling `harf-media` directory). MongoDB stores opaque UUID filenames and metadata, including image dimensions, alt text, categories and tags. The server verifies detected content type and per-kind size limits, checks image dimensions, and validates Lottie JSON as a bounded structure without expressions or external references. Public delivery requires an active asset referenced by a published game version; historical versions for currently published games remain eligible. Replacing an asset allocates new storage and metadata, repoints draft references only, and keeps any still-referenced historical file. Deactivation and missing files remove assets from the playable payload, where the UI shows explicit placeholders. Backups must coordinate metadata and media files; storage durability and permissions remain deployment responsibilities.

### Security and deployment boundaries

- Authorization belongs on the server for each protected route and object, not solely in UI logic.
- Authenticated state uses an opaque random HttpOnly session cookie; only its SHA-256 digest is stored. State-changing authenticated requests require a session CSRF token and a configured exact Origin.
- Passwords use Node scrypt; verification/recovery tokens are purpose-bound, hashed at rest, single use, and expiry-checked. Sensitive administrative state changes are audited.
- Parent and specialist accounts remain pending until verified and approved. Specialist public listing additionally requires a complete profile and explicit opt-in.
- Parent-child routes are restricted to verified, approved, active parent accounts. Repository queries scope child records and consent history to both the session's parent ID and child ID. Parent child profiles intentionally avoid dates of birth and medical details.
- The administrator bootstrap is an interactive, first-admin-only CLI; there is no HTTP administrator registration endpoint.
- Validate and normalize incoming data, use safe database operations, rate-limit sensitive workflows, and apply restrictive browser/security headers.
- Keep secrets in deployment environment configuration; never bundle provider or database credentials into the client.
- Production access to authentication and sensitive records/actions requires HTTPS; local HTTP must not weaken security controls.
- Configure allowed origins, cookie flags, and trusted proxies for the actual deployment topology. That topology is currently unknown.
- Restrict upload formats, size, storage access, and serving behavior; uploaded media must not be treated as executable code.
- Minimize child and consultation data, define consent and retention/deletion rules, and restrict private consultation access.
- The Jitsi IFrame integration is operational when configured, but the public server does not prove participant-only room access. Review provider privacy and require a properly authenticated deployment for stronger access control; do not record by default.

## Assumptions and unresolved decisions

| Topic | Current status |
|---|---|
| React, Node.js/Express, MongoDB, REST | Implemented in this workspace. An isolated local MongoDB startup, index creation, path seed, and `$topN` progress aggregation smoke check succeeded; production deployment remains unverified. |
| Hosting, deployment topology, domain and HTTPS termination | Unknown. |
| Email, object/file storage, notification delivery and observability providers | Unknown. |
| Video provider and operational readiness | Jitsi IFrame API configured through `JITSI_DOMAIN`; admin appointment monitoring and independent video tests are implemented. No JWT/moderator authentication or recording is implemented. Public-server participant restrictions are not guaranteed. |
| Jurisdictions, regulatory obligations, consent, retention and deletion policy | Unknown; product decision required. |
| Payment prices and instructions | Subscription price/instructions are configurable by an administrator. Appointment price/duration are configured by each specialist and snapshotted at booking. |
| Payment verification, refunds and cancellation policies | Transfer verification is manual and outside Harf. Refund, cancellation, failed-transfer, and pending-request expiry policies are not defined or implemented. |
| Specialist credential verification and appointment business policies | Unknown. |
| Source-control history and pre-existing working behavior | Cannot be inspected because this workspace is not a Git repository and contains no app source. |

## Phase boundary

Phase 3 established parent-owned child profiles and consent history. Phase 4 adds the interactive public trial and parent game player. Phase 5 adds administrator-managed content/media for the existing multiple-choice template. Phase 6 adds server-enforced subscription access and configurable child-specific learning paths. Phase 7 adds administrator-configurable monthly pricing, manual payment requests and review, private receipt access, and subscription/payment history. Phase 8 adds approved specialist availability, optional child-linked appointment requests, concurrency-safe slot reservations, specialist decisions, 48-hour request expiry, and appointment history. Phase 9 adds session execution, private specialist notes, and consent-gated parent-visible appointment reports. Phase 10 adds reports and notifications. Phase 11 adds Jitsi IFrame meetings and participant/time-window authorization. Generated game reports, automated payment integrations, appointment payment collection, cancellation/rescheduling/refunds, and auto-renewal remain unimplemented. Production proxy/TLS topology, real SMTP delivery, persistent media/payment-receipt backup and retention, and shared rate-limit storage remain deployment decisions.
