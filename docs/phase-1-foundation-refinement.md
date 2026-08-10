# Phase 1 foundation refinement

This refinement introduces the organization tenant above the existing `outlets` table. `outlets` remains the compatibility name for Waterfront venues/concepts so later reservation, floor, payment, and CRM migrations do not need a destructive rewrite.

## Architecture decisions

### Identifier and tenant strategy

- Internal identifiers remain UUIDs; append-only audit history uses a monotonic bigint identity.
- `organizations` is the organization root. Venues, guests, reservations, canonical guest contacts, memberships, roles, sources, audit events, and idempotency keys carry an explicit organization boundary.
- Composite foreign keys on `(organization_id, id)` prevent reservations and contacts from connecting records owned by different organizations.
- Routine deletion is not exposed. Organizations, venues, roles, and memberships use active/inactive states.

### Authorization and RLS

- Roles are stored permission bundles. Atomic permission keys are stable strings such as `venues.manage`, `staff.invite`, and `guests.merge`.
- Effective access requires an active staff profile, active organization membership, a role permission, and—when venue scoped—an active matching venue membership.
- The four existing Waterfront UI roles map to database templates without weakening their current behavior: Superadmin → organization owner permissions, Owner → read-only analyst, Manager → venue manager, Staff → host.
- New public-schema tables have RLS enabled. Grants and policies are separate: invitation tokens and idempotency records receive no browser grants, while scoped directory data is selectable only through membership policies.
- The existing secret-key administrative routes still recheck the live Superadmin role. They now synchronize organization and venue memberships whenever a member is created, changed, or deactivated.

### Time zones

- Instants remain UTC `timestamptz`; venue operating days use explicit `date` values.
- Every venue stores an IANA time-zone name. The application time helper requires the time zone instead of assuming Manila.
- The seed includes the real Iloilo context and a clearly marked Sydney training venue to exercise UTC-boundary and daylight-saving behavior. The training venue is not a public business listing.

### Guest identity and merging

- Guests and canonical contact points are organization-scoped.
- Contact display values and normalized values are retained separately.
- A trigger blocks a new active normalized contact from being silently attached to another active guest in the same organization. Existing historical duplicates are not destroyed; they remain candidates for the reviewed merge workflow.
- `guest_aliases` preserves prior names, external references, and merged identifiers. Phase 4 merge events remain the detailed reversible audit record.

### Elevated server access and logs

- Publishable credentials are the only Supabase values read by browser code. Secret/service credentials are parsed only by the server environment module.
- Elevated clients remain limited to administrative identity workflows; routine access continues through signed-in-user clients plus RLS.
- `/api/v1/health` returns readiness and a correlation ID without returning configuration values.
- Structured logging redacts credential, contact, note, proof, and payment-shaped fields before serialization. Business audit records store redacted summaries, never passwords or raw invitation tokens.

## Migration and verification

The additive migration is `supabase/migrations/20260810090000_phase_1_foundation_refinement.sql`. Apply it before code that writes foundation memberships.

Local database verification (requires Docker and the Supabase CLI):

```bash
npx supabase db reset
npx supabase test db
```

Application verification:

```bash
npm run verify
npm run test:e2e
```

## Session revocation procedure

Deactivation immediately marks the legacy staff profile plus all foundation memberships inactive. Every server authorization and RLS helper rechecks those database states, so an existing browser session cannot continue to access business data. If a credential is suspected to be compromised, the Superadmin should also delete or ban the Auth user through the controlled administrative process to revoke refresh capability, then record the incident reference in the audit system.
