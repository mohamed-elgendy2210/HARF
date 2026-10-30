# Phase 11 — Live Jitsi Sessions

## Status

The existing appointment workflow now supports live Jitsi meetings. Appointment approval, ownership, notification, report, and session lifecycle logic remain in the existing appointment system; no replacement booking model or notification system was introduced.

The default provider is the public `meet.jit.si` service. The integration connects to real Jitsi rooms, but public Jitsi does **not** guarantee that only the booked parent and specialist can join. A random room name is not participant authentication. Do not promise confidential or participant-restricted meetings without a reviewed authenticated/self-hosted Jitsi deployment.

## Existing workflow extended

- Approved specialists publish existing availability; parents continue to request existing appointment slots.
- The assigned specialist accepts or rejects a pending appointment using the existing decision API.
- On acceptance, the API conditionally associates one embedded meeting record with the confirmed appointment using an atomic MongoDB update, a cryptographically generated 256-bit opaque room name, and a unique partial MongoDB index. Acceptance and room association are separate idempotent writes so a retry can recover if the process stops between them.
- Repeated approval requests do not create another room or duplicate ready notifications. If the appointment was accepted but room association previously failed, a future accepted appointment can safely retry association.
- Past appointments without a meeting are not backfilled. A future accepted legacy appointment without meeting details can receive a room only after an authorized join request is within its allowed window.
- A confirmed appointment remains confirmed if the provider or network fails. Leaving the IFrame, browser closure, or a connection interruption does not complete the appointment.

Meeting lifecycle is embedded independently on the appointment (`scheduled`, `live`, `ended`, `cancelled`, `failed`). The current application has no appointment cancellation/rescheduling workflow, so cancellation/reschedule notifications and room invalidation are not implemented. Existing appointment statuses were not expanded.

## Backend and API

- `POST /api/v1/appointments/:appointmentId/decision` still accepts/rejects the booking. Acceptance associates the meeting and notifies both participants through the existing notification service.
- `POST /api/v1/appointments/:appointmentId/video-access` authenticates the parent/specialist, checks appointment ownership/assignment, accepted status, meeting lifecycle, and server-side join times, then returns only the Jitsi domain and room name (no-store). The endpoint is CSRF-protected and rate-limited.
- `POST /api/v1/appointments/:appointmentId/session/start` remains assigned-specialist-only and records a server timestamp when Jitsi reports that the specialist joined.
- `POST /api/v1/appointments/:appointmentId/session/complete` remains the existing completion/report workflow and marks an associated meeting ended.
- Appointment list/detail serializers expose meeting status/availability and join-window times only; they never include the room name or meeting object.
- Admin room-provisioning failures now retain a bounded provider error code for the monitoring dashboard. Admins can retry only a missing room on a future confirmed booking; they cannot access appointment participant join credentials. See [Phase 12](./phase-12-admin-sessions.md).
- Added the `meeting` subdocument and unique partial `appointments_unique_video_room` index. Existing records are unchanged. The existing startup `ensureAppointmentIndexes()` creates the additive index; no destructive migration is required. Review MongoDB index permissions and confirm index creation in each deployment before enabling booking traffic.

## Frontend

- Added a reusable RTL pre-join and Jitsi IFrame interface, shared by the existing parent and specialist dashboards.
- The external Jitsi API script loads only after the user explicitly clicks to join. The in-app pre-join screen explains the meeting, displays the other participant and scheduled time, and warns about public Jitsi access limitations.
- Audio and video start muted; users can enable them through Jitsi controls. No recording/transcription controls are exposed or enabled.
- The interface reports loading, connection, camera/microphone permission, interruption, and failure states; allows retry/leave; and disposes the IFrame and event listeners on unmount.
- The therapist can end/document the session through the existing session completion/report endpoint. Parent-facing reports continue to require current report consent. The parent sees the session lifecycle/timestamps but never private specialist notes.

## Configuration and deployment

