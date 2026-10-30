# Harf Database Schema

## Implemented account, family, game, subscription, appointment, and learning collections

This schema is implemented with Mongoose models in `apps/api/src/models/`. MongoDB is required for authentication, family profiles, and account APIs. MongoDB's TTL monitor is cleanup assistance only; all session and token reads also enforce `expiresAt` in application queries.

### `users`

| Field | Type / rule | Purpose |
|---|---|---|
| `email` | normalized lowercase string, required, unique index | Login and notices |
| `passwordHash` | scrypt encoded hash, `select: false` | Password verification; never returned by API |
| `role` | enum `parent`, `specialist`, `admin` | Assigned at registration only for parent/specialist; admin only by CLI provisioning |
| `emailVerifiedAt` | nullable Date | Verification state |
| `approvalStatus` | enum `pending`, `approved`, `rejected` | Administrator approval for parent/specialist accounts |
| `accountStatus` | enum `active`, `suspended` | Suspension state; checked every authenticated request |
| `parentProfile` | strict nested schema | Parent display name |
| `professionalProfile` | strict nested schema | Specialist display name, specialty, credentials, bio, and explicit public-listing opt-in |
| `timestamps` | Mongoose created/updated dates | Account history |

Indexes: unique `{ email: 1 }`; a unique partial `{ role: 1 }` index permits only one `admin` during the current bootstrap-only policy; directory lookup `{ role: 1, approvalStatus: 1, accountStatus: 1, emailVerifiedAt: 1, 'professionalProfile.publicListing': 1 }`.

The public directory query additionally requires every professional field and opt-in. Password, approval, role, account status, and verification state are not mass-assignable through profile or registration endpoints.

### `children`

One document per child profile. A child profile stores only the parent's chosen short display name, an optional broad age band (`3-5`, `6-8`, `9-12`, `13+`), an optional enum-selected built-in animal avatar (`cat`, `fox`, `panda`, `turtle`), the owning `parentUserId`, status (`active`/`archived`), and timestamps. It intentionally does not collect date of birth, uploaded photos, diagnosis, school, address, or medical history. `parentUserId` is assigned from the authenticated parent session and is never accepted from request data.

Indexes: `{ parentUserId: 1, status: 1, createdAt: -1 }` for a parent's dashboard, and `{ parentUserId: 1, _id: 1 }` for owner-scoped record lookup. The Mongo `_id` is a per-child stable identity for game attempts, future progress records, consent events, and reports.

Records are archived rather than hard-deleted in this phase so that future learning history and consent references are not silently orphaned. A retention/deletion policy must be decided before production child data is accepted.

### `childConsents`

Append-only consent history; each record contains `parentUserId`, `childId`, consent type (`learning_data` or `progress_reports`), granted/withdrawn boolean, policy-version identifier, and timestamp. Consent records are queried with both the owner and child IDs. A parent can withdraw by adding a newer `granted: false` event; history is retained. No consent is assumed by default.

Index: `{ parentUserId: 1, childId: 1, consentType: 1, createdAt: -1, _id: -1 }`, supporting ownership-scoped history and deterministic latest-state lookup when timestamps tie. The current API returns the latest event per consent type, defaulting to not granted. Policy version is assigned by the server; clients cannot claim a policy version.

The `harf-child-data-v1` identifier is a schema/version marker for this initial implementation, not a published privacy policy or a determination of legally sufficient consent. Before dependent data processing, publish and review the actual policy/version, consent wording, jurisdictional requirements, and withdrawal behavior.

### `gameAttempts`

Stores an individual completed game attempt with the authoritative `parentUserId`, `childId`, game ID/version, server-computed correct-answer count, question count, duration, and completion time. Spatial attempts additionally store educational progress (level/concepts, start time, placements, incorrect attempts, replay/hint counts and types, completion percentage, and elapsed time). Raw answer selections and media are not persisted. Writes require a verified, approved parent, an active owned child, and current learning-data consent. The attempt history API checks ownership and supports bounded page/limit and game-ID filters.

