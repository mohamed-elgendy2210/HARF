# Phase 2 — Authentication and Account Approval

## Scope

Implement secure parent/specialist account lifecycle, administrator account approval, current-route authorization, and frontend/backend integration within the existing React/Express/MongoDB architecture. No Phase 3 product features were started.

## Implemented

- Parent and specialist registration with strict input validation. Client requests cannot assign roles, approval/account/subscription status, or permissions.
- Scrypt password hashing; login and logout; opaque server-side sessions; session-bound CSRF checks; email verification and resend; password recovery/reset.
- Account states for email verification, admin approval/rejection, and active/suspended status. Pending accounts cannot access admin/protected account operations. Rejection and suspension revoke existing sessions.
- Administrator-only review, approval/rejection, suspension/reactivation, first-admin CLI bootstrap, and minimal audit events. Admin targets are restricted to parent/specialist accounts.
- Specialist self-service profile editing and explicit public-listing opt-in. The public directory exposes only complete profiles for verified, approved, active specialists.
- React account modal for signup/login/recovery/status, specialist profile management, and administrator account review. Existing landing-page structure and Harf brand styling remain intact.
- MongoDB models, indexes, repository methods, and consistency rules for users, sessions, one-time auth tokens, and audit events.
- SMTP environment configuration, production HTTPS enforcement, secure cookie settings, rate limits, restrictive Origin/CSRF checks, safe errors/logging, and explicit 503 behavior when MongoDB is unavailable.
- Updated README, architecture, requirements, deployment, security, schema, and phase-completion documentation.

## Verification

Environment: Node.js `v24.18.0`, npm `12.0.2`.

- `npm test` — **21 tests passed, 0 failed** (run after final code changes).
- `npm run build` — **passed** (Vite production build).
- `npm audit` — **0 vulnerabilities reported**.
- Browser smoke check — the branded landing page rendered, the login dialog opened with expected fields, and the signup form rendered its required name/email/password inputs. The API correctly displayed a temporary-unavailable message because MongoDB is not running; account submit/email delivery was not attempted.
- Auth tests use an in-memory repository; MongoDB index shape and model declarations are checked, but a real MongoDB service was unavailable and no production database/index creation was exercised.
- SMTP delivery and complete browser-based email workflows were not tested because no SMTP provider/credentials were configured.

## Remaining work and unresolved risks

- Configure and test a real MongoDB instance and a test SMTP provider before accepting accounts.
- Configure a shared rate-limit store before running multiple API instances.
- Confirm same-site frontend/API deployment for the current SameSite=Lax cookie policy; evaluate separately if cross-site.
- Review production proxy/TLS topology, secrets handling, monitoring, and database backup/index permissions.
- Decide the administrator MFA, additional-admin provisioning, and recovery process before production.
- Child profiles, consent/privacy controls, games, learning paths, payments/subscriptions, media, appointments, consultations, notifications, and their authorization/schema remain future work.
- Apply jurisdiction-specific child-data rules and approved retention/deletion schedules before storing child or consultation data.

## Phase boundary

Phase 2 is complete for implementation scope and local verification. Stop here; do not begin Phase 3 until the user approves it.
