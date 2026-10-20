# HARF | حَرْف

Local starter scaffolding for the HARF Arabic-first learning platform.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+

## Install and run

Open two PowerShell terminals from the workspace root.

Terminal 1 — React client:

```powershell
$env:NODE_OPTIONS = '--max-old-space-size=512'
Set-Location .\harf\client
npm install
# Optional, only if you want to configure a non-default API URL:
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env and set VITE_API_BASE_URL, then restart Vite.
npm run dev
```

Terminal 2 — Express server:

```powershell
$env:NODE_OPTIONS = '--max-old-space-size=512'
Set-Location .\harf\server
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Keep your existing MONGODB_URI and add AUTH_JWT_SECRET locally.
# Generate and append a random 48-byte secret if one is not already configured:
if (-not (Select-String -Path .env -Pattern '^AUTH_JWT_SECRET=' -Quiet)) {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $secretBytes = New-Object byte[] 48
  $rng.GetBytes($secretBytes)
  $authSecret = [Convert]::ToBase64String($secretBytes)
  Add-Content .env "AUTH_JWT_SECRET=$authSecret"
  $rng.Dispose()
  Remove-Variable authSecret, secretBytes, rng
}
# Set CLIENT_ORIGIN=http://localhost:5173 in .env for local browser requests.
npm run dev
```

Keep your real MongoDB connection string and signing secret only in
`server/.env`; do not put them in the client or commit the file. The committed
`server/.env.example` contains placeholders only. `AUTH_JWT_SECRET` must be at
least 32 bytes. The local cookie is HttpOnly, SameSite=Lax, and not Secure on
HTTP localhost; in production it is Secure and uses the `__Host-` cookie prefix,
so production must use HTTPS.

The client is available at `http://localhost:5173`. The server health endpoint
is `http://localhost:3000/api/health`. It returns HTTP 200 when MongoDB is ready
and HTTP 503 with `"database": { "ready": false }` otherwise.

The client reads `VITE_API_BASE_URL` from `client/.env` and defaults to
`http://localhost:3000`. This variable is a public API URL only; never place
database credentials, JWT secrets, or other secrets in Vite environment
variables. `client/.env.example` is a placeholder/template for local setup.

## Backend authentication API

Public registration accepts only `name`, `email`, and `password`; it always
creates an active parent account. Passwords must be 12–72 UTF-8 bytes. Login
returns the safe profile and sets a one-hour, signed JWT in an HttpOnly cookie;
the token is never returned in the response. `/api/auth/me` verifies that
cookie and reloads the active user from MongoDB on each request. Logout clears
the cookie. Specialist/admin account provisioning is not part of this milestone.

Use a third PowerShell terminal from the workspace root for manual endpoint
checks while the apps are running:

```powershell
$api = 'http://localhost:3000'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$email = "harf-test-$([guid]::NewGuid().ToString('N'))@example.com"
$password = 'Local-test-password-123!'
$body = @{ name = 'HARF Test Parent'; email = $email; password = $password } | ConvertTo-Json

# Register a parent (201); the response contains no password hash.
Invoke-RestMethod "$api/api/auth/register" -Method Post -ContentType 'application/json' -Body $body

# Duplicate registration (409).
try { Invoke-RestMethod "$api/api/auth/register" -Method Post -ContentType 'application/json' -Body $body }
catch { $_.Exception.Response.StatusCode }

# Public attempts to assign admin or specialist roles are rejected (400).
foreach ($role in @('admin', 'specialist')) {
  $roleBody = @{ name = 'HARF Test'; email = "role-$role-$email"; password = $password; role = $role } | ConvertTo-Json
  try { Invoke-RestMethod "$api/api/auth/register" -Method Post -ContentType 'application/json' -Body $roleBody }
  catch { $_.Exception.Response.StatusCode }
}

# Valid login (200), retaining the HttpOnly cookie in this PowerShell session.
$loginBody = @{ email = $email.ToUpperInvariant(); password = $password } | ConvertTo-Json
Invoke-RestMethod "$api/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $session

# Invalid login returns 401 with the same generic credential error for unknown users.
$badLogin = @{ email = $email; password = 'wrong-password-123' } | ConvertTo-Json
try { Invoke-RestMethod "$api/api/auth/login" -Method Post -ContentType 'application/json' -Body $badLogin }
catch { $_.Exception.Response.StatusCode }

# Unauthenticated /me returns 401; authenticated /me returns the safe profile.
try { Invoke-RestMethod "$api/api/auth/me" }
catch { $_.Exception.Response.StatusCode }
Invoke-RestMethod "$api/api/auth/me" -WebSession $session

# Logout returns 204; the same session then receives 401 from /me.
Invoke-WebRequest "$api/api/auth/logout" -Method Post -WebSession $session
try { Invoke-RestMethod "$api/api/auth/me" -WebSession $session }
catch { $_.Exception.Response.StatusCode }

# Existing MongoDB health check should return HTTP 200 with database.ready=true.
Invoke-RestMethod "$api/api/health"
```

