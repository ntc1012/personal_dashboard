import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = 'a0000000-0000-4000-8000-000000000001';
const other = 'b0000000-0000-4000-8000-000000000001';
const project = 'c0000000-0000-4000-8000-000000000001';
const task = 'd0000000-0000-4000-8000-000000000001';
test('database enforces owner isolation, atomic mutations and versioned undo', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', current_setting('request.jwt.claim.aal',true)) $$; create table auth.mfa_factors(id uuid primary key,user_id uuid,status text); create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; insert into auth.users values('${owner}'),('${other}');`,
    );
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611270001_core.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.exec(
      `insert into private.app_owner values('${owner}'); set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    async function change(
      entity: string,
      action: string,
      id: string,
      data: object,
      version: number | null = null,
    ) {
      const r = await db.query<{ event: { id: string } }>(
        'select public.apply_change($1,$2,$3,$4::jsonb,$5) as event',
        [entity, action, id, JSON.stringify(data), version],
      );
      return r.rows[0].event;
    }
    const created = await change('projects', 'create', project, {
      name: 'Private project',
      category: 'personal',
      prod_url: '',
      repo_url: '',
      stack: '',
      status: 'active',
      notes: '',
    });
    assert.ok(created.id);
    const taskEvent = await change('tasks', 'create', task, {
      title: 'Task',
      project_id: project,
      due_date: '2026-11-27',
      priority: 'high',
      status: 'todo',
      notes: '',
    });
    await assert.rejects(change('projects', 'archive', project, {}, 1), /active_children/);
    await assert.rejects(change('tasks', 'update', task, { user_id: other }, 1), /invalid_field/);
    await assert.rejects(
      db.query(
        `insert into public.tasks(id,user_id,title,priority,status) values($1,$2,'bypass','high','todo')`,
        ['e0000000-0000-4000-8000-000000000001', owner],
      ),
      /permission denied/,
    );
    await change('tasks', 'update', task, { status: 'done' }, 1);
    await assert.rejects(
      change('tasks', 'update', task, { title: 'stale' }, 1),
      /version_conflict/,
    );
    await assert.rejects(
      db.query('select public.undo_change($1)', [taskEvent.id]),
      /version_conflict/,
    );
    const events = await db.query<{ id: string }>(
      'select id from public.changes where record_id=$1 and action=$2',
      [task, 'update'],
    );
    await db.query('select public.undo_change($1)', [events.rows[0].id]);
    const restored = await db.query<{ status: string; version: number; done_at: string | null }>(
      'select status,version,done_at from public.tasks where id=$1',
      [task],
    );
    assert.deepEqual(restored.rows[0], { status: 'todo', version: 3, done_at: null });
    await assert.rejects(
      db.query('select public.undo_change($1)', [events.rows[0].id]),
      /invalid_undo/,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query('select * from public.projects')).rows.length, 0);
    await assert.rejects(change('tasks', 'update', task, { title: 'intruder' }, 3), /unauthorized/);
    await assert.rejects(db.query('select public.undo_change($1)', [created.id]), /unauthorized/);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    const archived = await change('tasks', 'archive', task, {}, 3);
    const configId = 'e0000000-0000-4000-8000-000000000001';
    await assert.rejects(
      change('project_configs', 'create', configId, {
        project_id: project,
        title: 'Secrets',
        run_steps: '',
        deploy_steps: '',
        runtime: '',
        troubleshooting: '',
        env_var_names: 'API_KEY=secret',
      }),
      /check constraint/,
    );
    await change('project_configs', 'create', configId, {
      project_id: project,
      title: 'Config',
      run_steps: 'npm run dev',
      deploy_steps: '',
      runtime: 'Node.js',
      troubleshooting: '',
      env_var_names: 'API_KEY\nDATABASE_URL',
    });
    await change('project_configs', 'archive', configId, {}, 1);
    await change('projects', 'archive', project, {}, 1);
    await assert.rejects(
      db.query('select public.undo_change($1)', [archived.id]),
      /invalid_project/,
    );
    await db.exec(
      `reset role; insert into auth.mfa_factors values ('f0000000-0000-4000-8000-000000000001','${owner}','verified'); set role authenticated; select set_config('request.jwt.claim.aal','aal1',false);`,
    );
    assert.equal((await db.query('select * from public.projects')).rows.length, 0);
    await assert.rejects(
      change('tasks', 'create', 'f0000000-0000-4000-8000-000000000002', {
        title: 'bypass MFA',
        priority: 'high',
        status: 'todo',
        notes: '',
      }),
      /unauthorized/,
    );
    await db.exec(`select set_config('request.jwt.claim.aal','aal2',false);`);
    assert.equal((await db.query('select * from public.projects')).rows.length, 1);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.tasks'), /permission denied/);
    await assert.rejects(
      db.query('select public.undo_change($1)', [created.id]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
