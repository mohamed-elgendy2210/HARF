# Phase 6 — Learning Paths and Subscription Enforcement

## Status

Implemented in the existing React/Vite, Express, and MongoDB/Mongoose architecture. This document records repository behavior and local test/build evidence; it does not claim production deployment or educational validation.

## Implemented

- Added append-only, time-bounded subscription records. Access is active only when the server time falls within the subscription's start and expiry dates.
- Parent access to non-trial game content, answer checks, attempt recording, and learning progress is enforced on the API. Client-side checks are only for presentation.
- Added an administrator-only subscription grant endpoint for eligible verified and approved parents. It calculates dates on the server and creates an audit event. It does not confirm payments or represent a payment workflow.
- Added an administrator-configurable learning path with Arabic metadata, ordered published activities, educational areas, and bounded minimum-attempt/sample-size/accuracy rules. An activity cannot be configured if unpublished or currently selected as the public trial. Trial selection cannot leave the learning path empty.
- Added per-parent, per-child completion milestones. Completion requires the configured number of recent attempts and the configured accuracy. Milestones and immutable attempts are retained if scores or rules later change.
- Added recommendations that state the relevant transparent rule and label the result as an educational suggestion, not a medical or clinical assessment.
- Enforced active-child ownership, current learning-data consent, and active subscription on learning-path progress and parent game access. Parent answer checks require a selected child and CSRF validation. Child IDs are verified against the authenticated parent.
- Updated the parent dashboard progress section to show actual recorded attempt counts, results, activity order/status, available practice, and replay links. Consent, subscription, and unavailable states are communicated without fabricated charts or scores.
- Added subscription status display to the parent dashboard and a learning-path configuration/editor section to the administrator dashboard.

## Data and API changes

New Mongoose models:

- `Subscription`: parent owner, start/expiry, granted duration, administrator grant source/reason, and timestamps.
- `LearningPath`: single default path configuration, ordered activity metadata, progression rules, updater, and timestamps.
- `LearningProgress`: unique parent/child/path record containing retained completion milestones.

New API routes:

- `GET /api/v1/auth/subscription`
- `POST /api/v1/admin/accounts/:accountId/subscriptions`
- `GET /api/v1/admin/learning-path`
- `PUT /api/v1/admin/learning-path`
- `GET /api/v1/children/:childId/learning-progress`

Existing routes updated:

- Parent game content and answer checks enforce subscription, path order, child ownership, and learning consent.
- Parent attempt recording enforces subscription and path playability in addition to existing consent and ownership checks.
- Administrator trial-game selection removes the game from the path and refuses to leave the path with no activities.

MongoDB indexes cover subscription lookup by parent/start/expiry, unique learning-path key, and unique per-child/path progress identity. The progress aggregation uses MongoDB `$topN`; MongoDB 5.2 or newer is required.

## Verification performed

- `npm test` — passed, 25 API tests. Coverage includes subscription absence/active/expired access, administrator grant and audit, trial access, child ownership/IDOR rejection, consent gating, configured path progression and lock/unlock behavior, admin-only path changes, trial/path consistency, and preservation of historical game versions and attempts.
- `npm run build` — passed. Vite emitted the existing warning that the main JavaScript chunk is larger than 500 kB after minification.
- Started the API against an isolated local database (`harf_phase6_smoke`); `/api/v1/health/ready` reported MongoDB connected. Startup index creation and seed completed. Inserted and removed one synthetic attempt in the isolated database and verified the owner-scoped `$topN` aggregation returned the expected result.
- Full API scenario tests use in-memory repositories. A browser end-to-end test and production deployment test were not run.

## Remaining work and boundaries

- No payment collection, receipt upload/review, subscription price configuration, automatic renewal/cancellation, refunds, or appointment charges are included. The current administrator grant route is an audited entitlement-provisioning mechanism.
- Progress reports, appointment booking, video consultation, notifications, and specialist learning-record access remain outside Phase 6.
- The transparent threshold rules are configurable but have not been evaluated by educational or speech-language professionals. They must not be presented as clinical conclusions or evidence-based treatment.
- Define and approve the child-data consent wording and retention/deletion policy before production use.
- Verify MongoDB 5.2+ behavior and index creation in the production deployment environment.

Phase 6 stops here; no Phase 7 work is included.

Phase 7 subsequently replaced the direct administrator grant endpoint with reviewed manual payment requests as the parent subscription provisioning workflow. This file records the Phase 6 implementation state at that phase boundary.

## Subsequent learning-path expansion

The current implementation extends the original single-path model without removing the legacy `default` path:

- Administrators can create/publish multiple paths and version the parent questionnaire, including skill mappings and recommendation priorities.
- The server validates questionnaire versions, answer IDs, age bands, path publication, activity availability, and configured matching rules before returning explainable recommendations.
- Parents preview and explicitly confirm recommendations. Saving answers and assignments requires current learning-data consent; repeated submissions are idempotent and assignments retain review history.
- Children see progress per confirmed path, calculated from actual attempts. Legacy default-path progress remains visible when prior progress or attempts exist, but new children are not assigned the default path automatically.
- New collections are `LearningQuestionnaire`, `LearningQuestionnaireResponse`, and `LearningPathAssignment`; detailed fields and indexes are documented in [database-schema.md](./database-schema.md).
- API regression and recommendation tests plus the web production build are run with the current repository scripts; no new browser end-to-end or production database deployment is claimed here.
