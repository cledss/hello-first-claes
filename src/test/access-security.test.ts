// Execute the production SQL with Postgres roles. Only Supabase's managed Auth
// schema/JWT plumbing is represented locally; authorization is not mocked.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const unverified = "00000000-0000-4000-8000-000000000003";
const owner = "00000000-0000-4000-8000-000000000004";
const db = new PGlite();

async function login(id: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({
      sub: id,
      session_id: id,
      role: "owner",
      phone: "+46705121441",
      user_metadata: { role: "owner", level: 9 },
    }),
  ]);
  await db.exec(`set role ${role}`);
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
      is_anonymous boolean default false, banned_until timestamptz, raw_user_meta_data jsonb);
    create table auth.sessions (id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
  `);
  await db.exec(readFileSync("database/schema.sql", "utf8"));
  const migration = readFileSync("database/migrations/20261017_second_claes_replies.sql", "utf8");
  try {
    await db.exec(migration);
  } catch (error) {
    const position = Number((error as { position?: string }).position);
    console.error("Migration SQL error near:", migration.slice(position - 90, position + 90));
    throw error;
  }
  await db.exec(readFileSync("database/migrations/20261017_voicemail_queue.sql", "utf8"));
  for (const [id, verified] of [
    [alice, true],
    [bob, true],
    [unverified, false],
    [owner, true],
  ] as const) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,$3)", [
      id,
      `${id}@example.invalid`,
      verified ? "2026-01-01T00:00:00Z" : null,
    ]);
    await db.query("insert into auth.sessions(id,user_id) values ($1,$1)", [id]);
  }
  await db.query("insert into secondself.owner(user_id) values ($1)", [owner]);
}, 30000);

afterAll(async () => {
  await db.close();
});

describe.sequential("SecondSelf database authorization", () => {
  it("denies anonymous and unverified accounts", async () => {
    await login(null, "anon");
    await expect(db.query("select public.secondself_access()")).rejects.toThrow(
      /permission denied/,
    );
    await login(unverified);
    await expect(db.query("select public.secondself_access()")).rejects.toThrow(/Access denied/);
  });

  it("automatically grants only Level 1 to verified accounts", async () => {
    await login(alice);
    const result = await db.query<{ access: { level: number } }>(
      "select public.secondself_access() as access",
    );
    expect(result.rows[0]!.access.level).toBe(1);
    await expect(db.query("select public.secondself_trusted()")).rejects.toThrow(/Access denied/);
  });

  it("cannot impersonate owner, edit grants, audit, or approve itself", async () => {
    await login(alice);
    await db.query("select public.secondself_request(2)");
    await expect(db.query("select public.secondself_approve($1,2)", [alice])).rejects.toThrow(
      /Owner approval/,
    );
    await expect(db.query("select public.secondself_approve($1,2)", [bob])).rejects.toThrow(
      /Owner approval/,
    );
    await expect(db.query("update secondself.grants set level=9")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("insert into secondself.owner(user_id) values ($1)", [alice]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from secondself.audit")).rejects.toThrow(/permission denied/);
  });

  it("isolates messages and refuses client-supplied ownership", async () => {
    await login(alice);
    await db.query("select public.secondself_voicemail('Alice message')");
    await expect(
      db.query("insert into secondself.messages(user_id,body) values ($1,'attack')", [bob]),
    ).rejects.toThrow(/permission denied/);
    await login(bob);
    const empty = await db.query<{ messages: unknown[] }>(
      "select public.secondself_messages() as messages",
    );
    expect(empty.rows[0]!.messages).toEqual([]);
    await db.query("select public.secondself_voicemail('Bob message')");
    await login(alice);
    const own = await db.query<{ messages: { body: string }[] }>(
      "select public.secondself_messages() as messages",
    );
    expect(own.rows[0]!.messages.map((m) => m.body)).toEqual(["Alice message"]);
  });

  it("queues a message and receipt atomically and isolates each visitor", async () => {
    await login(null, "anon");
    await expect(db.query("select public.secondself_voicemail('Hello')")).rejects.toThrow(
      /permission denied/,
    );
    await login(unverified);
    await expect(db.query("select public.secondself_voicemail('Hello')")).rejects.toThrow(
      /Access denied/,
    );
    await login(bob);
    const sent = await db.query<{ receipt: { message_id: number; queue_position: number } }>(
      "select public.secondself_voicemail('Please call me') as receipt",
    );
    expect(sent.rows[0]!.receipt.queue_position).toBeGreaterThan(0);
    const messageId = sent.rows[0]!.receipt.message_id;
    const bobConversation = await db.query<{
      conversation: { role: string; body: string; queue_status: string | null }[];
    }>("select public.secondself_conversation() as conversation");
    expect(bobConversation.rows[0]!.conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", body: "Please call me", queue_status: "pending" }),
        expect.objectContaining({
          role: "assistant",
          body: expect.stringContaining("First Claes"),
        }),
      ]),
    );
    await expect(
      db.query("select public.secondself_mark_handled($1)", [messageId]),
    ).rejects.toThrow(/Owner approval required/);
    await expect(db.query("select public.secondself_owner_inbox()")).rejects.toThrow(
      /Owner approval required/,
    );
    await expect(db.query("select public.secondself_send('bypass')")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("select public.secondself_send_message('bypass')")).rejects.toThrow(
      /permission denied/,
    );
    await login(alice);
    const aliceConversation = await db.query<{ conversation: { body: string }[] }>(
      "select public.secondself_conversation() as conversation",
    );
    const canReadBob = aliceConversation.rows[0]!.conversation.some(
      (m) => m.body === "Please call me",
    );
    expect(canReadBob).toBe(false);
    await login(owner);
    const inbox = await db.query<{ inbox: { message_id: number; body: string }[] }>(
      "select public.secondself_owner_inbox() as inbox",
    );
    expect(inbox.rows[0]!.inbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message_id: messageId, body: "Please call me" }),
      ]),
    );
    await db.query("select public.secondself_mark_handled($1)", [messageId]);
    const after = await db.query<{ inbox: { message_id: number }[] }>(
      "select public.secondself_owner_inbox() as inbox",
    );
    expect(after.rows[0]!.inbox.some((m) => m.message_id === messageId)).toBe(false);
    await login(bob);
    const handled = await db.query<{ conversation: { body: string; queue_status: string }[] }>(
      "select public.secondself_conversation() as conversation",
    );
    expect(handled.rows[0]!.conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: "Please call me", queue_status: "handled" }),
      ]),
    );
  });

  it("enforces a per-person rate limit inside the database", async () => {
    await login(alice);
    await db.query("select public.secondself_voicemail('Second')");
    await db.query("select public.secondself_voicemail('Third')");
    await expect(db.query("select public.secondself_voicemail('Fourth')")).rejects.toThrow(
      /Rate limit/,
    );
  });

  it("requires a live session and current verification", async () => {
    await db.exec("reset role");
    await db.query("delete from auth.sessions where user_id=$1", [bob]);
    await login(bob);
    await expect(db.query("select public.secondself_messages()")).rejects.toThrow(/Access denied/);
    await db.exec("reset role");
    await db.query("insert into auth.sessions(id,user_id) values ($1,$1)", [bob]);
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [bob]);
    await login(bob);
    await expect(db.query("select public.secondself_access()")).rejects.toThrow(/Access denied/);
    await db.exec("reset role");
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [bob]);
  });

  it("records authenticated owner approval and enforces revocation immediately", async () => {
    await login(owner);
    await db.query("select public.secondself_approve($1,2)", [alice]);
    await login(alice);
    await db.query("select public.secondself_trusted()");
    await login(owner);
    await db.query("select public.secondself_revoke($1)", [alice]);
    await login(alice);
    await expect(db.query("select public.secondself_messages()")).rejects.toThrow(/Access denied/);
    await expect(
      db.query("select public.secondself_voicemail('after revocation')"),
    ).rejects.toThrow(/Access denied/);
    await db.exec("reset role");
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [alice]);
    const audit = await db.query<{ event: string }>(
      "select event from secondself.audit where subject=$1 order by id",
      [alice],
    );
    expect(audit.rows.map((row) => row.event)).toContain("level_approved");
    expect(audit.rows.map((row) => row.event)).toContain("access_revoked");
    await login(alice);
    await expect(db.query("select public.secondself_access()")).rejects.toThrow(/Access denied/);
  });
});
