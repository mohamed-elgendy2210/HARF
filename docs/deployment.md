# Deployment Notes

## Status

No hosting provider, domain, TLS terminator, or production topology has been selected. The application is prepared to use configurable settings but is not a production deployment. Before launch, confirm the actual network path from client to proxy to API and review proxy trust, CORS, cookies, MongoDB connectivity, backups, monitoring, and TLS settings.

## Local development

1. Install Node.js 22.12 or newer and npm 10 or newer.
2. Copy `.env.example` to `.env`; do not commit `.env`.
3. Optionally start MongoDB locally and set `MONGODB_URI=mongodb://127.0.0.1:27017/harf`. The API can start without a database in development, but readiness remains 503 until one is connected.
4. Run `npm install`, then `npm run dev`.
5. Open the Vite URL printed by the development server. Local HTTP is supported for development only; use synthetic credentials/data and never submit real passwords, child records, payment evidence, or consultation information over plain HTTP.
6. Configure a test SMTP account in `.env` to exercise email verification and password recovery. Account APIs clearly return 503 if MongoDB is unavailable.
7. After MongoDB is running and `MONGODB_URI` is configured, provision the first administrator with `npm run admin:create --workspace @harf/api` in an interactive terminal. The password prompt does not echo input; no admin can be created over HTTP.

Vite uses the hostname/port from `APP_ORIGIN` and proxies same-origin `/api` requests to `VITE_DEV_API_TARGET`. It uses a strict port so it fails rather than silently switching to an origin not allowed by the API CORS list. Set `APP_ORIGIN`, `CLIENT_ORIGINS`, and `VITE_DEV_API_TARGET` consistently if local addresses change. The API URL is not embedded in page components.

For secure browser testing, set `APP_ORIGIN` and `CLIENT_ORIGINS` to the exact HTTPS origin, then provide both `VITE_HTTPS_KEY_FILE` and `VITE_HTTPS_CERT_FILE` in the untracked `.env` with paths to a trusted local certificate/key pair. Vite loads the files only in development server mode; the key must stay outside source control. Use a hostname covered by the certificate. Configure the API proxy target to the API/reverse-proxy URL used in that test. No certificate, private key, or self-signed trust bypass is included in the repository.

## Secure testing and production

