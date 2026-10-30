# Phase 5 — Administrator Game Library and Media Management

## Delivered

- Added administrator-only management of the supported `multiple-choice` game template, using the existing `/admin` dashboard and Harf Arabic RTL visual system.
- Administrators can create games, edit drafts, add/remove questions and answers, assign supported media to allow-listed companion events, publish a version, unpublish a game, and select a currently published public trial.
- Publishing creates an immutable `GameVersion` snapshot. Draft edits do not change the live published content, and historical answer checks and parent attempts can resolve the version played.
- The MongoDB library seeds the existing three built-in games without overwriting existing definitions. Library collections and indexes are explicitly initialized when the API connects to MongoDB.
- Added an asset library with upload, metadata, active/inactive state, image/audio/GIF preview, protected Lottie JSON preview, assignment controls, and guarded deletion. Existing published games use the companion fallback for absent, inactive, or missing files.
- Uploaded files use random UUID storage names under `MEDIA_STORAGE_DIR`, outside the application tree. The default is a sibling `harf-media` folder. The server creates the folder with restrictive permissions and writes files with mode `0600`; uploaded client filenames are never used as paths. The directory is not mounted as a static route.
- Public media is returned only when the asset is active and referenced by a published game version. Historical versions for currently published games remain eligible to serve older loaded clients. Admin preview uses a protected route. Responses include `X-Content-Type-Options: nosniff`, restrictive CSP, and `Cache-Control: private, no-store`.
- Sensitive game and asset mutations are recorded in the existing audit-event collection with minimal metadata.

## File validation limits

MIME declarations and original extensions are not trusted. `file-type` detects file signatures, and Lottie JSON is structurally validated. Multipart requests allow one file and at most 10 MB before the stricter per-kind checks.

| Asset kind | Supported formats | Maximum |
|---|---|---:|
| Image | PNG, JPEG, WebP | 5 MB |
| Audio | MP3, WAV, OGG | 10 MB |
| Animation | GIF; constrained Lottie JSON | 3 MB |

Lottie JSON rejects external assets/references and expressions and bounds dimensions, frame rate, duration, nesting, and node count. It is not executed as JavaScript. **The current game client does not include a Lottie renderer:** Lottie uploads can be stored, previewed as JSON, and assigned, but do not animate in the player; the default companion presentation is used. GIF animation and raster/audio previews are supported.

## API surface

All paths below are under `/api/v1`:

- `GET /admin/games` — list the library and currently selected trial.
- `POST /admin/games` — create a validated draft.
- `PATCH /admin/games/:gameId` — update a draft.
- `POST /admin/games/:gameId/publish` — publish a new immutable version.
- `POST /admin/games/:gameId/unpublish` — unpublish, except the selected trial.
- `PUT /admin/games/trial` — select a published trial.
- `GET /admin/assets` — list asset metadata.
- `POST /admin/assets` — administrator-authenticated, CSRF-protected multipart upload; limited to 30 requests per 15 minutes per rate-limit key.
- `GET /admin/assets/:assetId/preview` — protected asset preview.
- `PATCH /admin/assets/:assetId` — activate or deactivate an asset.
- `DELETE /admin/assets/:assetId` — delete only if no draft or published version references it.
- `GET /media/:assetId` — serve an active asset referenced by a currently published game.
- Existing `GET /games`, `GET /games/:gameId`, answer, and attempt endpoints now read the Mongo-backed published catalog when available.

## Verification

The API tests exercise unauthorized administrator access, misleading MIME/extension rejection, SVG and invalid animation rejection, safe Lottie acceptance, image and JSON preview headers, asset assignment, public trial selection, publishing and editing without changing live content, historical answer/attempt scoring, asset access across versions, protected deletion, deactivation and missing-file fallback, unpublishing, and per-kind oversize rejection. Mongoose schema tests inspect the library's declared indexes.

Final verification performed:

```powershell
npm test
npm run build
npm audit --omit=dev
```

- `npm test` — 24 passed, 0 failed. Includes the administrator media/library integration checks described above.
- `npm run build` — passed. Vite reports the existing main-chunk warning (about 522 KB minified); the logo/brand asset remains about 1.2 MB.
- `npm audit --omit=dev` — 0 production dependency vulnerabilities reported.
- `npm run dev` — API connected to MongoDB, created/checked startup indexes, and initialized the three built-in game definitions/trial setting if absent; `GET /api/v1/health/ready` returned `200` with database `connected`. No administrative CRUD or user/account records were changed.
- Vite dev-origin smoke check — with a synthetic `APP_ORIGIN=http://localhost:5176`, Vite listened on that exact origin and `GET /admin` returned `200`. The development server now fails instead of silently choosing a port whose origin the API may reject.

The automated API integration tests use an in-memory repository and temporary on-disk files. They verify route and storage behavior but do not establish live MongoDB CRUD persistence, production storage durability, backup/restore, or multi-instance behavior. A browser page loaded the protected `/admin` route and correctly displayed the admin sign-in screen; a logged-in visual CRUD workflow was not completed in the browser.

## Remaining risks and boundaries

- Lottie rendering in the game client is not implemented. Until a safe, maintained renderer is selected and reviewed, GIF is the only animation format visibly played by the frontend.
- Asset bytes are local filesystem data. Configure durable private storage, backups, restore procedures, capacity monitoring, and metadata/file consistency for deployment. These operations have not been tested against a production storage provider.
- Historical game-version references prevent deletion even when no longer current. Deactivation is the supported safe alternative; a reviewed retention and purge policy is still needed.
- The upload and authentication rate limits use the process-local default store. They are not shared across instances or restarts; deploy a shared rate-limit store before horizontal scaling.
- MongoDB live integration and startup index creation were not verified in the automated in-memory integration tests.
- The current template does not add subscription entitlement enforcement, learning paths, reports, payments, specialist appointments, or video consultations. These remain later phases.

Stop at Phase 5. Do not start Phase 6 until approved.