Index: `{ parentUserId: 1, childId: 1, completedAt: -1, _id: -1 }`, supporting stable owner-scoped pagination. No learning path, recommendation, or report state is inferred or stored by this collection.

### `gameAnswerReceipts`

Short-lived, owner-scoped answer records used to calculate a completed parent game attempt from answers checked by the server, rather than a client-supplied answer array. Spatial receipts also count placement attempts, incorrect attempts, instruction replays, hints, and the server-side activity start time. Each receipt is unique by parent, child, game, submission ID, and question index; a corrected answer replaces that question's current correctness. Receipts expire after 24 hours and are removed after the attempt is saved. Attempt writes require one receipt for every question/step in the exact game version. Only correctness and graduated-assistance availability are returned to the player; answer-key indexes are not sent to the browser. Anonymous trial answers are not persisted.

Indexes: unique `{ parentUserId: 1, childId: 1, gameId: 1, submissionId: 1, questionIndex: 1 }`; TTL `{ expiresAt: 1 }`.

### Game library and media collections

| Collection | Fields and purpose | Indexes / invariants |
|---|---|---|
| `gameDefinitions` | Unique `gameId`, supported templates (`multiple-choice`, `matching-pairs`, `picture-matching`, `audio-choice`, `spatial-relationships`), validated draft content and asset IDs, status (`draft`, `published`, `unpublished`), and current published version. Spatial content contains a responsive scene, bounded objects, ordered instructions, relationship rules, target rectangles, and assistance thresholds. | Unique `{ gameId: 1 }`; `{ status: 1, updatedAt: -1 }`. Draft input is strict-Zod validated in the API; spatial publishing additionally checks media and reachable target placements; only administrators can create or mutate it. |
| `gameVersions` | Immutable snapshot of `gameId`, monotonically increasing version, published content, referenced asset IDs, publisher, and timestamp. Old versions are retained so answer scoring and historical attempts remain stable after edits. | Unique `{ gameId: 1, version: 1 }`; `{ publishedAt: -1 }`. A publish creates a new snapshot; it never rewrites older content. |
| `gameSettings` | Key/value settings including `trialGameIds` (an ordered array of four public trial game IDs) and the legacy `trialGameId`, with the administrator who last changed each value. | Unique `{ key: 1 }`. All configured trials must refer to currently published games; startup migrates the former single-game setting. |
| `mediaAssets` | Display name, kind, detected MIME type, UUID storage filename, byte size, active state, creator, and timestamps. File bytes are stored outside the application tree; client filenames are not used as storage paths. | Unique `{ storageName: 1 }`; `{ kind: 1, active: 1, createdAt: -1 }`. Upload kinds and size/type rules are enforced in the service. Deletion is blocked while referenced by any draft or immutable version; deactivation is allowed and triggers fallback. |

Game content and asset assignment schemas are application-validated JSON rather than arbitrary editor code. The current built-in `multiple-choice` template supports bounded question/answer data and allow-listed event/kind assignments. Published versions are preserved on unpublish. Media referenced by any historic version cannot be physically deleted, even when that version is no longer current; deactivate it to prevent use. This conservative retention currently has no automated purge workflow.

Public asset access requires an active metadata record and a reference from a published game version belonging to a currently published game. Historical versions of that game remain eligible to support clients already using older content. Lottie JSON files are accepted only after structural limits and rejection of expressions/external references, but the current frontend uses the companion fallback instead of rendering Lottie; animated GIF and image/audio previews are supported.

The answer-check endpoint returns correctness only and never returns answer-key indexes. For parent games, each checked answer/placement is recorded in a short-lived, owner-scoped receipt; completed attempts are scored from these server records rather than client-submitted answer arrays. Anonymous trial answers and scores remain in the browser session and are never submitted to a persistence endpoint.

### `platformSettings`

Singleton key `platform`, managed only by administrators. Stores the platform logo and selected homepage image asset IDs, brand colors (including dark and muted palette colors), and homepage copy. Text colors are derived from the shared platform palette; legacy per-section text-color overrides are removed when settings are saved. The public settings response exposes only validated presentation data and active, available homepage assets, including each image's category.

### `subscriptions`

