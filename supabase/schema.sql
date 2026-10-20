-- Run in Supabase Dashboard -> SQL Editor before connecting the website.
-- Public/anon key can be published; NEVER put service_role or sb_secret_ keys in web files.
create table if not exists public.user_save_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.user_save_snapshots enable row level security;

revoke all on table public.user_save_snapshots from public, anon;
grant select, insert, update on public.user_save_snapshots to authenticated;

drop policy if exists "Read own vocabulary saves" on public.user_save_snapshots;
create policy "Read own vocabulary saves"
  on public.user_save_snapshots for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Create own vocabulary saves" on public.user_save_snapshots;
create policy "Create own vocabulary saves"
  on public.user_save_snapshots for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Update own vocabulary saves" on public.user_save_snapshots;
create policy "Update own vocabulary saves"
  on public.user_save_snapshots for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- All writes are atomic compare-and-swap operations. If another browser
-- published first, return applied=false rather than overwriting it.
create or replace function public.write_user_save_snapshot(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns table(applied boolean, current_revision bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
    or jsonb_typeof(p_snapshot->'slots') <> 'object'
    or jsonb_typeof(p_snapshot->'activeId') <> 'string'
    or octet_length(p_snapshot::text) > 4000000 then
    raise exception 'Invalid or oversized vocabulary save';
  end if;

  if p_expected_revision = 0 then
    insert into public.user_save_snapshots(user_id, snapshot, revision)
      values (auth.uid(), p_snapshot, 1)
      on conflict (user_id) do nothing
      returning revision into saved_revision;
  elsif p_expected_revision > 0 then
    update public.user_save_snapshots
      set snapshot = p_snapshot,
          revision = revision + 1,
          updated_at = now()
      where user_id = auth.uid() and revision = p_expected_revision
      returning revision into saved_revision;
  end if;

  if saved_revision is null then
    select s.revision into saved_revision
      from public.user_save_snapshots as s
      where s.user_id = auth.uid();
    return query select false, coalesce(saved_revision, 0::bigint);
  else
    return query select true, saved_revision;
  end if;
end
$$;

revoke all on function public.write_user_save_snapshot(bigint, jsonb)
  from public, anon;
grant execute on function public.write_user_save_snapshot(bigint, jsonb)
  to authenticated;
