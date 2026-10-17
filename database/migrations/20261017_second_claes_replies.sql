-- Apply after database/schema.sql. Existing user messages remain unchanged.
begin;

create table if not exists secondself.assistant_replies (
  id bigint generated always as identity primary key,
  message_id bigint not null unique references secondself.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists assistant_replies_user_id_idx on secondself.assistant_replies(user_id, id);
alter table secondself.assistant_replies enable row level security;
revoke all on secondself.assistant_replies from public, anon, authenticated;

-- Server verifies the JWT before calling this function using the user's JWT.
create function secondself.send_message_returning(message_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); new_id bigint;
begin
  if length(btrim(message_body)) not between 1 and 4000 then
    raise exception 'Message length must be 1 to 4000 characters';
  end if;
  -- Prevent automated rapid-fire calls from exhausting model usage.
  if (select count(*) from secondself.messages
      where user_id = caller and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Message rate limit exceeded';
  end if;
  insert into secondself.messages(user_id, body)
  values (caller, btrim(message_body)) returning id into new_id;
  insert into secondself.audit(actor, subject, event)
  values (caller, caller, 'message_saved');
  return new_id;
end;
$$;
revoke all on function secondself.send_message_returning(text) from public, anon, authenticated;
grant execute on function secondself.send_message_returning(text) to authenticated;

create function public.secondself_send_message(message_body text) returns bigint
language sql security invoker set search_path = '' as $$
  select secondself.send_message_returning(message_body)
$$;
revoke all on function public.secondself_send_message(text) from public, anon;
grant execute on function public.secondself_send_message(text) to authenticated;

create function secondself.conversation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); result jsonb;
begin
  select coalesce(jsonb_agg(x order by x.created_at, x.sort_order, x.id), '[]'::jsonb)
  into result from (
    select m.id, m.body, m.created_at, 0 as sort_order, 'user'::text as role
    from secondself.messages m where m.user_id = caller
    union all
    select r.id, r.body, r.created_at, 1 as sort_order, 'assistant'::text as role
    from secondself.assistant_replies r where r.user_id = caller
    order by created_at desc, sort_order desc, id desc limit 60
  ) x;
  return result;
end;
$$;
revoke all on function secondself.conversation() from public, anon, authenticated;
grant execute on function secondself.conversation() to authenticated;

create function public.secondself_conversation() returns jsonb
language sql security invoker set search_path = '' as $$
  select secondself.conversation()
$$;
revoke all on function public.secondself_conversation() from public, anon;
grant execute on function public.secondself_conversation() to authenticated;

-- This is only callable with a server-held service role credential.
-- The caller cannot choose a user_id; ownership is derived from the message.
create function public.secondself_store_reply(p_message_id bigint, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  if length(btrim(p_body)) not between 1 and 8000 then
    raise exception 'Invalid reply';
  end if;
  select user_id into target_user from secondself.messages where id = p_message_id;
  if target_user is null then raise exception 'Message not found'; end if;
  insert into secondself.assistant_replies(message_id, user_id, body)
  values (p_message_id, target_user, btrim(p_body));
  insert into secondself.audit(subject, event)
  values (target_user, 'assistant_replied');
end;
$$;
revoke all on function public.secondself_store_reply(bigint, text) from public, anon, authenticated;
grant execute on function public.secondself_store_reply(bigint, text) to service_role;
commit;
