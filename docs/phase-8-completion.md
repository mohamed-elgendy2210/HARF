# Phase 8 — Optional Specialist Appointments

## Status

Implemented in the existing React/Vite, Express, and MongoDB/Mongoose architecture. Appointment booking is optional and is separate from subscription access.

## Implemented

- Approved specialists manage their own IANA time zone, EGP appointment price, duration, weekly schedule, and date-specific schedule exceptions.
- Public specialist listings include only active, verified, approved specialists with complete professional profiles and explicit directory opt-in. Availability responses contain bookable slots and the current price/duration.
- Parents can browse specialists and availability, select one of their active children, request a slot, and review their appointment history.
- The API validates the selected child against the authenticated parent, confirms the specialist remains publicly approved, and rechecks the schedule and reserved slots before creating a request.
- Specialists can review pending requests, accept or reject requests assigned to them, and see their appointment history. Appointment detail/list access is scoped to the owning parent or assigned specialist; unrelated parents/specialists and administrators cannot read records.
- Booking snapshots the specialist's price, currency, duration, and time zone. Later schedule/price edits do not change existing appointments.
- Pending requests expire 48 hours after creation. Reads and decisions trigger due expiry checks, and a background worker checks every 60 seconds. Rejection and expiry release reservations without deleting appointment history.
- A MongoDB unique partial multikey index reserves every 15-minute interval touched by a pending or accepted appointment. Competing overlapping bookings cannot both be inserted, including concurrent submissions.
- Appointment booking does not require or grant a subscription. No video, consultation note, diagnosis, recording, or appointment payment processing was added.
- Parent and specialist interfaces use the existing Harf identity and responsive Arabic RTL patterns. The administrator dashboard does not expose private appointment records.

## API and database changes

Collections:

- `specialistAvailabilities`: one record per specialist containing time zone, price/duration, weekly windows, and date exceptions. Unique index: `availability_by_specialist`.
- `appointments`: participant/child links, UTC schedule and booking-time terms, status/timestamps, and reservation buckets. Indexes include `appointments_no_overlapping_reserved_slots`, parent history, specialist history, and pending-expiry lookup.

Routes:

- `GET /api/v1/directory/specialists`
- `GET /api/v1/directory/specialists/:specialistId/availability?from=...&days=...`
- `GET /api/v1/specialist/availability`
- `PUT /api/v1/specialist/availability`
- `POST /api/v1/appointments`
- `GET /api/v1/appointments`
- `GET /api/v1/appointments/:appointmentId`
- `POST /api/v1/appointments/:appointmentId/decision`

The appointment list is bounded to 100 records; pagination is not implemented. Appointment creation is rate-limited to 10 requests per IP per 15 minutes using the existing in-memory limiter.

## Verification

- `node --test --test-name-pattern="specialist schedules reserve"` — passed after adding tests for weekly schedule overrides/closures, cross-family child rejection, concurrent overlap prevention, snapshot preservation, decisions, slot release, and 48-hour expiration.
- `npm test` — passed: 26 tests, 0 failures.
- `npm run build` — passed. Vite reports the existing main JavaScript chunk is 552.76 kB (over the 500 kB advisory threshold); it is a warning, not a build failure.
- A local MongoDB smoke check initialized the appointment indexes and confirmed that two concurrent overlapping reservation inserts produce one winner and one duplicate-key rejection; releasing the reservation allows a subsequent booking.
- No browser end-to-end appointment flow or full MongoDB-backed API scenario was run.

## Unresolved policies and operational limits

- Parents currently cannot cancel a request or accepted appointment. Cancellation windows, late arrival, no-show handling, refunds, rescheduling, and appointment charge collection need product decisions before those workflows are introduced.
- A specialist's price is displayed and recorded as an immutable booking snapshot, but Harf does not collect appointment charges. Appointment payment is not part of subscription payment.
- Video consultations remain unconfigured. Phase 9 adds session execution, private notes, and parent-visible educational reports; see [Phase 9 completion](./phase-9-completion.md).
- Expiration is normally processed within 60 seconds after the 48-hour deadline.
- The request rate limiter is process-local and needs shared storage for coordinated limits across multiple API instances.
- Availability windows use the specialist's configured IANA time zone. Nonexistent daylight-saving local times are skipped; ambiguous fall-back times have not been explicitly specified or verified.
- Appointment histories are capped at 100 records without pagination.

Phase 8 stops here; Phase 9 has not started.
