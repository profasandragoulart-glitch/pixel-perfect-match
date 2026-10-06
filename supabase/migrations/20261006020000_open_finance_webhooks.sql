create table if not exists public.open_finance_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'pluggy',
  event_id text not null,
  event text not null,
  item_id text,
  transaction_ids jsonb,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed')),
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (provider, event_id)
);

alter table public.open_finance_webhook_events enable row level security;

drop policy if exists "No direct access to Open Finance webhook events" on public.open_finance_webhook_events;

create index if not exists open_finance_webhook_events_status_idx
  on public.open_finance_webhook_events(status, received_at);

create index if not exists open_finance_webhook_events_item_idx
  on public.open_finance_webhook_events(item_id);
