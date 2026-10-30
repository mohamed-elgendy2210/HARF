# Spatial relationships game

The game-library template `spatial-relationships` adds the child activity **فين المكان؟** to the existing `/games/:gameId` player. It reuses the authenticated parent flow, active subscription requirement, learning-path assignment, media library, mascot, and owner-scoped game-attempt history; it creates no separate account, child, path, or progress collection.

## Authoring and publishing

1. In `/admin`, open **مكتبة الألعاب** and create a draft with the **العلاقات المكانية** activity type.
2. Select the draft, set its Arabic title and description, and use the scene editor to select image assets, place/resize objects, and mark movable versus static objects. Upload images or audio in the existing **مكتبة الوسائط** tab first.
3. Configure the level (1–5), difficulty, Arabic instruction per step, optional audio, relationship, reference object(s), target rectangle, and normalized tolerance. Reorder or add steps for multi-instruction activities. The editor previews the scene; drag objects there to adjust their initial positions.
4. Save the draft while content is in progress. Publishing validates the scene and relationships, image/audio asset availability, object references, and that each step has at least one valid placement. An instruction audio file is optional because the player uses the project's Arabic browser speech fallback when supported.
5. Add the published game to a learning path in the existing learning-path editor. A game remains subject to existing account, subscription, child ownership, assignment, and learning-data consent checks. The public trial selection can also include a published spatial activity, and anonymous trial progress is not persisted.

Each scene uses coordinates from 0 to 1000 for object bounds and target rectangles, with an explicit aspect ratio. The layout scales with its container. The current editor supports rectangular target areas; front/behind uses configured scene layers as well as visual stacking.

## Interaction and validation

The player uses Pointer Events and pointer capture for mouse, pen, and touch. The dragged object keeps its pointer offset, stays above other objects, and is clamped to the scene. The scene disables touch gestures only inside its interaction area. A child can also select the movable object and tap a destination; keyboard users can select an object and reposition it with arrow keys before pressing Enter.

The server validates the final normalized top-left position against the movable object's configured width/height, the target rectangle, relationship, target object(s), tolerance, and depth layer. Placement is never accepted just because objects overlap. Invalid placements leave the object available for another attempt. The default graduated assistance encourages a retry, replays the instruction on a later error, then highlights the target and can show a non-completing example. Administrators can adjust or disable the hint thresholds.

## Persistence and APIs

- Admin content uses the existing `/api/v1/admin/games` draft/publish APIs and media endpoints. Versions remain immutable.
- The existing `/api/v1/games/:gameId/answer` endpoint accepts spatial session, placement, replay, and hint events. The server checks placements and records owner-scoped short-lived receipts.
- The existing `/api/v1/games/:gameId/attempts` endpoint accepts completion only after a correct server-validated placement for every step. Scores and time are computed from server records; client-provided answer totals are ignored for this template.
- `gameAttempts.spatialProgress` records level/concepts, server start/completion times, instruction and correct-placement counts, incorrect attempts, replays, hint types, completion percentage, and time. The existing parent attempt history displays these educational metrics. No diagnostic or clinical interpretation is generated.

## Verification and limitations

`npm test --workspace @harf/api` covers placement geometry for inside/outside, above, front/behind, next-to, and between; strict content references; server-scored progress; and required spatial media at publish. `npm run build --workspace @harf/web` verifies the player and editor production bundle.

Automated browser testing with actual mouse/touch devices, screen rotation, audio playback, and assistive technology was not available in this implementation environment. The editor currently configures rectangular regions (not polygon/circle geometry), allows one reference scene per instruction (or two for “between”), and supports ordered sequential steps. Exercise the completed scene on desktop and a touch device before assigning it broadly.
