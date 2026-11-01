# HARF — Master Project Requirements

## Product

Harf (حرف) is an Arabic-first platform for children's interactive language and communication learning. It will offer progressive, non-diagnostic learning paths, parent-visible progress, monthly subscriptions, and optional appointments with administrator-approved speech-language specialists. Booking a specialist is never required to use the games.

## Brand and existing experience

- Treat `Branding/Landing page.png` and `Branding/Colors with logo.png` as the authoritative visual references.
- Preserve the existing Harf logo, Arabic identity, colors, visual character, RTL layout, and working behavior when app source exists. Do not replace or redesign working pages without approval.
- Brand colors: primary blue `#3B4CCA`, teal `#22C7A7`, purple `#8B6CF6`, sun yellow `#FFC857`, coral `#FF7B7B`, sky blue `#E8F4FF`, and soft beige `#F9FAFB`.
- When only reference images exist, build a React page guided by those images and clearly do not claim source preservation.

## Product capabilities (later phases)

- Visitors can see the public site and approved specialist directory and use one free trial game.
- Parents have separate child profiles and can access only their own accounts and authorized children. Parent and specialist accounts require administrator approval.
- Specialists can access only records they are authorized to manage. Administrative access to private consultation content is restricted.
- Active subscribers can play published games. An administrator configures the monthly price and payment instructions; the landing page displays the current price.
- Initial payments are manual via Vodafone Cash and InstaPay. Receipt upload never activates a subscription; only an authorized administrator confirms payment. Subscription charges and appointment charges are distinct. Expired subscription history is retained.
- Build reusable game interactions for instructions, questions, answers, feedback, progress, audio, animation, and completion. Admins can manage game content and supported media without code changes for content changes or existing templates. New interaction types may require development.
- Use friendly recurring cartoon animal companions with welcome, idle, thinking, listening, correct-answer celebration, encouragement, and completion states. Static image uploads do not create animations.
- Record each child's game attempts and outcomes. Transparent configurable rules recommend practice, gradual progression, and returning to earlier activities; never diagnose or make unsupported claims from scores.
- Parents may optionally request appointments with approved specialists. Specialists manage availability and accept/reject requests. Pending requests expire after 48 hours and release their slots. Prevent concurrent double booking.
- Secure video consultation is limited to authorized participants and confirmed appointments. Do not record by default, keep provider secrets out of the frontend, and do not claim an integration is operational before provider evaluation and configuration.
- Provide notifications, sensitive-action audit logs, consent and privacy controls, child-data access restrictions, and documented retention policies.

## Technical and security requirements

- Use React, Node.js with Express, MongoDB, and REST APIs unless an approved technical decision changes this.
- Separate client, routes, controllers/services, models, validation, authorization, file handling, and configuration as the application grows.
- Enforce role and object-level permissions on the backend for every protected API/resource.
- Implement secure password hashing, authentication, logout, verification, and recovery in the approved authentication phase.
- Validate input; use safe database queries; address NoSQL injection, XSS, CSRF where applicable, IDOR, open redirects, rate limits, CORS, security headers, secure cookies, trusted proxies, safe errors, and redacted logs.
- Store secrets only in environment configuration. `.env.example` contains placeholders and non-secret local-development defaults only.
- Validate uploads, limit formats/sizes, store safely, and prevent uploaded code from executing in the browser.
- Support HTTP for local development and controlled testing and HTTPS for secure testing/production. Use configurable origins/API URLs. Production authentication and sensitive data/actions require HTTPS; do not weaken controls to permit production HTTP. Configure proxy trust and cookies for the real deployment topology and avoid redirect loops/mixed content.
- Evaluate dependency and deployment configuration. Do not claim a vulnerability is fixed or a test passed unless verified.

## Data, documentation, and delivery

- Design and review MongoDB collections, indexes, and consistency rules before implementing dependent features.
- Maintain `README.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/database-schema.md`, `docs/security.md`, `docs/deployment.md`, `.env.example`, and phase completion/remaining-work records.
- Develop incrementally by approved phase. Inspect first, preserve existing behavior, implement only the current phase, verify integration, review security-sensitive changes, document evidence/unresolved questions, then stop for approval.
- Do not build the entire platform in one step. Phase 1 is the application foundation and visual identity. Authentication and product features require later approval.
- Clearly distinguish verified repository evidence from assumptions and unresolved decisions.