## Frontend authentication and parent dashboard

The React app uses the backend's HttpOnly cookie session with
`credentials: "include"`; the browser does not store passwords or auth tokens
in local or session storage. Local development should use the frontend origin
`http://localhost:5173`, matching the server's default `CLIENT_ORIGIN`. If you
change the client origin, update the server-side `CLIENT_ORIGIN` to that exact
origin and restart the server.

After starting both apps, verify the frontend flow in a browser:

1. Visit `http://localhost:5173/register`, create a parent account, and confirm
   the password confirmation and privacy checkbox are required.
2. Follow the success message to login. Try an incorrect password and confirm
   that the Arabic error appears without navigating to the dashboard.
3. Log in with the account, confirm the dashboard greets you by the returned
   profile name and shows the empty children state.
4. Refresh the dashboard; it should remain available while `/api/auth/me`
   confirms the cookie session.
5. Use “إضافة طفل” to open the child profile form. Enter a name and date of
   birth between the 18-month cutoff and the day before the 6-year cutoff, then
   save and confirm the new child appears in the dashboard list.
6. Edit a child and save the changes. Delete a child and confirm the browser
   asks before removal, then verify it disappears from the list.
7. Log out, then visit `/dashboard` directly; it should redirect to login.
8. In browser developer tools, check that no password/token is written to
   Local Storage or Session Storage. The `harf_session` cookie should be
   HttpOnly, so page JavaScript cannot read it.
9. Stop the backend briefly and try a login to confirm the client shows a
   clear connection error. Restart it afterward.

The protected “أطفالي” page loads its list from `GET /api/children`; it can be
opened from the parent dashboard navigation. The add/edit form submits only
`name` and `dateOfBirth` to the existing child API. Each child card includes
edit, confirmed delete, and “ابدأ الأنشطة” actions. The activity action opens a
placeholder child space populated from the ownership-checked
`GET /api/children/:id` response; activities are not available in this
milestone's frontend. The backend activity catalog and child-isolated session
API are documented below. Age and ownership are validated authoritatively by
the server; the form's date bounds are an additional convenience for the
parent. No photo upload, booking, or specialist features are included.

## Child profile API (Milestone 04A)

All `/api/children` endpoints require an authenticated parent cookie. Ownership
is derived from the verified session; request bodies cannot set `parentId`.
Responses expose only each child's `id`, `name`, `dateOfBirth`, `createdAt`,
and `updatedAt`. Dates use the UTC `YYYY-MM-DD` format.

The accepted age window is **18 months through 5 years 11 months**, calculated
by UTC calendar date on the day of the request: date of birth must be on or
before the 18-month cutoff, and strictly after the 6-year cutoff. Invalid
calendar dates, future dates, and dates outside this age window are rejected.
The model stores only name, date of birth, parent reference, and timestamps.
Photo URLs are not supported. Deletion currently hard-deletes the child and
returns HTTP 204; there are no child-related activity records or dependent
collections to preserve or cascade at this milestone.

| Method and path | Request body | Success response |
| --- | --- | --- |
| `POST /api/children` | `{"name":"Lina","dateOfBirth":"2022-04-15"}` | HTTP 201: `{"child":{"id":"<child-id>","name":"Lina","dateOfBirth":"2022-04-15","createdAt":"<timestamp>","updatedAt":"<timestamp>"}}` |
| `GET /api/children` | none | HTTP 200: `{"children":[{"id":"<child-id>","name":"Lina","dateOfBirth":"2022-04-15","createdAt":"<timestamp>","updatedAt":"<timestamp>"}]}` |
| `GET /api/children/:id` | none | HTTP 200: `{"child":{"id":"<child-id>","name":"Lina","dateOfBirth":"2022-04-15","createdAt":"<timestamp>","updatedAt":"<timestamp>"}}` |
| `PATCH /api/children/:id` | `{"name":"Lina A."}` and/or `{"dateOfBirth":"2022-04-15"}` | HTTP 200 with the updated child object in `{"child":...}` |
| `DELETE /api/children/:id` | none | HTTP 204, no response body |

Unexpected fields, including `parentId`, are rejected with HTTP 400. Missing,
malformed, or other-parent child IDs do not reveal private records; valid IDs
that are absent or belong to another parent return the same HTTP 404 response.
Unauthenticated requests receive HTTP 401; authenticated non-parent roles
receive HTTP 403.

Manual verification plan (use two different parent accounts and retain each
login cookie in a separate PowerShell web session):

1. Log in as Parent A and create two children using `POST /api/children`.
   Save the returned IDs.
2. `GET /api/children` and each `GET /api/children/:id`; confirm Parent A sees
   only the two safe child responses.
3. `PATCH` one child name or date of birth; confirm the changed safe profile.
4. Log in as Parent B in a separate session. Confirm its list is empty and
   `GET`, `PATCH`, and `DELETE` for each Parent A ID return 404.
5. As Parent B, create a child of its own; confirm Parent A's list does not
   include it and Parent A cannot retrieve, patch, or delete it.
