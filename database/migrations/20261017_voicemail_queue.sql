-- Second Claes is a voicemail assistant to First Claes, not a general AI chatbot.
-- Apply after 20261017_second_claes_replies.sql.
begin;

create table secondself.voicemail_queue (
  message_id bigint primary key references secondself.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'handled')),
  queued_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id),
  check ((status = 'pending' and handled_at is null and handled_by is null)
      or (status = 'handled' and handled_at is not null and handled_by is not null))
);
create index voicemail_queue_pending_idx on secondself.voicemail_queue(queued_at, message_id)
  where status = 'pending';
create index voicemail_queue_user_idx on secondself.voicemail_queue(user_id, queued_at);
alter table secondself.voicemail_queue enable row level security;
revoke all on secondself.voicemail_queue from public, anon, authenticated;

-- Single transaction: validate identity, apply limits, persist message, enqueue,
-- and persist a deterministic receipt. A global advisory transaction lock serializes
-- concurrent submissions so the queue-cap and position remain meaningful.
create function secondself.leave_voicemail(message_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := secondself.require_access(1);
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

  if (select count(*) from secondself.voicemail_queue
      where user_id = caller and queued_at >= now() - interval '10 minutes') >= 3 then
    raise exception 'Rate limit: at most 3 messages per 10 minutes';
  end if;
  if (select count(*) from secondself.voicemail_queue
      where user_id = caller and queued_at >= now() - interval '24 hours') >= 20 then
    raise exception 'Rate limit: at most 20 messages per 24 hours';
  end if;
  if (select count(*) from secondself.voicemail_queue
      where user_id = caller and status = 'pending') >= 10 then
    raise exception 'Queue limit: at most 10 pending messages per person';
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

  select count(*) into position_in_queue from secondself.voicemail_queue
  where status = 'pending';
  insert into secondself.audit(actor, subject, event)
  values (caller, caller, 'voicemail_queued');

  return jsonb_build_object('message_id', new_id,
    'queue_position', position_in_queue, 'reply', receipt);
end;
$$;
revoke all on function secondself.leave_voicemail(text) from public, anon, authenticated;
grant execute on function secondself.leave_voicemail(text) to authenticated;

create function public.secondself_voicemail(message_body text) returns jsonb
language sql security invoker set search_path = '' as $$
  select secondself.leave_voicemail(message_body)
$$;
revoke all on function public.secondself_voicemail(text) from public, anon;
grant execute on function public.secondself_voicemail(text) to authenticated;

-- Old endpoints bypass the new queue; disable them for new submissions.
revoke execute on function public.secondself_send(text) from authenticated;
revoke execute on function public.secondself_send_message(text) from authenticated;

-- Extend existing access state without granting any new privileges.
create or replace function secondself.access_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); result jsonb;
begin
  select jsonb_build_object('level', g.level, 'verified_at', g.verified_at,
    'requested_level', r.requested_level, 'request_status', r.status,
    'is_owner', exists (select 1 from secondself.owner o where o.user_id = caller))
  into result from secondself.grants g
  left join secondself.requests r using(user_id)
  where g.user_id = caller;
  return result;
end;
$$;

create or replace function secondself.conversation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); result jsonb;
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
    order by created_at desc, sort_order desc, id desc limit 60
  ) x;
  return result;
end;
$$;

create function secondself.owner_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); result jsonb;
begin
  if not exists (select 1 from secondself.owner where user_id = caller) then
    raise exception 'Owner approval required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x.queued_at, x.message_id), '[]'::jsonb)
  into result from (
    select q.message_id, q.queued_at, m.body, u.email
    from secondself.voicemail_queue q
    join secondself.messages m on m.id = q.message_id
    join auth.users u on u.id = q.user_id
    where q.status = 'pending'
    order by q.queued_at, q.message_id limit 200
  ) x;
  return result;
end;
$$;
revoke all on function secondself.owner_inbox() from public, anon, authenticated;
grant execute on function secondself.owner_inbox() to authenticated;

create function public.secondself_owner_inbox() returns jsonb
language sql security invoker set search_path = '' as $$
  select secondself.owner_inbox()
$$;
revoke all on function public.secondself_owner_inbox() from public, anon;
grant execute on function public.secondself_owner_inbox() to authenticated;

create function secondself.mark_voicemail_handled(target_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1);
begin
  if not exists (select 1 from secondself.owner where user_id = caller) then
    raise exception 'Owner approval required' using errcode = '42501';
  end if;
  update secondself.voicemail_queue
  set status = 'handled', handled_at = now(), handled_by = caller
  where message_id = target_id and status = 'pending';
  if not found then
    raise exception 'Pending message not found';
  end if;
  insert into secondself.audit(actor, subject, event)
  select caller, q.user_id, 'voicemail_handled'
  from secondself.voicemail_queue q where q.message_id = target_id;
end;
$$;
revoke all on function secondself.mark_voicemail_handled(bigint) from public, anon, authenticated;
grant execute on function secondself.mark_voicemail_handled(bigint) to authenticated;

create function public.secondself_mark_handled(message_id bigint) returns void
language sql security invoker set search_path = '' as $$
  select secondself.mark_voicemail_handled(message_id)
$$;
revoke all on function public.secondself_mark_handled(bigint) from public, anon;
grant execute on function public.secondself_mark_handled(bigint) to authenticated;
commit;
