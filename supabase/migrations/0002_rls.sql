-- DimeBag-Bets — Row Level Security (CLAUDE.md §3, §6).
--
-- THE guarantee: a player can READ only their own rows, and can NEVER write the
-- money tables. Two mechanisms, belt-and-braces:
--   1. RLS policies restrict every visible row to the owner (auth.uid()).
--   2. Table GRANTs withhold INSERT/UPDATE/DELETE on the money tables from the
--      `authenticated` / `anon` roles entirely. The figure moves only through the
--      SECURITY DEFINER functions in 0003 (which run as the table owner), so even a
--      forged direct `PATCH /rest/v1/accounts` is refused. This is the property the
--      `client cannot overwrite its own balance` test asserts against the fake server.

-- Lock everything down first: revoke the broad default grants Supabase gives roles.
revoke all on accounts     from anon, authenticated;
revoke all on wagers       from anon, authenticated;
revoke all on ledger       from anon, authenticated;
revoke all on settlements  from anon, authenticated;
revoke all on org_members  from anon, authenticated;
revoke all on vip_config   from anon, authenticated;
revoke all on vip_players  from anon, authenticated;
revoke all on kv_documents from anon, authenticated;

alter table accounts     enable row level security;
alter table wagers       enable row level security;
alter table ledger       enable row level security;
alter table settlements  enable row level security;
alter table org_members  enable row level security;
alter table vip_config   enable row level security;
alter table vip_players  enable row level security;
alter table kv_documents enable row level security;

-- ── money tables: READ own rows only; NO client writes ──────────────────────────
-- SELECT is granted + policy-scoped to the owner. No write grants at all, so the
-- only writer is the definer functions.
grant select on accounts    to authenticated;
grant select on wagers      to authenticated;
grant select on ledger      to authenticated;
grant select on settlements to authenticated;
grant select on org_members to authenticated;
grant select on vip_config  to authenticated;
grant select on vip_players to authenticated;

create policy accounts_read_own on accounts
  for select to authenticated using (owner = auth.uid());

-- Wagers/ledger/settlements/vip_players are reachable through the account the user
-- owns; org_members/vip_config are scoped by their own owner column.
create policy wagers_read_own on wagers
  for select to authenticated
  using (exists (select 1 from accounts a where a.id = wagers.account_id and a.owner = auth.uid()));

create policy ledger_read_own on ledger
  for select to authenticated
  using (exists (select 1 from accounts a where a.id = ledger.account_id and a.owner = auth.uid()));

create policy settlements_read_own on settlements
  for select to authenticated
  using (exists (select 1 from accounts a where a.id = settlements.account_id and a.owner = auth.uid()));

create policy vip_players_read_own on vip_players
  for select to authenticated
  using (exists (select 1 from accounts a where a.id = vip_players.account_id and a.owner = auth.uid()));

create policy org_members_read_own on org_members
  for select to authenticated using (owner = auth.uid());

create policy vip_config_read_own on vip_config
  for select to authenticated using (owner = auth.uid());

-- NOTE: deliberately NO `for insert/update/delete` policies and NO write grants on
-- the tables above. Direct writes are therefore impossible for clients — by design.

-- ── kv_documents: client-owned blobs, full CRUD scoped to the owner ─────────────
grant select, insert, update, delete on kv_documents to authenticated;

create policy kv_read_own on kv_documents
  for select to authenticated using (owner = auth.uid());
create policy kv_insert_own on kv_documents
  for insert to authenticated with check (owner = auth.uid());
create policy kv_update_own on kv_documents
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy kv_delete_own on kv_documents
  for delete to authenticated using (owner = auth.uid());
