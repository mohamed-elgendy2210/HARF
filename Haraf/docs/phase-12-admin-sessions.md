# Phase 12 — Admin Sessions and Video Tests

The existing administrator dashboard now includes **إدارة الجلسات والاجتماعات**, with appointment monitoring and an independent video-service test. Booking remains in the existing appointment workflow.

## Confirmed appointments

- `GET /api/v1/admin/appointments` provides server-side search, date and status filters, sorting, pagination, and global counts for confirmed appointments.
- The default table view contains confirmed appointments; filters can include pending, rejected, and expired bookings without counting them as confirmed.
- Details show the booking and session lifecycle, the meeting creation time, and a safe provider error code when provisioning failed. Room names, join URLs, and credentials are never included.
- Administrators cannot join a parent/specialist room. A stored room is shown as scheduled or with its recorded lifecycle, not as proof the provider is currently reachable.
- `POST /api/v1/admin/appointments/:appointmentId/meeting/retry` only provisions a missing room on a future, accepted appointment. It does not replace an existing room or bypass the appointment's booking rules. The operation is audited and uses the existing notification service when provisioning succeeds.

## Independent Jitsi tests

An administrator starts a temporary test room using `POST /api/v1/admin/video-tests`. It does not create or alter an appointment or associate the test with a family or child. The default lifetime is 30 minutes and can be set with `VIDEO_TEST_LIFETIME_MINUTES` (5–60). Creation is limited to five tests per administrator per hour and five requests per 15 minutes per IP.

The panel loads the real configured Jitsi IFrame API, tracks provider-script loading, iframe initialization, connection events, local audio/video tracks, and participant presence. The administrator must manually confirm that the second participant received audio/video; local browser permission or a participant-joined event alone is not marked as a successful two-way test. The complete result is successful only when every required provider, connection, camera, microphone, and two-participant check has passed.

A second participant link contains a cryptographically random, one-use bearer token. The token is stored only as a SHA-256 digest, expires with the test, is consumed on access, and is additionally protected by administrator authentication, CSRF, and the test-ID route. It is not an appointment credential. Test history is administrator-only, paginated/filterable, and does not include room names, tokens, media, or recordings. Important creation, participant, result, end, and retry actions are written to the existing audit log.

## APIs

All endpoints below are mounted under `/api/v1/admin`; the existing admin router applies active-admin authentication, role checks, and CSRF protection to writes.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/appointments` | Filtered appointments and global confirmed-appointment statistics |
| `POST` | `/appointments/:appointmentId/meeting/retry` | Safe provisioning retry for an eligible appointment |
| `POST` | `/video-tests` | Create temporary independent test and first-participant access |
| `POST` | `/video-tests/:testId/second-participant/access` | Consume a one-use second-participant token |
| `PATCH` | `/video-tests/:testId/results` | Record automated and manual checks |
| `POST` | `/video-tests/:testId/end` | Finalize and persist the test outcome |
| `GET` | `/video-tests` | Filtered, paginated test history |

## Security and provider limitations

The test record stores a random Jitsi room name only so the test can be joined until expiry; history serialization never returns it. API authorization rejects test access from non-administrators. Test rooms are unrelated to private appointments.

The configured public `meet.jit.si` service does not enforce Haraf participant ownership, and deleting/expiring a local record cannot close or invalidate a public Jitsi room. A one-use second-participant link limits access through Haraf's endpoint, but **does not make the public room private** or prevent anyone who learns the room name from entering. Use an authenticated/self-hosted Jitsi deployment for stronger access control. No media capture, recording, or transcription is enabled.

Appointment cancellation is not a supported booking state in the current model. Meeting activity is not polled from Jitsi; the appointment list reports stored lifecycle signals and does not claim that a room is currently connected.

## Verification

- `npm test --workspace @harf/api` — 49 tests passed, including admin-only test creation, one-use second-participant access, results/history privacy, appointment monitoring, safe provisioning retry, and existing booking/session regressions.
- `npm run build --workspace @harf/web` — passed; Vite reports the existing advisory for the >500 kB main bundle.
- Real external Jitsi connectivity, camera/microphone hardware, separate-device two-way media, production CSP, and authenticated Jitsi deployments require browser and deployment testing.