- Terminate HTTPS at a reviewed deployment edge or run the API behind a TLS-capable server. This project does not invent certificate paths or a reverse-proxy configuration.
- Serve the browser application and API over HTTPS. Configure `APP_ORIGIN` and every comma-separated `CLIENT_ORIGINS` entry with exact HTTPS origins; production configuration rejects HTTP origins.
- For same-origin deployment, route `/api` to the API and leave `VITE_API_BASE_URL` empty. For a separate API origin, set `VITE_API_BASE_URL` to its HTTPS origin at frontend build time and explicitly allow the frontend HTTPS origin in `CLIENT_ORIGINS`.
- Do not redirect API HTTP requests inside Express. In production, non-health API requests over a request the app does not recognize as secure are rejected with a JSON error. This avoids proxy redirect loops and prevents treating an untrusted forwarded header as proof of HTTPS.
- The API trusts no proxy by default. Set `TRUST_PROXY` only to the actual trusted proxy address/subnet or a reviewed Express preset/hop count for the known topology. Avoid broad `true` trust and unreviewed hop counts. If TLS is terminated by a proxy and trust is not configured correctly, secure production requests will be rejected; this is intentional fail-closed behavior.
- Production Helmet HSTS behavior is enabled. In development, HSTS is disabled to avoid persisting HTTPS-only policy for a local HTTP workflow.
- Authentication uses an HttpOnly, Secure, SameSite=Lax session cookie in production (`__Host-harf.sid`) and a non-Secure local cookie in development. The session value is random and only its SHA-256 digest is stored. The deployment should keep the browser and API same-site; a cross-site deployment would require an explicit cookie policy review because SameSite=Lax will not support cross-site credentialed fetches.
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and optional paired SMTP user/password values in the deployment secret manager. Do not commit real credentials. Production startup requires SMTP host/from.
- The same SMTP transport sends optional generic notification email. In-app notifications remain persisted if delivery fails; review API logs and provider telemetry for delivery failures. Notification messages must not include child details, payment receipts, private specialist notes, or consultation reports.
- The current auth rate limiters use an in-memory store. This is suitable only for a single API process; configure a shared store before running multiple instances, or limits will not be consistent across instances/restarts.
- The API creates account, child, attempt, and game-library indexes during startup while production Mongoose auto-indexing is disabled. Verify index creation and MongoDB permissions in the deployment environment before accepting registrations.
- Set `MEDIA_STORAGE_DIR` to a durable private directory outside the web server's static/public paths. The default is a sibling `harf-media` directory outside the workspace. Back up files together with MongoDB metadata, restrict filesystem access, and test restore and capacity monitoring before publishing assets.
- Keep MongoDB on a private network and use deployment secret storage for its URI. Production startup requires `MONGODB_URI`; automatic Mongoose index creation is disabled in production.
- Live meetings use Jitsi's IFrame API. `JITSI_DOMAIN` defaults to `meet.jit.si`; `JITSI_PARENT_EARLY_JOIN_MINUTES` (10), `JITSI_SPECIALIST_EARLY_JOIN_MINUTES` (15), and `JITSI_POST_APPOINTMENT_GRACE_MINUTES` (30) are enforced by the API. A room name is opaque and unpredictable, but the public Jitsi service does not guarantee participant-only access or authenticate a caller against the Haraf booking. Do not treat the default public service as sufficient for confidential production consultations. Review child-data processing, geography, retention, cost, and terms; for actual access control, configure an authenticated/self-hosted Jitsi deployment and implement/verify its server-side JWT/moderator setup before launch. No signing key is exposed to the browser and JWT issuance is not implemented here.
- Admin video tests use `VIDEO_TEST_LIFETIME_MINUTES` (default 30, allowed 5–60). Expiry prevents further Haraf API access and consumes temporary second-participant tokens; it cannot close a room on public Jitsi. The one-use link is only an additional application-level gate, not provider room authentication. Test records do not contain media or recordings.
- The frontend loads `https://<JITSI_DOMAIN>/external_api.js` only after a participant explicitly chooses to join. Configure the deployed frontend Content Security Policy to allow the selected Jitsi host in `script-src` and `frame-src`, then test the exact deployment's required WebSocket/media connection hosts under `connect-src` and related directives. Do not broadly weaken CSP. Serve both the app and API over HTTPS; Jitsi camera/microphone permissions are requested only after the user enters the meeting flow.
- Set `HOST` to an address reachable by the deployment's routing layer (often `0.0.0.0` in a container) only after the runtime/network boundary is defined. The default binds to loopback.
- Configure TLS certificates, certificate renewal, security group/firewall rules, backups, retention, and monitoring according to the selected host. None are provisioned in this repository.

## Health endpoints

- `GET /api/v1/health/live` is a lightweight liveness check and can be accessed over HTTP.
- `GET /api/v1/health/ready` returns 200 only when MongoDB reports a connected state; otherwise it returns 503.
- Health endpoints intentionally expose only service/readiness status and no URI, hostname, credentials, or diagnostic stack traces.

## Open deployment decisions

- Hosting provider, public domain, TLS termination, and the proxy's source address.
- Production origin(s), frontend/API topology, and Vite build-time API URL.
- Whether the frontend/API share a site, plus production cookie policy and SMTP provider.
- A shared rate-limit store and distributed deployment policy.
- Private media storage, backup/restore, and upload-rate-limit store.
- Production MongoDB service, network policy, backups, and restoration objectives.
- Secret manager, logging/monitoring, and incident-response ownership.
- Applicable child-data jurisdiction, consent, retention, and deletion policy before accepting real user data.
- Public Jitsi participant-access limitations and provider-specific child-data/privacy, data residency, cost, CSP, and operational review.
