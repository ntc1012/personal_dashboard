import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { extraSchemas } from '../src/lib/modules';
import { parseVocabCsv, reviewCard, studyStreak } from '../src/lib/learning';
import { createVault, decryptVault, encryptVault, unlockVault } from '../src/lib/crypto/vault';
import { agentPolicy } from '../src/lib/agent-policy';
import { availableTools, writeIntent, readTool, localToolPlan } from '../src/lib/agent/tools';
import { demoSnapshot, demoMutate } from '../src/lib/demo';
const owner = 'a0000000-0000-4000-8000-000000000001',
  other = 'b0000000-0000-4000-8000-000000000001';
test('SM-2, CSV and streak use real calendar dates and safe input', () => {
  const cards = parseVocabCsv(
    'front,back,example\n"hello, world",xin chao,"say ""hello"""\nword,nghia,test',
    'en',
    '2026-11-27',
  );
  assert.equal(cards.length, 2);
  assert.equal(cards[0].front, 'hello, world');
  assert.throws(() => parseVocabCsv('foo,bar\na,b', 'en'));
  assert.throws(() => parseVocabCsv('front,back\na,', 'en'));
  const base = {
    ...cards[0],
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    archived_at: null,
  };
  const first = reviewCard(base, 4, '2026-11-27');
  assert.equal(first.due_date, '2026-11-28');
  const second = reviewCard({ ...base, ...first }, 4, '2026-11-28');
  assert.equal(second.interval_days, 6);
  const forgotten = reviewCard({ ...base, ...second }, 0, '2026-12-04');
  assert.equal(forgotten.repetitions, 0);
  assert.equal(forgotten.interval_days, 1);
  assert.equal(studyStreak(['2026-11-25', '2026-11-26', '2026-11-26'], '2026-11-27'), 2);
});
test('vault encrypts, rejects wrong password, tampering and item swapping', async () => {
  const id = crypto.randomUUID();
  const { key, meta } = await createVault('A long test passphrase 2026!', id);
  const now = new Date().toISOString();
  const full = { ...meta, id, version: 1, created_at: now, updated_at: now, archived_at: null };
  const restored = await unlockVault('A long test passphrase 2026!', full);
  const itemId = crypto.randomUUID(),
    clear = 'private test secret';
  const item = await encryptVault(restored, clear, itemId);
  assert.ok(!item.ciphertext.includes(clear));
  assert.equal(await decryptVault(key, item, itemId), clear);
  await assert.rejects(unlockVault('Wrong but long password', full));
  await assert.rejects(decryptVault(key, item, crypto.randomUUID()));
  await assert.rejects(
    decryptVault(key, { ...item, ciphertext: item.ciphertext.slice(0, -4) + 'AAAA' }, itemId),
  );
});
test('external content cannot grant write tools and vault projection excludes ciphertext', () => {
  assert.equal(writeIntent('add_task', 'Hôm nay còn gì?'), false);
  assert.ok(!availableTools('Tóm tắt bản tin').includes('send_notification'));
  assert.equal(agentPolicy('read_vault_secret').allowed, false);
  assert.equal(agentPolicy('__proto__').allowed, false);
  assert.equal(localToolPlan('Ghi 20 phút học tiếng Anh')?.tool, 'log_study');
  const s = demoSnapshot(),
    now = new Date().toISOString();
  s.vault_items.push({
    id: crypto.randomUUID(),
    version: 1,
    created_at: now,
    updated_at: now,
    archived_at: null,
    label: 'Discord',
    category: 'Cá nhân',
    location: 'vault',
    ciphertext: 'secret-ciphertext',
    iv: 'AAAAAAAAAAAAAAAA',
    cipher_version: 1,
  });
  const projection = JSON.stringify(readTool('find_credential', { query: 'Discord' }, s));
  assert.match(projection, /Discord/);
  assert.doesNotMatch(projection, /ciphertext|AAAAAAAA/);
});
test('all migrations enforce atomic batch, confirmation, budget and monitor incidents', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.mfa_factors(id uuid primary key,user_id uuid,status text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1')) $$;grant usage on schema public,auth to anon,authenticated,service_role;insert into auth.users values('${owner}'),('${other}');`,
    );
    const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) await db.exec(await readFile('supabase/migrations/' + f, 'utf8'));
    await db.exec(
      `insert into private.app_owner values('${owner}');set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>("select public.take_rate('test',2,60) ok")).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>("select public.take_rate('test',2,60) ok")).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>("select public.take_rate('test',2,60) ok")).rows[0].ok,
      false,
    );
    async function change(
      entity: string,
      data: object,
      id = crypto.randomUUID(),
      action = 'create',
      version: number | null = null,
    ) {
      const result = await db.query<{ v: { id: string } }>(
        'select public.apply_change($1,$2,$3,$4,$5) v',
        [entity, action, id, JSON.stringify(data), version],
      );
      return { id, event: result.rows[0].v.id };
    }
    const study = await change(
      'study_logs',
      extraSchemas.study_logs.parse({ language: 'en', date: '2026-11-27', minutes: 20 }),
    );
    assert.ok(study.event);
    await db.query('select public.undo_change($1)', [study.event]);
    assert.ok(
      (
        await db.query<{ archived_at: string }>(
          'select archived_at from public.study_logs where id=$1',
          [study.id],
        )
      ).rows[0].archived_at,
    );
    const card = extraSchemas.vocab_cards.parse({
      language: 'en',
      front: 'hello',
      back: 'xin chao',
      due_date: '2026-11-27',
    });
    const operations = [
      { entity: 'vocab_cards', action: 'create', id: crypto.randomUUID(), data: card },
      {
        entity: 'vocab_cards',
        action: 'create',
        id: crypto.randomUUID(),
        data: { ...card, front: '' },
      },
    ];
    await assert.rejects(db.query('select public.apply_batch($1)', [JSON.stringify(operations)]));
    assert.equal((await db.query('select * from public.vocab_cards')).rows.length, 0);
    const task = await change('tasks', {
      title: 'Task',
      project_id: null,
      due_date: null,
      priority: 'medium',
      status: 'todo',
      notes: '',
    });
    const payload = {
      operations: [
        {
          entity: 'tasks',
          action: 'update',
          id: task.id,
          expectedVersion: 1,
          data: { due_date: '2026-12-01' },
        },
      ],
    };
    const proposal = await db.query<{ p: { id: string } }>(
      'select public.propose_action($1,$2,$3) p',
      ['bulk_update', JSON.stringify(payload), 'Change one deadline'],
    );
    const p = proposal.rows[0].p.id;
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    await assert.rejects(db.query('select public.confirm_action($1)', [p]), /unauthorized/);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query('select public.confirm_action($1)', [p]);
    await assert.rejects(db.query('select public.confirm_action($1)', [p]), /expired_or_consumed/);
    assert.equal(
      (
        await db.query<{ d: string }>('select due_date::text d from public.tasks where id=$1', [
          task.id,
        ])
      ).rows[0].d,
      '2026-12-01',
    );
    await change(
      'settings',
      extraSchemas.settings.parse({
        ai_monthly_budget: 0.01,
        ai_daily_tokens: 1000,
        ai_input_per_million: 1,
        ai_output_per_million: 1,
      }),
    );
    const today = (
      await db.query<{ d: string }>("select (now() at time zone 'Asia/Bangkok')::date::text d")
    ).rows[0].d;
    await db.query('select public.reserve_ai($1,600,.001,$2,$3)', [
      crypto.randomUUID(),
      today,
      today.slice(0, 7) + '-01',
    ]);
    await assert.rejects(
      db.query('select public.reserve_ai($1,600,.001,$2,$3)', [
        crypto.randomUUID(),
        today,
        today.slice(0, 7) + '-01',
      ]),
      /ai_budget_exceeded/,
    );
    const monitor = await change(
      'monitors',
      extraSchemas.monitors.parse({ name: 'Test', url: 'https://example.com' }),
    );
    await db.exec('reset role;set role service_role;');
    for (let i = 0; i < 2; i++)
      await db.query('select public.record_monitor_result($1,$2,false,500,10,$3)', [
        owner,
        monitor.id,
        'HTTP 500',
      ]);
    assert.equal(
      (await db.query('select * from public.incidents where resolved_at is null')).rows.length,
      1,
    );
    await db.query('select public.record_monitor_result($1,$2,false,500,10,$3)', [
      owner,
      monitor.id,
      'HTTP 500',
    ]);
    assert.equal((await db.query('select * from public.incidents')).rows.length, 1);
    await db.query('select public.record_monitor_result($1,$2,true,200,10,null)', [
      owner,
      monitor.id,
    ]);
    assert.equal(
      (await db.query('select * from public.incidents where resolved_at is null')).rows.length,
      0,
    );
    const claim = await db.query<{ id: string }>('select public.claim_job($1,$2,$3) id', [
      owner,
      'monitor',
      'same-slot',
    ]);
    assert.ok(claim.rows[0].id);
    assert.equal(
      (
        await db.query<{ id: null }>('select public.claim_job($1,$2,$3) id', [
          owner,
          'monitor',
          'same-slot',
        ])
      ).rows[0].id,
      null,
    );
    await db.exec('reset role;set role authenticated;');
    await assert.rejects(
      db.query('select public.record_monitor_result($1,$2,true,200,10,null)', [owner, monitor.id]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
