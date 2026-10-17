-- Apply once as the database administrator, before enabling the frontend.
begin;
create schema if not exists secondself;
revoke all on schema secondself from public, anon, authenticated;

create table secondself.grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  principal text not null default 'second-claes' check (principal = 'second-claes'),
  level integer not null default 1 check (level between 1 and 9),
  verified_at timestamptz not null,
  granted_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revoked_at timestamptz,
  check (level = 1 or (approved_by is not null and approved_at is not null))
);
create table secondself.owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid unique not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table secondself.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on secondself.messages(user_id, id);
create table secondself.requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_level integer not null check (requested_level between 2 and 9),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now()
);
create table secondself.audit (
  id bigint generated always as identity primary key,
  actor uuid,
  subject uuid not null,
  event text not null,
  created_at timestamptz not null default now()
);
alter table secondself.grants enable row level security;
alter table secondself.owner enable row level security;
alter table secondself.messages enable row level security;
alter table secondself.requests enable row level security;
alter table secondself.audit enable row level security;
revoke all on all tables in schema secondself from public, anon, authenticated;

-- Only Auth's trusted verification fields create the one-time grant. Metadata is ignored.
create function secondself.register_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and new.email is not null and not coalesce(new.is_anonymous, false) then
    insert into secondself.grants(user_id, verified_at)
    values (new.id, new.email_confirmed_at) on conflict do nothing;
    if found then
      insert into secondself.audit(subject, event) values (new.id, 'verified_level_1_granted');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function secondself.register_verified() from public, anon, authenticated;
create trigger secondself_verified after insert or update on auth.users
for each row execute function secondself.register_verified();
-- Existing verified accounts receive the same one-time grant.
insert into secondself.grants(user_id, verified_at)
select id, email_confirmed_at from auth.users
where email_confirmed_at is not null and email is not null and not coalesce(is_anonymous, false);
insert into secondself.audit(subject, event)
select user_id, 'verified_level_1_granted' from secondself.grants;

create function secondself.require_access(required_level integer default 1) returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null or not exists (
    select 1 from auth.users u join secondself.grants g on g.user_id = u.id
    where u.id = caller and u.email_confirmed_at is not null and u.email is not null
      and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
      and g.revoked_at is null and g.level >= required_level
      and exists (select 1 from auth.sessions s where s.user_id = caller
        and s.id::text = auth.jwt()->>'session_id'
        and (s.not_after is null or s.not_after > now()))
  ) then raise exception 'Access denied' using errcode = '42501'; end if;
  return caller;
end;
$$;
revoke all on function secondself.require_access(integer) from public, anon, authenticated;

-- All privileged implementation lives outside PostgREST's exposed public schema.
create function secondself.access_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); result jsonb;
begin
  select jsonb_build_object('level', g.level, 'verified_at', g.verified_at,
    'requested_level', r.requested_level, 'request_status', r.status)
    into result from secondself.grants g left join secondself.requests r using(user_id)
    where g.user_id = caller;
  return result;
end;
$$;
create function secondself.list_messages() returns setof secondself.messages
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1);
begin
  return query select * from secondself.messages where user_id = caller order by id desc limit 100;
end;
$$;
create function secondself.send_message(body text) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1);
begin
  insert into secondself.messages(user_id, body) values (caller, btrim(body));
  insert into secondself.audit(actor, subject, event) values (caller, caller, 'message_saved');
end;
$$;
create function secondself.request_level(requested_level integer) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1);
begin
  insert into secondself.requests(user_id, requested_level) values (caller, requested_level)
  on conflict (user_id) do update set requested_level = excluded.requested_level,
    status = 'pending', created_at = now();
  insert into secondself.audit(actor, subject, event) values (caller, caller, 'level_requested');
end;
$$;
create function secondself.approve_level(subject uuid, approved_level integer) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1);
begin
  if caller = subject or not exists (select 1 from secondself.owner where user_id = caller) then
    raise exception 'Owner approval required' using errcode = '42501';
  end if;
  if not exists (select 1 from secondself.requests where user_id = subject
    and status = 'pending' and requested_level = approved_level) then
    raise exception 'Pending request required';
  end if;
  update secondself.grants set level = approved_level, approved_by = caller, approved_at = now()
  where user_id = subject and revoked_at is null;
  if not found then raise exception 'Active grant required'; end if;
  update secondself.requests set status = 'approved' where user_id = subject;
  insert into secondself.audit(actor, subject, event) values (caller, subject, 'level_approved');
end;
$$;
create function secondself.revoke_access(subject uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1);
begin
  if not exists (select 1 from secondself.owner where user_id = caller) then
    raise exception 'Owner approval required' using errcode = '42501';
  end if;
  update secondself.grants set revoked_at = now() where user_id = subject;
  insert into secondself.audit(actor, subject, event) values (caller, subject, 'access_revoked');
end;
$$;
-- No private memories or contacts are exposed by this feature.
create function secondself.trusted_resource() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform secondself.require_access(2);
end;
$$;
revoke all on all functions in schema secondself from public, anon, authenticated;
grant usage on schema secondself to authenticated;
grant execute on function secondself.access_state(), secondself.list_messages(),
  secondself.send_message(text), secondself.request_level(integer),
  secondself.approve_level(uuid, integer), secondself.revoke_access(uuid),
  secondself.trusted_resource() to authenticated;

create function public.secondself_access() returns jsonb language sql security invoker
set search_path = '' as $$ select secondself.access_state() $$;
create function public.secondself_messages() returns jsonb language sql security invoker
set search_path = '' as $$ select coalesce(jsonb_agg(m), '[]'::jsonb) from secondself.list_messages() m $$;
create function public.secondself_send(body text) returns void language sql security invoker
set search_path = '' as $$ select secondself.send_message(body) $$;
create function public.secondself_request(requested_level integer) returns void language sql security invoker
set search_path = '' as $$ select secondself.request_level(requested_level) $$;
create function public.secondself_approve(subject uuid, approved_level integer) returns void language sql security invoker
set search_path = '' as $$ select secondself.approve_level(subject, approved_level) $$;
create function public.secondself_revoke(subject uuid) returns void language sql security invoker
set search_path = '' as $$ select secondself.revoke_access(subject) $$;
create function public.secondself_trusted() returns void language sql security invoker
set search_path = '' as $$ select secondself.trusted_resource() $$;
revoke all on function public.secondself_access(), public.secondself_messages(), public.secondself_send(text),
  public.secondself_request(integer), public.secondself_approve(uuid, integer), public.secondself_revoke(uuid),
  public.secondself_trusted() from public, anon;
grant execute on function public.secondself_access(), public.secondself_messages(), public.secondself_send(text),
  public.secondself_request(integer), public.secondself_approve(uuid, integer), public.secondself_revoke(uuid),
  public.secondself_trusted() to authenticated;
commit;
