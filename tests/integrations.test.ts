import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  parseWebhook,
  readWebhookBody,
  verifyWebhook,
} from '../src/lib/server/integration-webhooks';
import { fetchConnected } from '../src/lib/server/connected-providers';
import {
  connectedOverview,
  githubSource,
  type IntegrationConnection,
} from '../src/lib/integration-model';
import { realtimeOrigins } from '../src/lib/realtime-policy';
const owner = 'a0000000-0000-4000-8000-000000000001',
  other = 'b0000000-0000-4000-8000-000000000001';
const connection: IntegrationConnection = {
  id: 'c0000000-0000-4000-8000-000000000001',
  provider: 'github',
  project_id: null,
  source_key: 'example/repo',
  enabled: true,
  status: 'pending',
  last_success_at: null,
  last_event_at: null,
  next_sync_at: new Date().toISOString(),
  error: null,
};

test('connected summaries flag only latest failures and preserve source freshness', () => {
  const item = {
    id: 'old',
    connection_id: connection.id,
    external_id: 'deployment:old',
    kind: 'deployment' as const,
    title: 'Site',
    status: 'ERROR',
    url: 'https://example.com',
    due_date: null,
    starts_at: null,
    ends_at: null,
    all_day: false,
    source_updated_at: '2026-11-27T01:00:00Z',
    checked_at: '2026-11-27T01:00:00Z',
  };
  const newer = {
    ...item,
    id: 'new',
    external_id: 'deployment:new',
    status: 'READY',
    source_updated_at: '2026-11-27T02:00:00Z',
  };
  const ready = {
    ...connection,
    status: 'ready' as const,
    last_success_at: '2026-11-27T02:00:00Z',
  };
  const view = connectedOverview([ready], [item, newer], Date.parse('2026-11-27T02:10:00Z'));
  assert.equal(view.failed.length, 0);
  assert.equal(view.connections[0].stale, false);
  assert.equal(
    connectedOverview([ready], [item], Date.parse('2026-11-27T03:00:00Z')).connections[0].stale,
    true,
  );
  assert.equal(connectedOverview([{ ...ready, enabled: false }], [item]).active.length, 0);
});

test('webhooks verify exact raw bytes, bound streaming bodies and project only safe event fields', async () => {
  const body = Buffer.from(
    JSON.stringify({
      repository: { html_url: 'https://github.com/Example/Repo' },
      action: 'closed',
      issue: {
        id: 1,
        title: 'Fix CI',
        html_url: 'https://github.com/Example/Repo/issues/1',
        body: 'SECRET_PAYLOAD',
      },
      sender: { token: 'SECRET_TOKEN' },
    }),
  );
  const secret = 'test-only-webhook-secret';
  const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyWebhook('github', body, signature, secret), true);
  assert.equal(
    verifyWebhook('github', Buffer.concat([body, Buffer.from(' ')]), signature, secret),
    false,
  );
  assert.equal(verifyWebhook('github', body, signature.slice(7), secret), false);
  assert.equal(verifyWebhook('github', body, 'sha256=zz', secret), false);
  const vercel = createHmac('sha1', secret).update(body).digest('hex');
  assert.equal(verifyWebhook('vercel', body, vercel, secret), true);
  const result = parseWebhook('github', body, new Headers({ 'x-github-event': 'issues' }));
  assert.equal(result?.source, 'example/repo');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.equal(parseWebhook('github', body, new Headers({ 'x-github-event': 'ping' })), null);
  const unsafe = Buffer.from(
    JSON.stringify({
      type: 'deployment.error',
      createdAt: Date.now(),
      payload: {
        project: { id: 'prj_1' },
        deployment: { name: 'Site', meta: { TOKEN: 'SECRET' } },
        links: { deployment: 'javascript:alert(1)' },
      },
    }),
  );
  const v = parseWebhook('vercel', unsafe, new Headers());
  assert.equal(v?.source, 'prj_1');
  assert.equal(v?.event.url, '');
  assert.ok(!JSON.stringify(v).includes('SECRET'));
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(8));
      c.enqueue(new Uint8Array(8));
      c.close();
    },
  });
  await assert.rejects(
    readWebhookBody(
      new Request('https://example.com', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      } as RequestInit),
      10,
    ),
    /body_limit/,
  );
  assert.equal(githubSource('https://github.com/Owner/Repo.git'), 'owner/repo');
  assert.equal(githubSource('https://github.com.evil.test/Owner/Repo'), null);
  assert.equal(
    realtimeOrigins('https://project.supabase.co'),
    ' https://project.supabase.co wss://project.supabase.co',
  );
  assert.equal(realtimeOrigins('https://user:secret@evil.test'), '');
});

