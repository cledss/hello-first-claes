-- Guest first message: anonymous Supabase Auth sessions are temporary identities.
-- This does not grant Level 1, owner, trusted, or MCP privileges.
begin;

-- Server-enforced maximum age for verified magic-link sessions.
-- Refreshing an access token cannot extend the original session age.
create or replace function secondself.require_access(required_level integer default 1) returns uuid
language plpgsql security definer set search_path = '' as $
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
        and s.created_at > now() - interval '7 days'
        and (s.not_after is null or s.not_after > now()))
  ) then raise exception 'Access denied' using errcode = '42501'; end if;
  return caller;
end;
$;
revoke all on function secondself.require_access(integer) from public, anon, authenticated;

create function secondself.require_guest() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not exists (
    select 1 from auth.users u
    where u.id = caller and coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
      and exists (
        select 1 from auth.sessions s
        where s.user_id = caller and s.id::text = auth.jwt()->>'session_id'
          and (s.not_after is null or s.not_after > now())
      )
  ) then
    raise exception 'Temporary account required' using errcode = '42501';
  end if;
  return caller;
end;
$$;
revoke all on function secondself.require_guest() from public, anon, authenticated;

create function secondself.guest_voicemail(message_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := secondself.require_guest();
  new_id bigint;
  position_in_queue bigint;
  receipt constant text :=
    'Hej! Jag är Second Claes, assistent till First Claes. Tack för ditt meddelande. ' ||
    'Jag har tagit emot det och lagt det i kön för First Claes. ' ||
    'Du kan återkomma här för att se dina meddelanden.';
begin
  if message_body is null or length(btrim(message_body)) not between 1 and 4000 then
    raise exception 'Message length must be 1 to 4000 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(73421, 1);

  -- Guest accounts can leave exactly one message. The global queue cap
  -- also applies to guests. Production should enable Supabase Auth CAPTCHA
  -- and monitor anonymous sign-ups to mitigate identity-rotation abuse.
  if exists (select 1 from secondself.voicemail_queue where user_id = caller) then
    raise exception 'Temporary account limit: one message';
  end if;
  if (select count(*) from secondself.voicemail_queue where status = 'pending') >= 200 then
    raise exception 'Queue temporarily full; please try later';
  end if;

  insert into secondself.messages(user_id, body)
  values (caller, btrim(message_body)) returning id into new_id;
  insert into secondself.voicemail_queue(message_id, user_id)
  values (new_id, caller);
  insert into secondself.assistant_replies(message_id, user_id, body)
  values (new_id, caller, receipt);
  select count(*) into position_in_queue
  from secondself.voicemail_queue where status = 'pending';
  insert into secondself.audit(actor, subject, event)
  values (caller, caller, 'guest_voicemail_queued');

  return jsonb_build_object('message_id', new_id,
    'queue_position', position_in_queue, 'reply', receipt);
end;
$$;
revoke all on function secondself.guest_voicemail(text) from public, anon, authenticated;
grant usage on schema secondself to authenticated;
grant execute on function secondself.guest_voicemail(text) to authenticated;

create function public.secondself_guest_voicemail(message_body text) returns jsonb
language sql security invoker set search_path = '' as $$
  select secondself.guest_voicemail(message_body)
$$;
revoke all on function public.secondself_guest_voicemail(text) from public, anon;
grant execute on function public.secondself_guest_voicemail(text) to authenticated;

create function secondself.guest_conversation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_guest(); result jsonb;
begin
  select coalesce(jsonb_agg(x order by x.created_at, x.sort_order, x.id), '[]'::jsonb)
  into result from (
    select m.id, m.body, m.created_at, 0 as sort_order, 'user'::text as role,
      q.status as queue_status
    from secondself.messages m
    left join secondself.voicemail_queue q on q.message_id = m.id
    where m.user_id = caller
    union all
    select r.id, r.body, r.created_at, 1 as sort_order, 'assistant'::text as role,
      null::text as queue_status
    from secondself.assistant_replies r where r.user_id = caller
    order by created_at desc, sort_order desc, id desc limit 20
  ) x;
  return result;
end;
$$;
revoke all on function secondself.guest_conversation() from public, anon, authenticated;
grant execute on function secondself.guest_conversation() to authenticated;

create function public.secondself_guest_conversation() returns jsonb
language sql security invoker set search_path = '' as $$
  select secondself.guest_conversation()
$$;
revoke all on function public.secondself_guest_conversation() from public, anon;
grant execute on function public.secondself_guest_conversation() to authenticated;

commit;
