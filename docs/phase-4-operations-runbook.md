# Phase 4 CRM and marketing operations runbook

## Consent capture and withdrawal

1. Confirm the guest, contact point, channel, Waterfront scope, notice version, and capture source.
2. A grant requires an explicit guest action plus stable notice and evidence hashes. Never infer consent from a reservation, contact value, payment, or conversation.
3. Record a withdrawal, objection, complaint, or hard bounce immediately. This creates append-only evidence and a suppression where required.
4. Do not edit history. A later opt-in creates a new evidence event; serious suppressions require privacy/admin review.
5. Transactional reservation/payment messages stay separate and must not contain promotional content.

## Duplicate review and merge

1. Open the duplicate queue and compare names, every contact, sources, reservations, safe payment summaries, consents, suppressions, notes, and privacy requests.
2. Choose the survivor, resolve conflicts, enter a meaningful reason, and review the dry-run mapping.
3. Execute once. The RPC locks both profiles in ID order, preserves the losing profile as a tombstone, repoints operational links, and writes immutable audit/merge records.
4. Withdrawal/suppression wins over grant; unknown never becomes granted.
5. Do not blanket-roll back a completed merge. Use privacy-administrator correction after reviewing the event's reversible mapping.

## Segment and campaign approval

1. Build only with allowlisted structured filters. Restricted fields, notes, payment data, and raw SQL are rejected.
2. Review dynamic estimate, exact count, sample, freshness, and every exclusion code.
3. Create an immutable content version and send tests only to the internal allowlist. Tests never become guest engagement.
4. A separate authorized approver reviews content, sender, segment version, exact snapshot, exclusions, schedule, timezone, unsubscribe, tracking, and provider warnings.
5. Any content/audience/channel/sender/schedule change invalidates approval.
6. At dispatch, recheck guest/contact state, exact consent scope, suppression, campaign state, frequency, quiet hours, emergency stop, and recipient uniqueness.

## Scheduling, pause, retries, and dead letters

- The worker claims rows with `FOR UPDATE SKIP LOCKED`; every recipient/version/channel has an idempotency key.
- Provider acceptance is not delivery. Record normalized events separately and tolerate duplicates/out-of-order webhooks.
- Retry transient failures with capped exponential backoff and jitter. Never retry permanent invalid, opt-out, policy, complaint, or template failures.
- Pause stops unclaimed/unsent work. Provider-accepted messages cannot be recalled.
- Cancellation preserves history. Dead letters require a reasoned manual review; never copy recipient PII into tickets or logs.

## Unsubscribe, bounce, and complaint response

- One-click unsubscribe is immediate for all unsent messages in scope and never cancels transactional reservations.
- Hard bounce, complaint, invalid address, objection, and privacy restriction suppress subsequent marketing.
- Provider webhook signatures are checked against the raw body, replayed event IDs are deduplicated, and only minimal normalized metadata is retained.
- Opens/clicks, if later approved, must be labeled provider-reported and cannot be used as sole evidence of behavior.

## Emergency stop and incident response

1. Set the outlet database `emergency_stop=true` and environment `MARKETING_EMERGENCY_STOP=true`.
2. Pause scheduled/sending campaigns and stop marketing workers. Do not stop transactional workers.
3. If credential compromise is suspected, revoke/rotate the marketing provider key and webhook secret; do not rotate transactional credentials unless affected.
4. Preserve queue, delivery, consent, suppression, and audit evidence. Do not delete or rewrite events.
5. Assess affected guests/scopes, provider state, duplicate sends, unsubscribe failures, and whether privacy/security escalation is required.
6. Resume only after root cause, corrective tests, named owner approval, and a small internal/pilot validation.

## Backup and restore

- Back up PostgreSQL before migration and before enabling a send stage. Consent, suppression, merge, campaign, delivery, privacy, and audit tables are a single integrity set.
- Restore into an isolated staging project, verify migration checksums, RLS, contact/guest links, current consent derivation, suppression counts, and recipient uniqueness.
- Never restore marketing tables alone over newer reservation/guest state without a reviewed reconciliation plan.

## Non-destructive rollback

1. Disable all Phase 4 feature flags; keep emergency stop true.
2. Stop marketing workers and revoke provider credentials if needed.
3. Keep CRM tables, consent/suppression history, merges, audience snapshots, recipients, and delivery evidence.
4. Preserve the preference center for already-issued tokens where policy requires continued withdrawal access.
5. Reservations, public requests, payments, proofs, and transactional messaging continue independently.