test('providers paginate read-only APIs, distinguish PRs and retain calendar all-day bounds', async () => {
  const original = global.fetch,
    old = {
      github: process.env.GITHUB_TOKEN,
      todoist: process.env.TODOIST_TOKEN,
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh: process.env.GOOGLE_REFRESH_TOKEN,
    };
  const calls: string[] = [];
  process.env.GITHUB_TOKEN = 'test';
  process.env.TODOIST_TOKEN = 'test';
  process.env.GOOGLE_CLIENT_ID = 'test';
  process.env.GOOGLE_CLIENT_SECRET = 'test';
  process.env.GOOGLE_REFRESH_TOKEN = 'test';
  try {
    global.fetch = async (input, init) => {
      const u = String(input);
      calls.push(u);
      assert.equal(init?.redirect, 'error');
      const item = (id: number) => ({
        id,
        title: 'Item ' + id,
        updated_at: '2026-11-27T01:00:00Z',
        html_url: 'https://github.com/example/repo/issues/' + id,
      });
      let data: unknown;
      if (u.includes('/issues?'))
        data = u.includes('page=2')
          ? [{ ...item(101), pull_request: {} }]
          : Array.from({ length: 100 }, (_, i) => item(i + 1));
      else if (u.includes('/commits?')) data = [];
      else if (u.includes('/actions/runs?')) data = { workflow_runs: [] };
      else if (u.includes('api.github.com')) data = { full_name: 'example/repo' };
      else if (u.includes('api.todoist.com'))
        data = u.includes('cursor=next')
          ? {
              results: [{ id: '2', content: 'Second', due: { date: '2026-11-28' } }],
              next_cursor: null,
            }
          : {
              results: [{ id: '1', content: 'First', due: { date: '2026-11-27T23:00:00' } }],
              next_cursor: 'next',
            };
      else if (u.includes('oauth2.googleapis.com')) data = { access_token: 'test-access-token' };
      else
        data = {
          items: [
            {
              id: 'event-1',
              summary: 'All day',
              status: 'confirmed',
              updated: '2026-11-27T01:00:00Z',
              start: { date: '2026-11-27' },
              end: { date: '2026-11-29' },
            },
          ],
        };
      return Response.json(data);
    };
    const gh = await fetchConnected(connection);
    assert.equal(gh.items.length, 101);
    assert.equal(gh.snapshot?.open_issues, 100);
    assert.equal(gh.snapshot?.open_pull_requests, 1);
    const todo = await fetchConnected({
      ...connection,
      provider: 'todoist',
      source_key: 'personal',
    });
    assert.equal(todo.items.length, 2);
    assert.equal(todo.items[0].due_date, '2026-11-27');
    const calendar = await fetchConnected({
      ...connection,
      provider: 'google_calendar',
      source_key: 'primary',
    });
    assert.equal(calendar.items[0].all_day, true);
    assert.equal(calendar.items[0].ends_at, '2026-11-29');
    assert.ok(calls.some((x) => x.includes('cursor=next')));
    global.fetch = async () => new Response('unauthorized', { status: 401 });
    await assert.rejects(fetchConnected(connection), /Quyền truy cập/);
  } finally {
    global.fetch = original;
    for (const [name, value] of Object.entries({
      GITHUB_TOKEN: old.github,
      TODOIST_TOKEN: old.todoist,
      GOOGLE_CLIENT_ID: old.id,
      GOOGLE_CLIENT_SECRET: old.secret,
      GOOGLE_REFRESH_TOKEN: old.refresh,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('integration queue deduplicates deliveries, fences stale workers, retries atomically and enforces RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.mfa_factors(id uuid primary key,user_id uuid,status text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1')) $$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users values('${owner}'),('${other}');`,
    );
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    await db.exec(
      `insert into private.app_owner values('${owner}');insert into public.integration_connections(id,user_id,provider,source_key) values('${connection.id}','${owner}','todoist','personal');`,
    );
    async function scalar(sql: string, args: unknown[] = []) {
      return (await db.query<{ v: any }>(sql, args)).rows[0]?.v;
    }
    const enqueue = () =>
      scalar('select public.enqueue_integration($1,$2,$3,$4) v', [
        owner,
        connection.id,
        'a'.repeat(64),
        JSON.stringify({
          title: 'Changed',
          url: 'https://example.com',
          happened_at: '2026-11-27T01:00:00Z',
        }),
      ]);
    assert.equal(await enqueue(), true);
    assert.equal(await enqueue(), false);
    assert.equal(await scalar('select count(*)::integer v from public.integration_activity'), 1);
    const claim = await scalar('select public.claim_integration($1) v', [owner]);
    assert.ok(claim.lease_token);
    assert.equal(await scalar('select public.claim_integration($1) v', [owner]), null);
    const item = {
      external_id: 'task:1',
      kind: 'task',
      title: 'Imported task',
      status: 'open',
      url: 'https://example.com',
      due_date: '2026-11-27',
      starts_at: null,
      ends_at: null,
      all_day: false,
      source_updated_at: '2026-11-27T01:00:00Z',
    };
    const finish = (lease: string, items: unknown, error: string | null = null) =>
      scalar('select public.finish_integration($1,$2,$3,$4,null,$5) v', [
        owner,
        connection.id,
        lease,
        JSON.stringify(items),
        error,
      ]);
    assert.equal(await finish(crypto.randomUUID(), [item]), false);
    // A webhook arriving during a lease must request a subsequent pass.
    await scalar('select public.enqueue_integration($1,$2) v', [owner, connection.id]);
    assert.equal(await finish(claim.lease_token, [item]), true);
    assert.equal(await scalar('select status v from private.integration_queue'), 'queued');
    const second = await scalar('select public.claim_integration($1) v', [owner]);
    await assert.rejects(finish(second.lease_token, [{ ...item, title: '' }]), /check constraint/);
    assert.equal(await scalar('select title v from public.connected_items'), 'Imported task');
    assert.equal(await finish(second.lease_token, null, 'Temporary API error'), true);
    assert.equal(await scalar('select status v from public.integration_connections'), 'error');
    assert.equal(await scalar('select public.claim_integration($1) v', [owner]), null);
    // Repeated scheduling cannot bypass the backoff.
    await scalar('select public.enqueue_integration($1,$2) v', [owner, connection.id]);
    assert.equal(await scalar('select public.claim_integration($1) v', [owner]), null);
    await db.exec(`update private.integration_queue set available_at=now()-interval '1 second';`);
    const third = await scalar('select public.claim_integration($1) v', [owner]);
    await db.exec(
      `update public.integration_connections set source_key='replacement' where id='${connection.id}';`,
    );
    assert.equal(await finish(third.lease_token, [item]), false);
    assert.equal(await scalar('select count(*)::integer v from public.connected_items'), 0);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    assert.equal(await scalar('select count(*)::integer v from public.integration_connections'), 1);
    await assert.rejects(
      scalar('select public.enqueue_integration($1,$2) v', [owner, connection.id]),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(`update public.integration_connections set enabled=false`),
      /permission denied/,
    );
    await scalar('select public.set_integration_enabled($1,false) v', [connection.id]);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal(await scalar('select count(*)::integer v from public.integration_connections'), 0);
    await assert.rejects(
      scalar('select public.set_integration_enabled($1,true) v', [connection.id]),
      /unauthorized/,
    );
  } finally {
    await db.close();
  }
});
