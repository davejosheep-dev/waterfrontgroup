# Phase 4 compatibility and backfill report

Generated: 7 August 2026 · Outlet timezone: `Asia/Manila`

## Safety decision

Phase 4 is additive and production sending remains disabled. No live Supabase project or production guest dataset was connected during this implementation. The checked-in migration is therefore a reviewed migration contract, not evidence that production data was migrated. Run the inventory queries below in staging, review the counts with Waterfront's privacy owner, and only then promote the migration.

Unknown, absent, false-without-evidence, malformed, or legacy marketing consent is ineligible. Transactional email/WhatsApp permission is never copied into marketing consent.

## Phase 1–3 baseline recorded before changes

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript | Passed |
| Unit tests | 31 passed |
| End-to-end regressions | 12 passed |
| Production build | Passed |

## Existing model inventory

| Existing object | Phase 4 treatment |
| --- | --- |
| `guests` | Reused as the only guest source of truth; extended with preferred name, CRM status, merge tombstone, version, and freshness fields. |
| `guests.mobile_*`, `guests.email*` | Retained for dual-read validation. Backfilled into `guest_contact_points` as `unverified`; not marked verified merely because a value exists. |
| `guests.marketing_consent` | Deprecated for eligibility, retained during transition, and mapped only to an `unknown` evidence event. |
| `reservations` and status history | Remain authoritative for visits and metrics. Only `completed` counts as a visit. Deposits never become spend or revenue. |
| `public_booking_requests.marketing_consent` | Privacy/version/source metadata is retained, but the migration maps it to `unknown` until Waterfront approves a documented channel/scope/evidence policy. |
| `public_access_tokens` | Pattern reused: random tokens, SHA-256 hashes only, scoped purpose, revocation, expiry, and last-use tracking. |
| `transactional_messages` and adapters | Reused only at the low-level provider boundary. Marketing recipients/events have separate tables, states, idempotency, flags, and emergency stop. |
| `transactional_channel_consents` | Kept transactional. No row is promoted to marketing consent. |
| `audit_log` / `internal_notifications` | Reused for migration, merge, consent, suppression, campaign, provider-health, and privacy events. |
| `staff_profiles`, outlet assignments, RLS helpers | Preserved. Phase 4 adds explicit scoped capabilities rather than relying on hidden buttons or broad new role names. |

## Local demonstration inventory

The UI demonstration contains five active canonical profiles plus one reviewed duplicate scenario represented within those five records, nine contact points, one exact-mobile duplicate pair, one evidenced email opt-in, one legacy/unknown email consent, one complaint suppression, and one guest withdrawal. Only one demo email contact is eligible by consent controls. Production sending is still blocked because policy/provider gates are unset.

The Phase 2 in-memory queue contains four fictional requests; every seeded request has marketing consent off. These are demonstration values, not production backfill counts.

## Migration behavior

1. Creates all Phase 4 tables, explicit RLS, foreign-key/search/queue indexes, feature flags, scoped capabilities, a guarded merge RPC, and a `SKIP LOCKED` worker claim RPC.
2. Creates contact points from normalized guest columns with state `unverified`.
3. Generates explainable exact-mobile/email candidates without merging anyone.
4. Converts every legacy guest marketing boolean to an append-only `unknown` event.
5. Preserves Phase 2 notice/source evidence while keeping the current marketing state `unknown` pending an approved mapping policy.
6. Leaves Phase 3 transactional consent untouched.
7. Writes a migration audit summary and leaves every CRM/segment/send/export flag false; emergency stop remains true.

## Required staging inventory queries

Run before and after the migration and save the results with the release record:

```sql
select count(*) as guests,
       count(*) filter (where mobile_normalized is not null) as normalized_mobile,
       count(*) filter (where email_normalized is not null) as normalized_email,
       count(*) filter (where marketing_consent is true) as legacy_true,
       count(*) filter (where marketing_consent is false) as legacy_false,
       count(*) filter (where marketing_consent is null) as legacy_unknown
from public.guests;

select marketing_consent, privacy_notice_version, count(*)
from public.public_booking_requests
group by marketing_consent, privacy_notice_version
order by privacy_notice_version, marketing_consent;

select channel, status, count(*)
from public.transactional_channel_consents
group by channel, status
order by channel, status;

select channel, state, count(*) from public.guest_contact_points group by channel, state;
select confidence_class, status, count(*) from public.guest_identity_candidates group by confidence_class, status;
select purpose, channel, scope_type, scope_id, status, capture_source, count(*)
from public.communication_consents
group by purpose, channel, scope_type, scope_id, status, capture_source;
```

## Validation and promotion gate

- Compare old guest lookup against canonical contacts for sampled mobile/email searches.
- Confirm every contact belongs to the correct guest and shared family/corporate contacts remain representable.
- Confirm no contact was marked verified by backfill.
- Confirm every legacy and Phase 2 marketing row is `unknown` unless Waterfront separately approves and documents a migration policy.
- Confirm transactional WhatsApp consent appears nowhere in marketing consent.
- Confirm reservation, public-request, payment, proof, and message links did not change.
- Confirm outlet staff cannot read unrelated guest/contact/consent/campaign rows through tables, joins, or RPCs.
- Confirm one approved campaign version cannot contain the same normalized recipient twice.
- Run database advisors and the full integration/security suite against staging before enabling read-only CRM.

## Deliberately unresolved production decisions

Waterfront must approve consent wording and scopes, evidence rules, retention, data-subject request ownership, email provider/domain/SPF/DKIM/DMARC, sender identity, frequency caps, quiet hours, approval assignments, tags/segment fields, tracking, bounce/complaint thresholds, exports, processor agreements, and current Philippine legal/privacy review. WhatsApp marketing is a separate future launch.