An append-only access period per parent account. Fields include `parentUserId`, `startsAt`, `expiresAt`, `grantedDays`, administrator `grantedBy`, source (`administrator` for legacy records or `manual_payment`), optional reason, optional unique `paymentRequestId`, and a snapshot of amount/currency/payment method/transaction reference for paid periods. Active access is calculated at request time using `startsAt <= now < expiresAt`; expiration never deletes history. Phase 7 creates paid periods only after administrator review of a manual payment request. A renewal starts when the latest period expires if that period is still active, otherwise at the current time; one calendar month is added with month-end clamping. No client can set or alter subscription state.

Indexes: `{ parentUserId: 1, startsAt: -1, expiresAt: -1 }` and unique sparse `{ paymentRequestId: 1 }` to prevent duplicate periods from the same reviewed payment. The monthly period is calendar-based, not an auto-renewing payment authorization.

### `subscriptionSettings`

Singleton key `monthly`, with fixed-currency `EGP` price in integer minor units, enabled flags, recipient identifiers and payment instructions for Vodafone Cash and InstaPay, updater, and timestamps. Public plan reads expose only the current configured price and enabled method instructions. Settings changes do not mutate historical payment requests or subscriptions.

Unique index: `{ key: 1 }`.

### `paymentRequests`

Parent-owned manual payment evidence request with method, transaction reference, immutable amount/currency and recipient/instruction snapshot, optional receipt metadata, status (`pending`, `reviewing`, `approved`, `rejected`), `open` review-state marker, and administrator review metadata. Receipt bytes are stored outside the application tree under private, generated UUID names; the database stores only detected MIME type, size, and opaque storage name. Accepted receipt formats are PNG, JPEG, WebP, or PDF and the size limit is 5 MiB. Receipt reads require either the owning parent or an authenticated administrator.

Indexes: `{ parentUserId: 1, createdAt: -1, _id: -1 }`, `{ status: 1, createdAt: 1 }`, and a unique partial `{ parentUserId: 1 }` where `open: true`, allowing at most one open request per parent. Review claims expire for recovery after ten minutes; a unique payment-to-subscription index supports retries if period creation succeeded before request finalization. Review processing is not wrapped in a MongoDB transaction; see the phase completion's operational risks.

### `learningPaths`

One document per stable path key. Fields include Arabic title/description, lifecycle status (`draft`, `published`, `archived`), optional age bands, skill IDs/objectives, administrator-configured matching rules (skill and questionnaire-option IDs, minimum matches, priority, and assignment type), ordered activities, progression rules (`minimumAttempts`, `sampleSize`, `targetAccuracyPercent`), `updatedBy`, and timestamps. Activities include required/repeatable flags and skill IDs. Only currently published, non-trial games are accepted. The legacy `default` path remains valid; several non-diagnostic starter paths are seeded from published built-in games without automatically assigning any path to a child.

Unique index: `{ key: 1 }`. Array order defines progression. Completion milestones are not embedded into shared configuration, so editing/reordering content does not overwrite each child's history. Draft and archived paths are never recommended.

### `learningQuestionnaires`

Immutable questionnaire versions with status (`published`/`archived`), a configured maximum recommendation count, stable question and option IDs, Arabic labels/help text, single/multiple answer type, required state, and option-to-skill mappings. Publishing an edit archives the old version and creates a higher version; saved responses retain the version that was presented.

Unique index: `{ version: 1 }`; `{ status: 1, version: -1 }` supports active-version lookup. An initial Arabic questionnaire is seeded only when the collection is empty.

### `learningQuestionnaireResponses`

Parent/child-scoped submitted answers, age band, questionnaire version, opaque submission UUID, and server-calculated recommendation keys. The service validates every question and option against the active questionnaire and calculates matches from administrator-configured rules; clients cannot submit scores or trusted explanation text. Writes require current learning-data consent. Repeating the same submission ID is idempotent, and reuse with different content is rejected.

Unique index: `{ parentUserId: 1, childId: 1, submissionId: 1 }`; `{ parentUserId: 1, childId: 1, createdAt: -1 }` supports scoped history.

