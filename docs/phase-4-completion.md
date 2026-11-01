# Phase 4 — Educational Game Framework

## Implemented

- Added the `/games` catalog and `/games/:gameId` player routes. The landing-page primary action now opens the free trial directly; a parent can also start a game from a child's profile in `/dashboard`.
- Built a reusable Arabic RTL multiple-choice game experience with instruction and completion views, answer selection, server-checked feedback, accessible progress, duration tracking, optional speech, and reusable animal companion states.
- Connected the three existing built-in games: `first-letter-trial`, `word-sounds`, and `word-match`.
- The free trial and its answer checks work without an account or MongoDB. Answer choices/results remain in memory in the page and are not submitted for persistence.
- Parent-only game content is protected by the API for verified, approved, active parent accounts. The game page loads only the signed-in parent's active children and requires the selected child's current `learning_data` consent before starting a game whose result will be saved.
- Completed parent attempts use the existing server-scored `GameAttempt` model. Only owner ID, child ID, game/version, aggregate score, duration, and completion time are stored. Raw answer selections are not persisted. Existing child history remains owner-scoped and paginated.
- The new answer-check endpoint verifies one answer at a time without persistence. It reveals correctness only after a selection; the final saved score is recomputed by the server.
- Game feedback is educational and encouraging; completion explicitly states that a result is not a diagnosis or medical assessment.
- Optional Arabic browser speech is initiated only by a user pressing an audio button. The page remains usable if speech synthesis is unavailable. Companion animations honor `prefers-reduced-motion`; layout supports mobile and keyboard interaction.

## API and data

- `GET /api/v1/games` — list built-in game metadata.
- `GET /api/v1/games/:gameId` — public trial content or approved-parent game content.
- `POST /api/v1/games/:gameId/answer` — validate and score a single answer without storing it. Trial checks are public; parent-game checks require an approved parent.
- `POST /api/v1/games/:gameId/attempts` — store a server-scored child attempt after authentication, CSRF, ownership, active-profile, and learning-consent checks.
- `GET /api/v1/children/:childId/game-attempts` — existing owner-scoped, paginated history.

No MongoDB schema migration was needed; parent attempts use the existing `GameAttempt` collection/index. Anonymous trial responses add no records.

## Verification

- `npm test` — 23 passed, 0 failed. Includes public trial access without persistence, answer validation, rejection of anonymous access to parent games, parent attempt consent/CSRF/ownership checks, and aggregate scoring.
- `npm run build` — passed. The game page is lazy-loaded as its own 24.38 KB chunk. Vite still reports the existing main JavaScript chunk-size warning; the main chunk is 521.74 KB after minification.
- Browser smoke check on the running Vite/API development servers:
  - Completed the free trial using two correct answers and one incorrect answer; the completion view showed the verified **2 of 3** result and stated that no personal result was saved.
  - Completed a mocked approved-parent playthrough; confirmed the submitted attempt contained the child ID, answer selections, and duration, used the session CSRF token, and displayed the server response's 4 of 4 score.
  - At a 375px viewport, `/games` displayed all three games with no horizontal overflow; the trial link on the landing page was visible.
  - Under `prefers-reduced-motion`, the companion animation used one `0.01ms` iteration; the trial view also had no horizontal overflow at 375px.
- Parent browser playthrough was mocked; live MongoDB persistence was not exercised. API test repositories are in-memory. Real-browser speech synthesis was not verified.

## Remaining work / phase boundary

- Subscription status/expiration and active-subscription enforcement do not yet exist. Parent-game authorization in Phase 4 checks account approval and learning consent, not subscription entitlement; do not treat these games as subscription-gated until the subscription phase implements the server-side entitlement check.
- Game catalog content is currently code-defined. Administrator game/media management and safe media uploads are not implemented.
- Learning paths, activity recommendations, reporting, payment workflows, and specialist appointments remain out of scope.
- The real database, SMTP, HTTPS deployment topology, and retention/legal consent policy have not been verified by this phase.

Stop here before Phase 5.
