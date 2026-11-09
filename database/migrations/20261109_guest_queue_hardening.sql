-- Guest queue hardening. Apply after 20261018_guest_first_message.sql.
--
-- Temporary (anonymous) accounts are cheap to create, so "one message per guest"
-- alone lets a script rotate identities and fill the global 200-message queue,
-- locking out verified visitors. Guests now share their own, smaller budget:
--   * at most 50 pending guest messages at any time (verified users keep >= 150 slots)
--   * at most 20 guest messages per rolling hour across all guests
-- These are database-enforced and cannot be bypassed by the client.
-- Supabase Auth CAPTCHA for anonymous sign-ins is still recommended (human step).
--
-- The owner inbox also reports whether a message came from a guest, since
-- temporary accounts have no email address.
begin;

create or replace function secondself.guest_voicemail(message_body text) returns jsonb
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

  if exists (select 1 from secondself.voicemail_queue where user_id = caller) then
    raise exception 'Temporary account limit: one message';
  end if;
  if (select count(*) from secondself.voicemail_queue q
      join auth.users u on u.id = q.user_id
      where coalesce(u.is_anonymous, false)
        and q.queued_at >= now() - interval '1 hour') >= 20 then
    raise exception 'Guest limit: too many guest messages this hour';
  end if;
  if (select count(*) from secondself.voicemail_queue q
      join auth.users u on u.id = q.user_id
      where coalesce(u.is_anonymous, false) and q.status = 'pending') >= 50 then
    raise exception 'Guest limit: guest queue is full';
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
grant execute on function secondself.guest_voicemail(text) to authenticated;

create or replace function secondself.owner_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := secondself.require_access(1); result jsonb;
begin
  if not exists (select 1 from secondself.owner where user_id = caller) then
    raise exception 'Owner approval required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x.queued_at, x.message_id), '[]'::jsonb)
  into result from (
    select q.message_id, q.queued_at, m.body, u.email,
      coalesce(u.is_anonymous, false) as is_guest
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

commit;