### `learningPathAssignments`

One current assignment per parent/child/path key with primary/complementary role, active/paused/completed/removed status, source, recommendation reason, questionnaire version, latest submission ID, and append-only assignment/review history. Assignments are created only after the parent explicitly confirms recommendations. Reassignment updates the current record and appends history instead of resetting learning progress; a retry of the same questionnaire submission does not duplicate assignment history. The administrator review API omits saved answer details.

Unique index: `{ parentUserId: 1, childId: 1, pathKey: 1 }`; `{ parentUserId: 1, childId: 1, status: 1 }` supports owner-scoped dashboard queries.

### `learningProgress`

One record per parent/child/path key containing `completedActivities` milestones: game ID, completion timestamp, qualifying-attempt count, and achieved accuracy percentage. Completion requires at least the configured minimum number of recent attempts and the configured target accuracy across the configured sample. Once earned, the milestone is retained even if future results or administrator rules change. Current progress responses also calculate attempt totals/latest accuracy from the immutable `gameAttempts` collection and return the educational rule explanation; recommendations are not diagnoses.

Unique index: `{ parentUserId: 1, childId: 1, pathKey: 1 }`. All progress queries and mutations include both authenticated `parentUserId` and owned `childId`. The service additionally requires an active child, current learning-data consent, and an active subscription to show progress. Parent game content/answer and attempt endpoints independently enforce current entitlement; game progress is based on actual persisted attempts and does not fabricate scores. Game-derived progress reports remain separate and unimplemented; appointment-linked specialist reports are stored on their authorized appointment.

### `specialistAvailabilities`

One record per specialist containing their IANA time zone, EGP appointment price in integer minor units, session duration in 15-minute increments, seven weekly schedule entries, and date-specific exceptions. An exception replaces that date's weekly windows; an empty window list closes the date. Schedule updates are self-scoped to the authenticated approved specialist. Public availability is derived only for specialists who are verified, approved, active, complete, and opted into the directory.

Unique index: `{ specialistUserId: 1 }`, named `availability_by_specialist`.

### `appointments`

Each appointment links an authenticated parent, their child, and an approved specialist. It stores UTC start/end instants, time-zone and price/duration/currency snapshots, booking status (`pending`, `accepted`, `rejected`, `expired`), request/decision/expiry timestamps, and a short decision note. Phase 9 adds independent session status (`not_started`, `in_progress`, `completed`), actual start/end timestamps, private specialist notes, and a separate parent-visible educational progress report. Phase 11 adds an optional embedded meeting association containing provider (`jitsi`), domain, 256-bit random room name, meeting lifecycle status, and creation/start/end timestamps. Phase 12 adds a safe meeting-provisioning failure timestamp and provider error code for admin diagnostics. A unique partial index prevents duplicate room identifiers. The room name is never returned in appointment list/detail serializers; it is returned only by the authenticated, no-store participant video-access POST after ownership and time-window checks. Neither report field is a diagnosis. No video/audio recording or payment transaction is stored. Appointments do not grant subscription/game access.

Indexes: unique multikey `{ specialistUserId: 1, reservationKeys: 1 }` with partial filter `{ slotReserved: true }`, named `appointments_no_overlapping_reserved_slots`; `{ parentUserId: 1, requestedAt: -1, _id: -1 }`; `{ specialistUserId: 1, requestedAt: -1, _id: -1 }`; `{ status: 1, expiresAt: 1 }`; and unique partial `{ 'meeting.roomName': 1 }`, named `appointments_unique_video_room`. `reservationKeys` includes each 15-minute bucket touched by the appointment. The unique partial index makes creation atomic against overlapping concurrent requests. Pending and accepted requests reserve slots; rejection or expiry clears `slotReserved`, retaining the appointment record as history.

Pending requests expire 48 hours after creation. An API-side expiration check runs before relevant reads/decisions, and a worker checks every 60 seconds; expiry is not a MongoDB TTL deletion. Parent/specialist appointment history returns at most 100 records per request; the separate administrator monitor uses server-side pagination. Cancellation and accepted-appointment release are not implemented.

