create index if not exists inventory_holds_service_period_idx
  on public.inventory_holds(service_period_id)
  where service_period_id is not null;
