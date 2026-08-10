# Waterfront Reservations

Production-minded reservation-first MVP for **Waterfront Seafood & Cocktails** in Iloilo City. It gives authorized staff one operational workspace for availability, table/VIP/private-event bookings, guests, deposits, pencil confirmations, reminders, and audit history.

The application is a Next.js 16 App Router project with strict TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/RLS/Storage, Zod, Vitest, and Playwright.

## Business identity used

Public details were researched from the official [Waterfront Seafood & Cocktails website](https://waterfrontiloilo.com/waterfrontdining/) on 7 August 2026:

- Waterfront Seafood & Cocktails, part of Waterfront Hospitality Group
- One Riverside Complex, Gen. Luna St., Iloilo City
- Published opening hours: 10:00 AM–10:00 PM
- Mobile: +63 968 889 2282
- Landline as published: 335 022 606
- Email: info@waterfronthospitalitygroup.com
- Positioning: seafood and premium meats with waterfront views
- `public/waterfront-logo.png` is the official orange logo asset served by the business website

Public site information is brand/context only. Reservation rules come from the approved product specification; initial physical placement comes from the Waterfront floor-plan drawing supplied by management. Operating hours, table capacities, scale and contact details should still be confirmed before production.

## What is implemented

### Staff experience

- Responsive Today/service list with status, deposit, table, owner, occasion, and overdue-state visibility
- SevenRooms/OpenTable-inspired live floor-management workspace with reservation queue, service/date controls, visual table states, cover totals, table selection, seating actions, and tablet-friendly side-by-side navigation
- Draggable floor-layout editor with pointer/touch movement, T1/T2/T3 palette, 45° rotation, guarded removal, multi-select merging, saved combinations, group movement, local demo persistence and reference-layout restoration
- Availability search with committed/remaining Main Dining capacity
- Quick reservation form with booking type, time, duration, guest duplicate-ready contact fields, source, table request, deposit rules, deadline, and special requests
- Reservation drawer with lifecycle quick actions and activity timeline
- Day/week-style operations calendar
- Guest directory with normalized-contact model
- Internal notification centre for overdue holds, deposits, and confirmations
- Operational reports for booking volume, covers, confirmation, source, booking mix, and manually recorded deposits
- Configuration for capacity, threshold, durations, buffers, operating hours, and reference-derived table setup
- Persistent non-production banner in the credential-free demo
- Responsive navigation and mobile fallback

### Phase 2 public requests

- Mobile-first request flow at `/reserve/waterfront-seafood` for Main Dining, VIP Room, and whole-restaurant private events
- Four explicit steps: experience, schedule, guest details, and review, with the request-not-confirmation notice at every decision point
- Privacy-safe indicative availability; public responses never include capacity totals, table codes, reservations, guest identities, staff names, or conflict details
- High-entropy guest manage tokens with SHA-256 hashes as the persistence contract; the human reference is never authorization
- Secure status/self-service page supporting pending withdrawal, requested-information responses, alternative acceptance, and staff-reviewed cancellation/reschedule requests
- Staff **Public Requests** queue with unread/overdue metrics, filters, masked-contact previews, duplicate warnings, assignment, current-versus-submission availability, and full request provenance
- Staff actions for review, more information, alternatives, decline, duplicate closure, and atomic conflict-safe conversion
- Public-request operational funnel and response/conversion metrics kept separate from reservation covers and revenue
- Provider-neutral transactional-email boundary with an idempotent local development capture adapter
- Server validation, strict lengths, honeypot, completion-time heuristic, IP-window rate limit, contact/slot duplicate fingerprint, and submission idempotency
- Environment, outlet, request-type, and email launch gates; production intake stays off by default

### Phase 3 manual payments and messaging

- Manual GCash QR, BDO terminal, InstaPay, cash, other-bank, and manager-approved channel model; the app never receives or moves money
- Proof-required payment entry with JPEG/PNG/WebP/PDF allowlist, 5 MB limit, sanitized filenames, SHA-256 integrity/duplicate fingerprint, and private-storage contract
- Normalized lifecycle: draft → submitted for verification → verified/rejected, plus auditable void/refund/correction states
- Maker-checker queue: the recorder cannot verify the same transaction; emergency self-verification is a reasoned Group Administrator exception that requires secondary review
- Verification checklist, duplicate reference/proof warnings, overpayment blocking, rejection/correction history, and safe BDO last-four metadata only
- Integer-centavo required, draft, submitted/unverified, verified gross, refunded, verified-net, and outstanding balances
- Fully verified deposits create a **ready for manual confirmation** task but never confirm a reservation automatically
- Daily payment reconciliation by channel/state with separate preparer/reviewer, open exceptions, and controlled CSV behavior
- Versioned payment-channel configuration and privacy-safe guest instruction preview; no live financial account details are checked in
- Guest manage page shows only required, verified, outstanding, due-date, and reservation state—never proof, full references, staff names, or internal warnings
- Transactional template registry, manual copy/send acknowledgment, local email adapter, and optional consent-gated WhatsApp Cloud API boundary
- WhatsApp webhook signature verification and normalized delivery events; inbound content is ignored because this is not a messaging inbox

### Design system

The project-wide interface baseline is documented in [`docs/design-baseline.md`](docs/design-baseline.md). It uses a warm ivory canvas, white operational surfaces, Waterfront deep teal for primary actions, coral as a restrained brand accent, compact 10–12 px radii, semantic status badges, grouped role-aware navigation, restrained elevation, visible focus states, and reduced-motion support. Staff, authentication, recovery, and public booking surfaces all use the same semantic tokens while preserving the correct navigation model for their audience.

### Database and security

The Phase 1 foundation refinement is documented in [`docs/phase-1-foundation-refinement.md`](docs/phase-1-foundation-refinement.md). It adds an organization tenant above the existing venue/outlet boundary, database-backed atomic permissions and custom-capable role bundles, organization and venue memberships, expiring single-use invitation records, tenant booking sources, organization-level guest/contact ownership, alias preservation, append-only audit events, idempotency keys, centralized environment validation, redacted structured logs, request IDs, venue-aware time helpers, and CI/database verification. The compatibility migration deliberately retains the `outlets` name so the existing reservation, floor, payment, and CRM work remains intact.

`supabase/migrations/202608070001_initial_schema.sql` contains:

- Full outlet/resource, guest, reservation, table-combination, deposit/payment, notification, conflict, and audit schema
- Staff roles and explicit outlet assignments
- RLS enabled on every exposed operational table
- Private `payment-proofs` bucket with 5 MB MIME allowlist and permission checks
- Philippine mobile normalization and indexed normalized guest lookup
- Indexed reservation availability, status, notification, and audit queries
- Atomic `create_reservation_atomic(jsonb)` database function
- Per-outlet/local-date transaction lock to serialize concurrent last-capacity decisions
- Main Dining capacity, VIP capacity/duration/overlap/buffer, and whole-date private-event checks
- Large-party classification derived from the configured threshold
- Dedicated authorized override path requiring a meaningful reason, conflict snapshots, unresolved warnings, and audit records
- Private events create a local-date blackout and preserve affected reservations

`supabase/migrations/202608070002_phase_2_public_requests.sql` adds, without rewriting Phase 1 data:

- Disabled-by-default per-outlet public policy and management-confirmation gate
- Public request, immutable event timeline, hashed access token, guest change request, and transactional message records
- Queue, ownership, requested-date, normalized-contact, token-hash, duplicate, and idempotency indexes
- No anonymous table policies; public reads/writes must go through narrowly scoped server endpoints
- Outlet/role-scoped staff RLS for request PII, events, change requests, and delivery state
- `convert_public_request_atomic(uuid,jsonb)`, which row-locks the request, prevents double conversion, matches or creates a guest, and delegates availability/deposit/conflict enforcement to Phase 1 `create_reservation_atomic`
- Idempotent addition of the `Website` inquiry source

`supabase/migrations/202608070003_phase_3_manual_payment_control.sql` adds:

- Versioned, approval-gated payment channel configurations with protected details and private QR paths
- Backward-compatible `payments.workflow_status`; every historical Phase 1 payment maps to `draft`, not verified
- Dedicated private proof metadata, verification events, refunds, daily reconciliations, message templates, and channel consent
- Atomic record/review RPCs with proof gating, role/outlet checks, maker-checker separation, duplicate/overpayment controls, audit events, and no reservation auto-confirmation
- Replacement of the Phase 1 “recorded amount” trigger so only Phase 3 human-verified net payments count toward deposit requirements
- Transactional outbox delivery/fallback fields and private RLS policies for payment, proof, configuration, reconciliation, templates, and consent

`supabase/seed.sql` is idempotent and creates the launch outlet, Main Dining (60), VIP Room (24; 3-hour minimum; 4-hour default; 30-minute grace; 10-minute buffer), all inquiry sources, operating hours, a 10-person development threshold, and the supplied Waterfront reference placement: 9 T1, 18 T2 and 4 T3 tables. Table capacities are deliberately marked unconfirmed.

## Local setup

Requirements: Node.js 20+ and npm. Supabase CLI is required for local database integration work.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Use `http://localhost:3000/reserve/waterfront-seafood` for the Phase 2 staff preview. Local development is explicitly marked as a preview and uses fictional request data plus the local email capture adapter.

Without Supabase environment variables, the root route intentionally opens a fictional-data demo workspace. With credentials configured, `src/proxy.ts` refreshes Supabase sessions and sends unauthenticated requests to `/login`.

## Supabase setup

### Team roles and concept scope

Waterfront concepts use the existing `outlets` boundary. The application exposes four roles:

- **Superadmin** — group-wide control, including invitations, role changes, concept assignment, configuration, and member deactivation.
- **Owner** — group-wide, read-only visibility into operations and dashboards.
- **Manager** — operational and configuration access for one assigned concept.
- **Staff** — reservations, table service, floor visibility, and basic guest operations for one assigned concept.

Member removal is a soft deactivation so reservation ownership and audit history remain intact. A Superadmin cannot deactivate their own account, and the final active Superadmin cannot be removed. UI visibility is only an affordance: live authorization is rechecked in the server route and again through PostgreSQL RLS/functions.

Invitations use Supabase Auth from `src/app/api/admin/members`. Configure one server-only `SUPABASE_SECRET_KEY` (preferred) or legacy `SUPABASE_SERVICE_ROLE_KEY`; never prefix it with `NEXT_PUBLIC_` or expose it to client code. Set `SUPERADMIN_EMAILS` to the approved work email(s). When an allowlisted authenticated user has no profile, the server safely bootstraps that account as Superadmin on first login.

Password controls are available from the Team access directory. An active Superadmin can send a Supabase recovery email to any member with a work email, or generate a one-time temporary password for a member without an email; the temporary value is returned only to that authenticated Superadmin and is never written to the audit log. Every role can open Profile and change its own password after confirming the current password. Self-service recovery links return through `/auth/callback` and then the dedicated `/update-password` page; Superadmin-issued links use the same page's browser recovery flow. Add both the canonical `APP_URL/auth/callback` and `APP_URL/update-password` to Supabase Auth's allowed redirect URLs, and configure SMTP for production delivery.

1. Create a Supabase project in a region appropriate for the business.
2. Copy `.env.example` to `.env.local` and set the project URL and publishable key.
3. Never expose or prefix the service-role key with `NEXT_PUBLIC_`.
4. Link and apply the migration:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

For a local Supabase stack:

```bash
npx supabase start
npx supabase db reset
```

`db reset` applies migrations and `supabase/seed.sql`. Create staff users securely through Supabase Auth, then insert corresponding `staff_profiles` and `staff_outlet_assignments` records using an administrative server-side process. Do not seed real credentials.

The migration creates the private payment-proof bucket. Upload paths must start with the reservation UUID, for example `RESERVATION_UUID/proof-UNIQUE_NAME.pdf`. Generate short-lived signed URLs only after rechecking the user role and outlet assignment on the server.

## Data mutation contract

Normal reservation creation must call:

```ts
await supabase.rpc("create_reservation_atomic", { payload })
```

Do not replace it with a client-side availability check followed by a plain insert. The RPC takes a transaction-scoped advisory lock, rechecks live inventory, derives large-party classification, applies private-event closure rules, and writes the reservation/audit records together.

Every sensitive server action must validate with Zod, verify the Supabase user, recheck role/outlet access, and return only UI-safe fields. RLS is a second mandatory boundary, not a replacement for server authorization.

Public conversion must call:

```ts
await supabase.rpc("convert_public_request_atomic", {
  target_request: requestId,
  reservation_payload: reviewedReservationFields,
})
```

Never create a reservation, table assignment, VIP lock, or private-event blackout at public submission. The staff conversion RPC performs the current availability check and links the request only if Phase 1 accepts the reservation in the same transaction.

Manual payment recording and verification must use the reviewed server/RPC paths:

```ts
await supabase.rpc("record_manual_payment_atomic", { payload })
await supabase.rpc("review_manual_payment", {
  target_payment: paymentId,
  next_status: "verified",
  checklist,
  reason: null,
  emergency_override: false,
})
```

Do not insert/update a payment directly from the browser. Do not treat legacy `payments.status='recorded'`, an uploaded file, a message receipt, or a provider “accepted” response as verified money.

## Manual payment operating procedure

1. Staff confirms the reservation, deposit requirement, and approved active receiving channel.
2. The guest pays outside the application and sends proof through the existing human communication channel.
3. Reservations Staff records amount in integer centavos, transaction time, external reference, payer when known, safe receiving summary, and one proof for that transaction.
4. The server validates type/size/signature, stores the object privately under an unguessable path, computes SHA-256, and checks proof/reference duplicates.
5. Submission locks ordinary edits and places the claim in the verification queue. It still counts as zero toward the deposit.
6. A different authorized manager/accounting user reviews every checklist item and verifies or rejects with a reason.
7. Only verified net (`verified payments − verified refunds`) updates the payment requirement. Partial payments remain partial.
8. When outstanding reaches zero, staff receives a ready-for-confirmation task. Staff separately rechecks reservation rules and confirms manually.
9. Corrections create a linked replacement. Voids and refunds retain the original transaction and require explicit proof/review; nothing is hard-deleted.
10. A preparer closes the daily reconciliation and a different authorized reviewer completes it. Later corrections reopen/flag the day with a reason.

Proof files must never be public, placed in messages/exports/logs/analytics, or named with guest PII. Never store full card numbers, CVV, PIN, OTP, passwords, wallet credentials, or magnetic-stripe data. If sensitive content is uploaded, replace/redact through an audited new version; do not overwrite the original object silently.

## Phase 2 configuration and feature flags

Copy `.env.example` and keep these production values disabled until the management checklist is signed off:

```dotenv
NEXT_PUBLIC_PHASE2_PREVIEW=false
PHASE2_PUBLIC_BOOKING_ENABLED=false
TRANSACTIONAL_EMAIL_PROVIDER=disabled
```

The application gate stops new submissions in production unless `PHASE2_PUBLIC_BOOKING_ENABLED=true`. The database policy separately requires `public_booking_enabled=true` and `is_management_confirmed=true`. Disabling either gate must preserve existing staff records and guest manage links.

Policy rows own lead time, advance window, slot interval, party limit, per-request-type enablement, email requirement, guest actions, retention, duplicate window, response target, terms/privacy versions, and guest-facing instructions. The seeded 2-hour/90-day/30-minute values are placeholders, not approved operating policy.

## Transactional email

`src/lib/email-adapter.ts` defines the provider-neutral interface. Development uses `LocalCaptureEmailAdapter`; production remains suppressed unless an approved provider, verified domain, sender identity, and credentials are configured. A Resend adapter may be added behind the same interface after approval—never place its API key in a `NEXT_PUBLIC_` variable.

Every send uses a provider-neutral idempotency key. Template helpers HTML-escape guest content and exclude internal notes, conflicts, payment proof, staff metadata, and raw provider payloads. Delivery failure must update `transactional_messages`/create a manual-contact task but must never roll back a valid request or reservation conversion.

## WhatsApp Cloud API

WhatsApp is optional and disabled until Waterfront owns/configures a Meta business portfolio, WABA, registered business number, approved utility templates, consent/opt-out copy, system-user credential process, HTTPS webhook, and WABA subscription. `WHATSAPP_GRAPH_VERSION` is required configuration and is deliberately not hardcoded.

The server adapter sends only active approved templates to E.164 recipients with explicit transactional WhatsApp consent. The webhook verifies `X-Hub-Signature-256`, deduplicates normalized `sent`/`delivered`/`read`/`failed` events in the production outbox, and never treats API acceptance as delivery. Unconsented, unconfigured, suppressed, or permanently failed sends fall back to consented email or a manual-contact task. Inbound message content is not retained and no unified inbox is built.

Meta’s current official references should be rechecked before every rollout: [WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview), [Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api), [Webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks), and [Templates](https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates).

## WordPress linking

After soft-launch approval, add a normal HTTPS button on `www.waterfrontiloilo.com`:

```html
<a href="https://booking.waterfrontiloilo.com/reserve/waterfront-seafood">
  Request a table
</a>
```

Do not iframe the app for launch. Verify the booking subdomain certificate, DNS, CSP, privacy notice, analytics exclusions for `/reserve/manage/*`, and mobile focus/contrast behavior before publishing the button.

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Unit coverage includes Philippine mobile/email normalization, time overlap with buffers, Asia/Manila UTC-boundary dates, combined deposit rules, reminder scheduling/deduplication inputs, lifecycle transitions, and table-combination member locking.

Phase 2 unit coverage adds policy/slot generation, privacy-safe availability reduction, public lifecycle transitions, duplicate fingerprints, high-entropy token hashing, HTML-safe/idempotent email templates, and rate-window expiry.

Phase 3 unit coverage adds integer-centavo balance/refund math, partial/unverified separation, payment lifecycle and proof gating, channel-specific required fields, duplicate normalization/hash warnings, maker-checker and emergency overrides, overpayment blocking, payment-requirement derivation, manual confirmation eligibility, consent fallback, and monotonic delivery states.

The credential-free Playwright suite covers the core demo flow—availability through reservation creation—and verifies that Calendar, Guests, Reports, and Configuration are reachable. Database/RLS/concurrency tests should run against a disposable Supabase instance in CI because they require PostgreSQL/Auth/Storage services.

## Pre-production checklist

1. Verify the supplied T1/T2/T3 codes, physical scale, operational capacities and saved combinations against the on-site floor.
2. Confirm the large-party threshold (seeded as a development placeholder at 10).
3. Confirm Main Dining default duration and reset buffer.
4. Confirm operating hours; the public website currently publishes 10:00 AM–10:00 PM.
5. Enter each annual special service date and its deposit policy; never hardcode moving observances.
6. Confirm deposit amounts/due rules and accepted manual payment methods.
7. Confirm staff roles, outlet assignments, and proof-viewing permissions.
8. Create production users securely and test least-privilege RLS for every role.
9. Configure Vercel environment variables and Supabase production redirect URLs.
10. Run database concurrency/RLS tests and the complete quality suite against staging.
11. Confirm minimum lead time, advance window, slot interval, and party limits by request type.
12. Approve Main Dining, VIP Room, private-event, deposit, late-arrival, cancellation, privacy, and retention copy.
13. Name the response-time escalation owner and target; configure unresolved-request monitoring.
14. Select the transactional email provider, verified sending domain, sender identity, and credentials.
15. Decide whether Turnstile/CAPTCHA is required and which request types are enabled for soft launch.
16. Run anonymous enumeration, invalid/revoked token, idempotency, rate-limit, stale-availability, double-conversion, and email-failure tests against staging.
17. Keep `public_booking_enabled=false` and `PHASE2_PUBLIC_BOOKING_ENABLED=false` until all items above are approved.
18. Supply and approve exact GCash QR/account, BDO terminal, InstaPay bank, official receipt, and any other manual-channel details—never seed live values in code.
19. Name payment recorders, independent verifiers, backup verifier, reconciliation preparer/reviewer, and any Group Administrator allowed emergency override.
20. Approve proof quality/retention, duplicate exception, overpayment, void, correction, refund, cancellation, and forfeiture policies.
21. Approve guest payment instructions/terms versions and decide which messages are manual copy, email, or API-sent.
22. Complete Meta WABA/number ownership, approved utility templates, WhatsApp consent/opt-out wording, token ownership/rotation, webhook, and staff/test-recipient pilot before setting `WHATSAPP_ENABLED=true`.
23. Test private proof upload/view authorization, malware/signature strategy, restoration, concurrent verification, refund caps, reconciliation reopening, WhatsApp suppression/fallback, and message failure isolation in staging.

## Deployment

Deploy the app to Vercel and the database/auth/storage layer to Supabase. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to every Vercel environment. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and omit it unless an explicitly reviewed administrative server path requires it.

Run migrations before promoting an application build that depends on them. Use separate Supabase projects for development/staging/production, retain the visible demo/staging environment marker, configure backups, and verify payment-proof policies with real role assignments before launch.

Recommended Phase 2 rollout: local fictional preview → unadvertised staff preview → Main Dining soft launch → optional VIP/private-event expansion → WordPress button. Monitor submission failures, spam categories, first-response time, availability lost before conversion, conversion rate, change requests, and email failures daily during launch.

Rollback is non-destructive: set `PHASE2_PUBLIC_BOOKING_ENABLED=false`, then set the outlet `public_booking_enabled=false`. Confirm the public route shows the maintenance message, remove/disable the WordPress button, and leave migrations/data in place. Staff must retain queue access and guests must retain already-issued manage links. Do not roll back by dropping tables or deleting requests.

Phase 3 rollback is also non-destructive: disable every payment channel config, keep `WHATSAPP_ENABLED=false`, stop the message worker, and return to the documented manual external-payment log while preserving all recorded claims/proofs/audit events. Back up PostgreSQL and the private proof bucket before migration; test restoring both together. Never roll back by changing historical claims to verified, deleting proofs, dropping workflow columns, or reversing completed refunds.

## Phase 4 · Guest CRM, consent, and controlled marketing

Phase 4 extends the existing guest source of truth rather than creating a parallel contacts database:

- Searchable Guest 360 directory with canonical contact points, source/freshness labels, structured preferences/tags/important dates, service-note separation, and reservation-derived visit metrics
- Explainable exact-mobile/email duplicate suggestions, side-by-side dry run, manager reason, conservative consent precedence, inactive merge tombstone, and atomic audited merge RPC
- Append-only marketing consent by guest/contact/purpose/channel/scope/notice/evidence, with unknown legacy values excluded and transactional WhatsApp/email kept separate
- Suppression hierarchy for objection, unsubscribe, privacy restriction, hard bounce, complaint, invalid contact, manual suppression, scope, frequency, quiet hours, and duplicate recipient
- Mobile accountless preference center at `/preferences/[token]`, using the same random-token/SHA-256-hash contract as Phase 2, generic errors, no-store/no-referrer responses, rate limiting, idempotent withdrawal, and no reservation/payment/private-note disclosure
- Allowlisted segment builder that rejects arbitrary SQL, notes, payment/proof data, allergies, accessibility/health data, complaint content, and sensitive traits
- Immutable campaign/content/audience versions, creator-versus-approver control, exact exclusion summaries, isolated marketing recipients/events, `SKIP LOCKED` worker claims, send-time eligibility, idempotency, pause/cancel/dead-letter controls, and a marketing-only emergency stop
- Provider-neutral signed email webhook normalization with replay deduplication and out-of-order protection; raw provider bodies and contact values are not retained by the demo endpoint
- WhatsApp marketing remains a separately gated, approved-template-only future launch; it never falls back silently between channels

The Phase 4 migration is `supabase/migrations/20260807073006_phase_4_crm_consent_marketing.sql`. It adds explicit RLS and scoped capabilities to every new exposed table. Feature flags default off and `emergency_stop` defaults true. A valid code path is not production authorization.

Read the [compatibility/backfill report](docs/phase-4-compatibility-backfill.md) before applying the migration and use the [CRM/marketing operations runbook](docs/phase-4-operations-runbook.md) for consent, merge, campaign, incident, backup, and non-destructive rollback procedures.

### Phase 4 production gate

Do not enable production sending until Waterfront names an accountable owner and approves the exact marketing/privacy notice, outlet/brand/group scopes, acceptable evidence, retention, data-subject request process, provider/data-processing agreement, sender/reply-to identity, verified domain, SPF/DKIM/DMARC, webhook secret, frequency cap, quiet hours, approvers, tags/segment fields, tracking policy, bounce/complaint thresholds, export policy, and current Philippine privacy/legal review.

Recommended rollout: compatibility report and staging backup → read-only CRM pilot → trained CRM writes and low-risk merges → segment dry runs → internal allowlist tests → one small recently-consented email pilot → gradual expansion. WhatsApp marketing is a separate later pilot. A failed marketing stage must not interrupt reservations, public requests, payments, proofs, or transactional messages.

Phase 4 rollback is non-destructive: set every CRM/marketing environment and database flag false, keep the marketing emergency stop true, stop only marketing workers, and revoke only marketing provider credentials. Preserve guest aliases, consent/suppression evidence, audience snapshots, recipients, delivery events, privacy requests, and audit history. Keep transactional messaging operational.

## Deliberate limitations

- The checked-in guest/service data is fictional and exists only for an immediate UI demonstration.
- Public booking is request-to-book only: no instant confirmation, public table picker, online payment, SMS/social messaging, POS, freehand architectural/wall editor, automatic table assignment, or automatic hold expiration is implemented.
- The checked-in Phase 2 server store and local email capture are runnable demonstration adapters. Production must connect the provided Supabase migration, authenticated staff endpoints, durable rate limiting, and an approved external email provider.
- CAPTCHA/Turnstile is an integration boundary only; no paid service or production credentials were invented.
- Payment proof upload is fully interactive in the credential-free preview, but persists only in component memory. Production upload, signed preview, malware/file-signature validation, and durable hashing use the private Supabase contract and reviewed server paths.
- Live receiving account/QR details, external email, WhatsApp credentials, Meta templates, and API sending remain disabled until management approval and controlled pilots.
- Phase 4 production marketing, raw exports, frequency/quiet-hours policy, sender domain, and provider credentials are deliberately disabled. The in-memory CRM/campaign data and preference token are fictional demonstrations only.
- The UI demo state is in memory until a Supabase project is connected; the production data contract and database enforcement are provided in the migration.
- A full event-sales pipeline is intentionally out of scope. A private event is a reservation/whole-date closure record.
