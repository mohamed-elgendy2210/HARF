# Administrator Dashboard

## Current functionality

- The dedicated `/admin` frontend route authenticates using the existing HttpOnly session and only renders the dashboard for an active, email-verified administrator.
- A visitor can log in at `/admin`; a non-administrator account is shown an access-denied state. Hiding or showing the dashboard is only UX: every account-list and state-change API independently enforces administrator authorization.
- The overview shows summary counts derived from the account list returned by the API, pending-account previews, and links to filtered account lists.
- Account management searches the loaded parent and specialist records, filters by role, approval state, or suspension, and shows email verification and specialist profile completeness.
- Administrators can approve/reject accounts and suspend/reactivate accounts. State-changing actions require a confirmation and use existing server-side CSRF, role, validation, audit, and session-invalidation controls.
- The administrator-management section lists admin accounts and allows an active administrator to create another admin with a unique email and a 12-character-minimum initial password, or delete another admin. The API prevents self-deletion and deletion of the last admin, revokes sessions and tokens for removed admins, and audits changes. Use unique temporary passwords and share them only through a secure channel.
- The game-library section selects exactly four published games as public trials. The landing page displays those games, and the API grants visitor access only to the selected games. Existing single-trial settings are migrated while retaining the legacy admin endpoint.
- The existing game-library editor also creates spatial-relationship drafts, selects scene media, lays out and sizes movable/reference objects, configures levels/instructions/target regions and hints, and previews scenes. Publishing validates spatial assets and placement configuration; published content can be assigned through the existing learning-path editor.
- The subscription and payment section configures the monthly EGP price and enabled Vodafone Cash/InstaPay instructions, shows recent parent payment requests, opens private receipt files through an administrator-only route, and records approve/reject decisions. Approval requires manual verification outside Harf and is explicit in the confirmation flow.
- The reports section provides date-filtered aggregate reports and CSV downloads for registration/approval, specialist categories, game usage, learning-path completion, subscription periods, payment states, appointment/session statuses, and audit-event counts. Child identifiers and consultation content are excluded.
- The notifications section shows only notifications addressed to the signed-in administrator. Parents and specialists have the same recipient-scoped inbox in their own dashboards.
- The sessions-and-meetings section monitors appointments with server-side search/filter/pagination, displays provisioning and recorded lifecycle states, and retries only missing rooms for future confirmed appointments. It does not reveal room credentials or allow administrators to join parent/specialist meetings.
- The video-test tab creates a temporary standalone Jitsi test room, provides one-use second-participant access, records provider/connection/device checks and manual two-way-media confirmation, and stores filterable results in a separate collection. It creates no appointment or child record.
- The account API is currently capped at 100 records. The UI discloses this limitation; counts are for the loaded result, not a global aggregate.

## Not included yet

Appointment booking decisions remain with each approved specialist on `/specialist`; the admin dashboard has read-only appointment monitoring plus narrowly scoped room provisioning for missing rooms. It cannot change booking decisions or join private sessions. Detailed audit-record browsing and account/payment pagination are not implemented. Aggregate reports contain actual stored data and do not display fabricated reports or financial values.

## Security boundary

`/admin` is a client route and is not an authorization boundary. Protected data and state changes remain in the Express admin routes. Do not rely on the role check in React. The API also prevents administrator self-suspension and revokes sessions when an account is suspended or rejected.
