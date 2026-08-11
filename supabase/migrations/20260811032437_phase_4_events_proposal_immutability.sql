-- Issuance is editable only until the proposal is issued. The command that
-- accepts or supersedes an issued version is the one permitted lifecycle edge;
-- accepted/declined/superseded snapshots are immutable thereafter.
create or replace function private.prevent_immutable_event_proposal()
returns trigger language plpgsql as $$
begin
  if old.status in ('accepted','declined','superseded') then
    raise exception using errcode='55000',message='PROPOSAL_IMMUTABLE';
  end if;
  if old.status='issued' and (
    new.status not in ('accepted','declined','superseded')
    or new.event_id<>old.event_id
    or new.version<>old.version
    or new.subtotal<>old.subtotal
    or new.discount_total<>old.discount_total
    or new.tax_total<>old.tax_total
    or new.service_charge_total<>old.service_charge_total
    or new.total<>old.total
    or new.deposit_due<>old.deposit_due
    or new.currency<>old.currency
    or new.terms_snapshot<>old.terms_snapshot
  ) then
    raise exception using errcode='55000',message='PROPOSAL_IMMUTABLE';
  end if;
  return new;
end $$;