6. As Parent A, delete one child; confirm HTTP 204 and subsequent retrieval is
   404. Child deletion is hard-delete; activity-session cleanup is not part of
   the child endpoint in Milestone 04A.
7. Call each method without a login cookie and confirm HTTP 401. If available,
   try an authenticated non-parent account and confirm HTTP 403.
8. Try a malformed ID, empty/invalid name, invalid date, future date, a date
   younger than 18 months, a date at least 6 years old, an empty patch, an
   unexpected field (including `parentId`), and malformed JSON. Confirm safe
   400 responses and no record changes.
9. Confirm `/api/health` still reports MongoDB readiness and `/api/auth/me`
   still returns the authenticated safe user profile.

## Activity foundation (Milestone 05A)

The activity API and session endpoints require an authenticated parent cookie.
Parent identity is always taken from the verified session; child ownership is
checked against that identity before session creation, history reads, and
updates. A session belongs to exactly one child, and every query is scoped to
both the parent and child. Session responses do not expose the internal
`parentId`.

The in-code catalog defines stable IDs for `picture-cards-audio`,
`sound-to-image`, and `scene-completion`. These are demo entries only, marked
`publicationStatus: "demo_pending_review"`; they are not clinically validated,
diagnostic, or treatment activities and require review by a qualified
speech-language specialist. The catalog has optional asset, instruction, item,
and mascot-expression/animation fields, but no asset URLs or media are included.
Its age suitability is 18 through 71 months. No activity interface is included
in this milestone.

| Method and path | Request body/query | Success response |
| --- | --- | --- |
| `GET /api/activities` | Optional `?type=picture-cards-audio`, `sound-to-image`, or `scene-completion` | HTTP 200: `{"activities":[{"id":"demo-picture-cards-audio","title":"بطاقات الصور والصوت","activityType":"picture-cards-audio","description":"...","ageSuitability":{"minMonths":18,"maxMonths":71},"availability":"available","publicationStatus":"demo_pending_review","assets":{},"instructions":[],"items":[]}]}` |
| `POST /api/children/:childId/activity-sessions` | `{"activityId":"demo-picture-cards-audio"}` | HTTP 201: `{"session":{"id":"<session-id>","childId":"<child-id>","activityId":"demo-picture-cards-audio","activityType":"picture-cards-audio","status":"in_progress","startedAt":"<timestamp>","createdAt":"<timestamp>","updatedAt":"<timestamp>"}}` |
| `GET /api/children/:childId/activity-sessions` | none | HTTP 200: `{"sessions":[{"id":"<session-id>","childId":"<child-id>","activityId":"demo-picture-cards-audio","activityType":"picture-cards-audio","status":"in_progress","startedAt":"<timestamp>","createdAt":"<timestamp>","updatedAt":"<timestamp>"}]}` |
| `PATCH /api/children/:childId/activity-sessions/:sessionId` | `{"status":"completed"}` | HTTP 200: `{"session":{"id":"<session-id>","childId":"<child-id>","activityId":"demo-picture-cards-audio","activityType":"picture-cards-audio","status":"completed","startedAt":"<timestamp>","completedAt":"<timestamp>","createdAt":"<timestamp>","updatedAt":"<timestamp>"}}` |

Session creation takes its activity type from the server catalog; clients cannot
set parent ID, child ID, activity type, timestamps, or outcomes. Invalid child
IDs, activity IDs/types, extra fields, and unsupported status updates are
rejected. Unowned or missing child/session records return 404 without exposing
other families' data. A completed session cannot be completed again and returns
HTTP 409. `in_progress` and `completed` are the statuses currently reachable
through the API; `abandoned` is reserved in the model for future lifecycle
handling. Sessions store only IDs, activity type, status, timestamps, and
parent/child references; there are no recordings, interaction traces, or
clinical scores.

Manual verification checklist (run with two distinct parent sessions):

1. Log in as Parent A and retrieve `GET /api/activities`; verify all three
   demo entries and their pending-review status. Filter by each supported type;
   an unknown type should return HTTP 400.
2. Create two children for Parent A. Start a session for each child using one
   of the listed stable activity IDs; verify HTTP 201 and separate `childId`
   values. Send an unknown activity ID, extra request fields, and a malformed
   child ID; verify safe 400/404 responses and no session is created.
3. Retrieve each child's history and verify each contains only its own session.
   Restart the server and retrieve the histories again to confirm MongoDB
   persistence.
4. Complete one in-progress session with `{"status":"completed"}`; verify the
   completion timestamp and status. Try an unsupported status and repeat
   completion; expect HTTP 400 and 409 respectively.
5. Log in as Parent B and try creating a session for Parent A's child, reading
   its history, and completing Parent A's session while changing the child ID.
   Verify these attempts return 404 and disclose no session data.
6. Call activity endpoints without authentication; verify HTTP 401. Confirm
   `/api/auth/me`, child list/create/edit/delete, `/api/health`, and the existing
   frontend routes remain functional.

No automated test framework is configured in the project; this checklist
requires manual execution against the configured MongoDB database.