Backend environment variables (defaults are in `.env.example`):

| Variable | Default | Description |
|---|---:|---|
| `JITSI_DOMAIN` | `meet.jit.si` | Jitsi hostname only; no scheme, port, or path |
| `JITSI_PARENT_EARLY_JOIN_MINUTES` | `10` | Parent join opening time before appointment start |
| `JITSI_SPECIALIST_EARLY_JOIN_MINUTES` | `15` | Assigned specialist join opening time |
| `JITSI_POST_APPOINTMENT_GRACE_MINUTES` | `30` | Last allowed join time after scheduled end |

Join times are evaluated by the API using UTC instants; the frontend formats them in the appointment's configured time zone. Restart/redeploy the API when changing backend variables.

The web host must allow the selected Jitsi hostname in `script-src` and `frame-src`. Test the target server's exact WebSocket/media dependencies under `connect-src` and related CSP directives; do not broadly weaken CSP. Use HTTPS in production and explicitly configure browser camera/microphone policy for the selected origin.

No Jitsi JWT secret, moderator password, or provider credential is required by this public-server adapter or exposed to the client. A JWT/authenticated deployment is **not** implemented; do not supply secrets to Vite. For participant enforcement, configure Jitsi authentication/guest policy, implement server-side short-lived participant/moderator tokens, and verify issuer/audience/room claims and guest moderation before production use.

## Security and privacy

- Booking ownership/assigned-specialist checks are server-side on every video access.
- Parent join opens 10 minutes early; assigned specialist 15 minutes early; both are blocked after the configured grace period. Direct API calls receive the same enforcement.
- Opaque room IDs use 32 cryptographic random bytes and contain no appointment/user/child identifier.
- Room names and join URLs are excluded from normal appointment GET/list responses and notifications. The one authorized response is private/no-store.
- In-app/email notifications reuse the existing service and contain appointment time and a Haraf dashboard reference, not a public Jitsi URL.
- Unexpected disconnection and closing the browser do not complete the appointment. No media capture, recording, or transcription is implemented.
- `meet.jit.si` does not authenticate Haraf participants or guarantee that the room is limited to booking participants. Anyone who obtains the room name may be able to join; the random name only reduces guessability, not access rights.

## Existing workflow limits

The repository has no appointment cancellation or rescheduling APIs. Consequently, this change does not invent a separate cancellation/rescheduling experience or claim to invalidate rescheduled/cancelled rooms. Define and implement those existing appointment business rules before relying on meeting records for cancelled/rescheduled bookings.

There is no admin UI for deployment-only Jitsi configuration. Provider host and join windows remain environment-managed; the API does not expose secrets through admin settings.

## Verification

- `npm test --workspace @harf/api` — passed: 48 tests, including meeting creation/idempotent approval notifications, unique room index, room-name non-disclosure, participant ownership, join-window enforcement, same-room access for both authorized users, lifecycle timestamps, and private report behavior.
- `npm run build --workspace @harf/web` — passed. Vite emitted its existing advisory that the main bundle exceeds 500 kB.
- `node --check` on the changed API service/configuration modules — passed.
- Real external Jitsi connectivity, actual camera/microphone permissions, mobile behavior, production CSP, JWT/moderator mode, and provider privacy/data residency were not tested in this environment.

## Remaining deployment decisions

1. Complete child-data privacy, data-processing, jurisdiction, geography, retention, cost, and terms review for the selected Jitsi host.
2. Use a properly authenticated/self-hosted Jitsi deployment if booking-participant access enforcement is required; implement and validate short-lived JWT/moderator authentication server-side.
3. Configure and browser-test the deployment CSP, HTTPS, camera/microphone permissions, firewall/media connectivity, and all required Jitsi domains.
4. Define cancellation, rescheduling, no-show, and room invalidation behavior in the existing booking workflow.
5. Test browser joins, device permission failures, interrupted/reconnected calls, and concurrent/retried approval under the actual production topology.