Session start/completion updates are atomic and assigned-specialist-only. Parent serialization uses an explicit allow-list and never includes private specialist notes; specialist serialization may include both private notes and the parent report. Administrators cannot access participant appointment/session or join endpoints. A separate admin monitoring API returns selected appointment status/details with server-side filtering and pagination, never room credentials; its provisioning retry only creates a missing room on a future accepted booking. Video-room access re-queries the appointment scoped to the requesting parent or assigned specialist, requires an accepted booking, enforces server-side role-specific join windows, and returns private/no-store meeting details only after authorization. The current public Jitsi configuration has no participant-authentication guarantee. Future accepted appointments missing a room can be associated on eligible join or through the scoped admin provisioning retry; past appointments are not backfilled. Appointment cancellation/rescheduling is not implemented in the existing booking workflow.

### `adminVideoTests`

Independent administrator test records store the administrator reference, provider/domain, temporary random room name, one-use second-participant token digest, creation/start/end/expiry timestamps, bounded technical failure reason, six check results, and overall result (`in_progress`, `succeeded`, `partial`, `failed`, `incomplete`). No appointment, parent, child, specialist, media, or recording is attached. The room name is retained for joining until application expiry, but history serialization omits it. The raw second-participant token is returned once at creation and never persisted; only its SHA-256 hash is stored and it is cleared when consumed or ended. Expired tests are finalized as incomplete on history/end operations.

Indexes: `{ administratorId: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`, and unique `{ roomName: 1 }`. Test records are retained as history; expiry invalidates application access, not an already created public Jitsi room. Public Jitsi does not enforce the application token at room level.

### `sessions`

| Field | Type / rule | Purpose |
|---|---|---|
| `tokenHash` | required unique SHA-256 digest | Lookup for opaque random HttpOnly cookie; raw session token is never persisted |
| `userId` | required reference to users, indexed | Owning account |
| `csrfToken` | random secret, required | Session-bound CSRF header check; returned only to the owning authenticated session |
| `expiresAt` | required Date, TTL index | Session expiration |

Every request checks expiry explicitly, and reloads the user account state before authorization. Sessions are deleted at logout, password reset, account rejection, and account suspension. A rejected or suspended account's old session cannot become valid again if its state is later restored.

### `authTokens`

Purpose-bound `email_verification` or `password_reset` tokens; stores only a unique SHA-256 digest, user reference, expiry Date, and timestamps. TTL index on `expiresAt`; reads require `expiresAt > now`. Verification/reset consumes a token atomically. Password reset invalidates all sessions and other outstanding auth tokens for that user.

### `auditEvents`

Stores action, nullable actor/user reference, nullable target/user reference, success boolean, allow-listed minimal metadata, and creation date. Indexes `{ createdAt: 1 }` and `{ targetUserId: 1, createdAt: -1 }`. Audit records must not store passwords, bearer tokens, verification/reset links, CSRF/session secrets, receipts, child records, or consultation notes. Retention period and access workflow are product/deployment decisions still to be approved.

### `notifications`

Each notification stores a recipient user reference, allow-listed event type, bounded title/message, resource kind/ID, nullable `readAt`, and creation timestamp. In-app messages are intentionally generic and must not contain child details, receipts, private specialist notes, or report content. Resource IDs are references for application use and are not exposed as navigation parameters by the dashboard.

Indexes: `{ recipientUserId: 1, createdAt: -1, _id: -1 }` and `{ recipientUserId: 1, readAt: 1, createdAt: -1 }`. Lists are capped at 50 newest records. Read and mark-all-read operations filter by both notification ID (where applicable) and the authenticated recipient ID. The API response omits `recipientUserId`.

## Consistency and authorization rules

