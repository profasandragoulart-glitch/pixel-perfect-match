create table if not exists public.open_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.open_finance_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'pluggy',
  account_id text not null,
  type text,
  subtype text,
  name text,
  number text,
  balance numeric,
  currency_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, account_id)
);

alter table public.open_finance_accounts enable row level security;

drop policy if exists "Users can view own open finance accounts" on public.open_finance_accounts;
create policy "Users can view own open finance accounts"
  on public.open_finance_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own open finance accounts" on public.open_finance_accounts;
create policy "Users can insert own open finance accounts"
  on public.open_finance_accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own open finance accounts" on public.open_finance_accounts;
create policy "Users can update own open finance accounts"
  on public.open_finance_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own open finance accounts" on public.open_finance_accounts;
create policy "Users can delete own open finance accounts"
  on public.open_finance_accounts for delete
  using (auth.uid() = user_id);

create index if not exists open_finance_accounts_user_id_idx
  on public.open_finance_accounts(user_id);

alter table public.transactions
  add column if not exists source text not null default 'manual',
  add column if not exists provider text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_account_id text;

create unique index if not exists transactions_provider_transaction_uidx
  on public.transactions(provider, provider_transaction_id)
  where provider is not null and provider_transaction_id is not null;

create index if not exists transactions_provider_account_idx
  on public.transactions(provider, provider_account_id);
