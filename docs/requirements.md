# Harf Requirements

## Document status

- Phase 0 captured the initial workspace; Phase 1 application foundation is now implemented.
- Source: the Harf master project instructions supplied in the user request for this workspace.
- `HARF_MASTER_PROMPT.md` was absent at the Phase 0 inspection and has now been created from the approved requirements supplied by the user.
- Status labels below distinguish requested product behavior from behavior verified in this repository.
- The Phase 0 finding that no source existed describes the initial workspace before Phase 1. Product requirements marked **Not verifiable** must not be interpreted as implemented or tested.

## Product objective

Harf (حرف) is an Arabic-first learning platform intended to help children practice communication and language skills through interactive educational games and progressive, non-diagnostic learning paths. Parents can track authorized children and optionally request consultations with approved speech-language specialists. Specialist booking must not be a prerequisite for using games.

## Users and access

| Requirement | Requested behavior | Repository evidence |
|---|---|---|
| Visitor | View the public landing page and approved specialist directory; access four free trial games. | Landing page, filtered public specialist directory, and four administrator-selected interactive trial games are implemented. Trials do not persist visitor answers or identity. |
| Parent | Maintain a parent account and separate child profiles; access only their account and authorized children. | Parent registration, verification, login/recovery, admin approval, an Arabic dashboard for child profiles/consent/history, child-specific learning paths, manual payment request/history, appointment-linked educational reports with consent checks, and recipient-scoped notifications are implemented. Generated game progress reports are not implemented. |
| Specialist | Use an administrator-approved account and access only records they are authorized to manage. | Specialist registration, approval, professional-profile editing, opt-in public listing, availability, appointment decisions, session lifecycle, private notes, parent-visible reports, and authorized appointment history are implemented. Specialist access remains limited to children whose parents requested appointments with that specialist. |
| Administrator | Approve parent and specialist accounts, manage settings/content/payments, and perform authorized administrative tasks. | First administrator is provisioned through a local CLI. Account review, game/media operations, learning-path configuration, subscription pricing/payment-method settings, manual payment review, and date-filtered aggregate reports/CSV exports are implemented. |
| Server-side authorization | Enforce role and object-level access on every protected API and resource; frontend checks alone are insufficient. | Parent-child/consent, game access, subscription, learning progress, payment, appointment/session, video-access, report/export, and notification APIs enforce backend roles or recipient/owner scope. |

### Child profile data minimization

- Store a short parent-chosen display name, optional broad age band, and optional built-in animal avatar only; do not request exact birth date, uploaded child photos, diagnosis, school, address, or medical history.
- Parent routes require an active, verified, administrator-approved parent account. Every child and consent query is scoped to the authenticated parent and the child resource.
- Child records can be archived/reactivated; Phase 3 does not hard-delete records or histories. A retention/deletion policy is required before production child data collection.
- Consent records are child-specific, append-only grant/withdraw events. No consent is granted by default. The current policy-version identifier is an implementation marker; legally sufficient policy wording and jurisdictional review remain unresolved.
- Child-owned game attempt records and a paginated, owner-scoped history endpoint are present. The game player and configurable educational learning paths/recommendations are implemented. Appointment-linked parent-visible educational reports require current `progress_reports` consent; generated game progress reports remain future work. Parent notification reads are scoped to the signed-in account.

## Public site and visual identity

- Preserve the supplied landing-page design, existing working implementation, logo, typography, colors, layout, and brand assets. Do not redesign or replace the landing page without an approved, documented technical reason.
- Treat `Branding/Landing page.png` as the supplied visual reference. It depicts an Arabic RTL landing page with a hero section, game/skill explanations, a learning-path example, subscription plans, parent testimonials, FAQs, a call to action, and footer.
- Treat `Branding/Colors with logo.png` as the supplied brand identity reference. Its palette is:
  - Primary Blue: `#3B4CCA`
  - Teal Green: `#22C7A7`
  - Purple: `#8B6CF6`
  - Sun Yellow: `#FFC857`
  - Coral: `#FF7B7B`
  - Sky Blue: `#E8F4FF`
  - Soft Beige: `#F9FAFB`
- Public specialist directory and free trial are requested product behavior; neither can be verified from an image.
- The pricing cards in the supplied landing-page reference show `[السعر]` placeholders. No live price source or dynamic price behavior was found.
- Phase 1 implements the landing page from the screenshot because no page source was available initially; it does not claim to preserve prior page code.

## Games and learning

- Provide a reusable framework and initial built-in games. Published games are available to active subscribers; visitors can access four administrator-selected free trial games.
- Reuse components for instructions, questions, answers, feedback, progress, audio, animation, and completion.
- Allow administrators to manage game content and supported media without code changes for content changes or existing game templates. A genuinely new interaction type may require implementation work.
- Include child-friendly animal companions, appropriate audio instructions, animation, feedback, and reusable character states such as welcome, idle, thinking, listening, correct-answer celebration, encouragement, and completion.
- Record per-child attempts and outcomes. Use transparent, configurable rules to recommend activities and support repeated practice, gradual progression, and revisiting earlier activities.
- Do not diagnose, imply a medical diagnosis, or make unsupported claims from game results.
- A reusable multiple-choice game experience, built-in activities, optional user-initiated browser speech, accessible progress/feedback/completion, and animal companion states are implemented. Phase 5 adds administrator-managed drafts and immutable published game versions for that template, trial-game selection, safe upload/assignment of supported media, and fallback for inactive/missing media. Administrators can select four published games as public trials; the landing page displays those games. Parent game attempts use owner-scoped records and require learning-data consent; answer selections are not persisted. Visitors can play the selected trial games without accounts, and trial answers/results are session-only. Phase 6 adds backend subscription enforcement, configurable ordered learning paths, multi-attempt threshold recommendations, child-specific completion milestones, and parent/admin interfaces.

