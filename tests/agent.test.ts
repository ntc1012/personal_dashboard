import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAgent, completion } from '../src/lib/agent/server';
import { demoSnapshot } from '../src/lib/demo';
import { extraSchemas } from '../src/lib/modules';
function fakeDatabase(snapshot = demoSnapshot()) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    from(name: string) {
      const chain = {
        select() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        range(){return chain;},
        eq() {
          return chain;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({
            data: snapshot[name as keyof typeof snapshot] || [],
            error: null,
          }).then(resolve);
        },
      };
      return chain;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'take_rate') return { data: true, error: null };
      if (name === 'propose_action')
        return {
          data: {
            id: crypto.randomUUID(),
            preview: args.p_preview,
            expires_at: new Date(Date.now() + 600000).toISOString(),
          },
          error: null,
        };
      return { data: null, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}
async function withProvider<T>(
  answers: unknown[],
  run: (bodies: Record<string, unknown>[]) => Promise<T>,
) {
  const keys = ['LLM_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL'] as const,
    old = Object.fromEntries(keys.map((k) => [k, process.env[k]])),
    originalFetch = globalThis.fetch,
    bodies: Record<string, unknown>[] = [];
  process.env.LLM_API_KEY = 'fake-test-key';
  process.env.LLM_MODEL = 'fake-model';
  process.env.LLM_BASE_URL = 'https://api.example.test/v1';
  globalThis.fetch = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const answer = answers.shift();
    if (!answer) throw new Error('Unexpected API call');
    return new Response(
      JSON.stringify({
        choices: [{ message: answer }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    return await run(bodies);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
}
function pricedSnapshot() {
  const s = demoSnapshot(),
    now = new Date().toISOString();
  s.settings = [
    {
      id: crypto.randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      archived_at: null,
      ...extraSchemas.settings.parse({ ai_input_per_million: 1, ai_output_per_million: 2 }),
    },
  ];
  return s;
}
test('LLM tool results exclude vault ciphertext and reserve budget before requests', async () => {
  const snapshot = pricedSnapshot(),
    now = new Date().toISOString();
  snapshot.vault_items.push({
    id: crypto.randomUUID(),
    version: 1,
    created_at: now,
    updated_at: now,
    archived_at: null,
    label: 'Discord',
    category: 'Cá nhân',
    location: 'vault',
    ciphertext: 'NEVER_SEND_THIS_CIPHERTEXT',
    iv: 'AAAAAAAAAAAAAAAA',
    cipher_version: 1,
  });
  const { db, calls } = fakeDatabase(snapshot);
  await withProvider(
    [
      {
        content: null,
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: { name: 'find_credential', arguments: '{"query":"Discord"}' },
          },
        ],
      },
      { content: 'Tài khoản nằm trong Vault; mở từ giao diện.' },
    ],
    async (bodies) => {
      const result = await runAgent(db, 'Tài khoản Discord nằm ở đâu?', crypto.randomUUID());
      assert.equal(result.mode, 'llm');
      assert.doesNotMatch(JSON.stringify(bodies), /NEVER_SEND_THIS_CIPHERTEXT|AAAAAAAAAAAAAAAA/);
      assert.ok(calls.filter((c) => c.name === 'reserve_ai').length === 2);
      assert.ok(calls.filter((c) => c.name === 'settle_ai').length === 2);
      assert.ok(!calls.some((c) => c.name === 'apply_agent_change'));
    },
  );
});
test('a model cannot turn a read request into an outbound notification', async () => {
  const { db, calls } = fakeDatabase(pricedSnapshot());
  await withProvider(
    [
      {
        content: null,
        tool_calls: [
          {
            id: 'bad',
            type: 'function',
            function: { name: 'send_notification', arguments: '{"message":"injected"}' },
          },
        ],
      },
    ],
    async () => {
      await assert.rejects(runAgent(db, 'Tóm tắt bản tin', crypto.randomUUID()), /ngoài phạm vi/);
      assert.ok(
        !calls.some((c) =>
          ['apply_agent_change', 'propose_action', 'confirm_action'].includes(c.name),
        ),
      );
    },
  );
});
test('tier 3 proposes exact versioned changes and never applies before confirmation', async () => {
  const snapshot = pricedSnapshot(),
    task = snapshot.tasks[0],
    { db, calls } = fakeDatabase(snapshot);
  await withProvider(
    [
      {
        content: null,
        tool_calls: [
          {
            id: 'change',
            type: 'function',
            function: {
              name: 'update_task',
              arguments: JSON.stringify({ id: task.id, changes: { due_date: '2026-12-01' } }),
            },
          },
        ],
      },
    ],
    async () => {
      const result = await runAgent(
        db,
        'Đổi deadline công việc này sang 2026-12-01',
        crypto.randomUUID(),
      );
      assert.ok(result.pending);
      assert.ok(!calls.some((c) => c.name === 'apply_agent_change'));
      const proposal = calls.find((c) => c.name === 'propose_action')!;
      const payload = proposal.args.p_payload as {
        operations: { expectedVersion: number; data: unknown }[];
      };
      assert.equal(payload.operations[0].expectedVersion, task.version);
      assert.deepEqual(payload.operations[0].data, { due_date: '2026-12-01' });
    },
  );
});
