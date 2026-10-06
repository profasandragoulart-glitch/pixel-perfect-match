create table if not exists public.open_finance_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'pluggy',
  item_id text not null,
  institution_name text,
  status text,
  execution_status text,
  last_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, item_id)
);

alter table public.open_finance_connections enable row level security;

drop policy if exists "Users can view own open finance connections" on public.open_finance_connections;
create policy "Users can view own open finance connections"
  on public.open_finance_connections for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own open finance connections" on public.open_finance_connections;
create policy "Users can insert own open finance connections"
  on public.open_finance_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own open finance connections" on public.open_finance_connections;
create policy "Users can update own open finance connections"
  on public.open_finance_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own open finance connections" on public.open_finance_connections;
create policy "Users can delete own open finance connections"
  on public.open_finance_connections for delete
  using (auth.uid() = user_id);

create index if not exists open_finance_connections_user_id_idx
  on public.open_finance_connections(user_id);