1. Public signup only permits `parent` or `specialist`; registration schemas reject unknown fields.
2. Parent/specialist start with `approvalStatus: pending`; verification never grants approval.
3. Account access is distinct from protected-feature access: an authenticated pending account can inspect its own status and finish its own specialist profile. All protected features require a verified, approved, active account (or an administrator).
4. Admin accounts cannot be registered through HTTP. The local/operations provisioning CLI creates the initial administrator from ephemeral environment input.
5. Approval endpoints only change approval state for parent/specialist targets; self-approval, role changes, or changes to subscription/permissions are not exposed.
6. Specialist profile writes are scoped to the authenticated user. Directory reads return only approved, verified, active, complete, explicitly opted-in profiles.
7. Every authenticated request resolves its session to the owning user; client-supplied account IDs do not select account records for self-service operations.
8. Mutating browser requests require a configured Origin and a session-bound CSRF token where authenticated; cookies are HttpOnly, SameSite=Lax and Secure in production.
9. Token/session expiry is checked by API logic, independent of delayed TTL deletion.
10. Child list queries always filter by authenticated `parentUserId`; item reads, updates, and consent operations filter by both child `_id` and authenticated parent ID. A guessed or sibling-family child ID returns the same not-found response.
11. Child creation accepts only display name and optional broad age band; ownership and active status are server-assigned. Child updates accept only profile fields or active/archived state.
12. Child consent starts ungranted, is recorded as append-only history, and is scoped to both child and parent. Learning progress and attempt creation verify current learning-data consent.
13. Game-library mutation, subscription provisioning, and asset uploads require administrator authentication and CSRF validation; client fields cannot set publication state, subscription status, published versions, storage names, or creator identities.
14. Publishing creates a new immutable content snapshot. Answers and attempt scoring can target a retained version; result records store that resolved version.
15. Upload data must match an allowed detected file signature/structure and per-kind size limit. Files use generated names in a private directory outside the web app. Public media requests require an active asset referenced by a published game, and responses set `nosniff`, restrictive CSP, and `no-store`.
16. Asset deletion is refused if any draft or historical version references it. Deactivation and unavailable-file detection omit assets from game payloads so the frontend uses its default companion/audio behavior.
17. A parent needs a subscription whose start and expiry timestamps include the current server time to access protected game content, answers, saved attempts, or learning progress. The public trial remains unauthenticated and is never persisted.
18. Progress is child-specific, requires active-child ownership and current learning-data consent, and only advances from recorded attempt aggregates using the current path's configured threshold rule. Configured path ordering controls which incomplete activity is available; previously completed/available activities can be repeated.
19. Appointment creation requires an active child scoped to the authenticated parent, a currently public/approved specialist, and a slot validated from the specialist's current schedule. Appointment reads are scoped to either `parentUserId` or the assigned `specialistUserId`; only that specialist can decide a pending request.
20. Appointment amount, currency, duration, and time zone are immutable booking-time snapshots. The unique partial reservation index prevents overlapping live reservations. Only a pending request whose 48-hour deadline has not passed can be accepted or rejected; expired and rejected requests release their reservations but remain in history.
21. Only the assigned specialist can start/complete an accepted appointment. Session state transitions are one-way (`not_started` → `in_progress` → `completed`) and record server timestamps. Completion stores private notes separately from the parent-visible report; the parent view omits private notes, and the specialist view is restricted to their assigned appointment.
22. Video room access is participant-scoped and only eligible for confirmed appointments. Parents join 10 minutes early, specialists 15 minutes early, and both are blocked after the configured grace period; all values are server-enforced and environment-configurable. The Jitsi room identifier is generated using cryptographic randomness, stored on the appointment, and never included in public booking data. Public `meet.jit.si` does not enforce Haraf participant ownership; do not describe the room as private or participant-restricted.
23. Reports and CSV exports are administrator-only and aggregate learning data without child identifiers. Payment report totals distinguish submitted/reviewing requests, administrator-approved amounts, and rejected amounts; only approved requests count as confirmed.
24. Notification list/read operations are scoped to the current authenticated recipient; no API accepts a client-selected recipient ID.

## Remaining future product collections

Generated game-progress reports remain unimplemented. Jitsi room metadata is embedded in the appointment as described above. Administrator aggregate reports and recipient-scoped notifications are implemented. Appointment-linked educational reports and private specialist notes, manual payment review, subscription settings, specialist availability, appointments, and learning paths/progress are implemented as described above. Review provider-specific privacy and access-control invariants before changing the meeting schema.