## Accounts and subscriptions

- Provide secure authentication, logout, email verification, and password recovery.
- Both parent and specialist accounts require administrator approval.
- An administrator configures the monthly subscription price and supported payment instructions. The public site displays the configured price dynamically.
- An active subscription grants access to published educational games. Enforce subscription status and expiration on the backend and retain historical subscription records.
- Parents can submit manual payment evidence using Vodafone Cash or InstaPay. Uploading a receipt does not activate a subscription; only an authorized administrator can confirm payment.
- Keep subscription payments distinct from specialist appointment charges.
- Account registration, authentication, verification, recovery, session handling, and administrator approval are implemented in Phase 2. Phases 6–7 add server-enforced subscription access, configurable monthly pricing, manual Vodafone Cash/InstaPay requests, private receipt uploads, administrator review, and historical subscription/payment records. A successful manual approval grants a calendar-month period, extending from any still-active period; this is not automatic payment verification or auto-renewal. Subscription cancellation, refunds, failed-transfer handling, payment reminders, and appointment charge collection remain unimplemented and require product policy.

## Optional specialist appointments

- Parents may request an appointment with an approved specialist; games remain usable without a booking.
- Approved specialists manage a weekly schedule, time zone, session price/duration, and date-specific availability exceptions; public listings include only approved, complete, explicitly opted-in profiles.
- Parents select an active child they own and request a slot. The server independently validates child ownership, specialist approval/listing, schedule availability, and appointment price/duration.
- Specialists can accept or reject pending requests. Pending requests expire after 48 hours, release the reserved slot, and retain an expiration timestamp.
- Prevent overlapping bookings, including concurrent requests, using unique quarter-hour slot reservation keys in MongoDB.
- Preserve the appointment price, duration, currency, and time zone as booking-time snapshots. Appointment charges remain separate from subscriptions; no appointment payment collection is implemented.
- Restrict consultations to authorized participants and confirmed appointments. Do not record audio or video by default.
- Keep video-provider secrets out of frontend code. The current Jitsi IFrame implementation works with a configurable public/self-hosted domain; public Jitsi does not guarantee participant-only room access and is not sufficient for that privacy claim.
- Restrict administrative access to private consultation content. Specialists may access only authorized records.
- Session execution status/timestamps, assigned-specialist private notes, consent-gated parent-visible educational appointment reports, and Jitsi video joining are implemented. Recording/transcription remain disabled. Appointment cancellation/rescheduling, lateness, no-show, refund, and appointment charge-collection policies remain unresolved.

## Security, privacy, and operations

- Use secure password hashing, server-side authorization, input validation, safe database queries, and protections against NoSQL injection, XSS, CSRF where applicable, IDOR, and open redirects.
- Apply rate limits to sensitive endpoints, restrictive CORS, suitable security headers, secure cookie/session settings, and correct trusted-proxy configuration.
- Keep secrets in environment configuration; provide `.env.example` placeholders only. Redact logs and return safe errors.
- Validate uploads, restrict formats and sizes, store them safely, and prevent uploaded code from executing in the browser. A static image is not an animation.
- Maintain audit records for sensitive administrative actions, child-data access restrictions, consent management, privacy controls, and documented retention policies.
- Support HTTP for local development and controlled testing, and HTTPS for secure testing and production. Use configurable origins and avoid redirect loops and mixed-content errors.
- Production authentication, child/private data, payments, subscriptions, and video consultations require HTTPS. Do not weaken security to enable HTTP.
- Phases 1–8 configure the API foundation, MongoDB lifecycle, exact-origin CORS, Helmet, validation/error middleware, redacted request logs, HTTPS enforcement, secure sessions, account approval, child-scoped access, consent history, rate limits, subscription/payment controls, owner-scoped progress and game access, appointment ownership and concurrency controls, account/game-library audit events, and constrained media uploads. Finalized consent/retention policy, shared distributed rate-limit storage, and deployment-specific security review remain open.

## Documentation and delivery workflow

Requested project documentation includes:

- `README.md`
- `docs/requirements.md`
- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/security.md`
- `docs/deployment.md`
- `.env.example` with placeholders only
- A phase completion and remaining-work record

Design MongoDB collections, indexes, and consistency rules before implementing dependent features. Work phase-by-phase: inspect, plan, implement only the approved phase, preserve existing behavior, verify, review security-sensitive work, update documentation, report evidence and unresolved issues, then stop for approval.

At the Phase 0 baseline, only the branding images and Phase 0 documents were present. Phases 1–8 added the application foundation, account/family flows, games, administrator game/media management, time-bounded subscription entitlements, configurable educational paths, manual subscription payments, and optional specialist appointments. Phase completion records distinguish verified behavior from remaining product work.

## Unresolved requirements questions

These questions require product or deployment decisions before dependent implementation:

1. Which jurisdiction(s), child-privacy rules, consent model, and retention/deletion periods apply?
2. Which languages are required beyond Arabic, and what accessibility and age-range targets apply?
3. What are the subscription cancellation, renewal, grace-period, refund, and payment-evidence retention rules?
4. What are the specialist credential-verification/approval, cancellation, lateness, no-show, refund, and appointment charge-collection policies? Appointment durations and prices are currently specialist-configurable and snapshotted at booking.
5. Which video provider, if any, will be evaluated and approved?
6. What are the deployment topology, hosting, domain/origin, email delivery, file storage, backup, and monitoring choices?
7. The workspace master prompt was created during Phase 1 from the approved requirements in the user request; confirm separately if it must later be synchronized with another maintained source.
