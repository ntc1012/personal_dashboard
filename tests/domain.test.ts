import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, taskBuckets, validateMutation } from '../src/lib/domain';
import { demoSnapshot, demoMutate, demoUndo, type DemoState } from '../src/lib/demo';
import { planAssistant } from '../src/lib/assistant';
import { agentPolicy } from '../src/lib/agent-policy';
const id = 'f0000000-0000-4000-8000-000000000001';
test('partial updates preserve project, deadline, notes and module defaults', () => {
  assert.deepEqual(
    validateMutation({
      entity: 'tasks',
      action: 'update',
      id,
      expectedVersion: 1,
      data: { status: 'done' },
    }).data,
    { status: 'done' },
  );
  assert.deepEqual(
    validateMutation({
      entity: 'monitors',
      action: 'update',
      id,
      expectedVersion: 1,
      data: { enabled: false },
    }).data,
    { enabled: false },
  );
  assert.deepEqual(
    validateMutation({
      entity: 'project_configs',
      action: 'update',
      id,
      expectedVersion: 1,
      data: { title: 'New title' },
    }).data,
    { title: 'New title' },
  );
});
test('day boundaries use Bangkok, independent of host timezone', () => {
  assert.equal(dateKey(new Date('2026-11-27T16:59:59Z')), '2026-11-27');
  assert.equal(dateKey(new Date('2026-11-27T17:00:00Z')), '2026-11-28');
});
test('validation blocks secret fields, script URLs and invalid dates', () => {
  assert.throws(() =>
    validateMutation({
      entity: 'tasks',
      action: 'create',
      id,
      data: { title: 'task', priority: 'high', status: 'todo', due_date: '2026-02-31' },
    }),
  );
  assert.throws(() =>
    validateMutation({
      entity: 'projects',
      action: 'create',
      id,
      data: {
        name: 'bad',
        category: 'personal',
        status: 'active',
        prod_url: 'javascript:alert(1)',
      },
    }),
  );
  assert.throws(() =>
    validateMutation({
      entity: 'project_configs',
      action: 'create',
      id,
      data: { project_id: id, title: 'bad', env_var_names: 'API_KEY=secret' },
    }),
  );
  assert.throws(() =>
    validateMutation({
      entity: 'tasks',
      action: 'update',
      id,
      expectedVersion: 1,
      data: { user_id: id },
    }),
  );
});
test('undo survives serialized demo state and cannot overwrite a newer change', () => {
  let s: DemoState = { snapshot: demoSnapshot(), events: [] };
  s = demoMutate(s, {
    entity: 'tasks',
    action: 'create',
    id,
    data: { title: 'persistent undo', priority: 'medium', status: 'todo' },
  });
  const event = s.events[0].id;
  s = JSON.parse(JSON.stringify(s));
  const undone = demoUndo(s, event);
  assert.ok(undone.snapshot.tasks.find((t) => t.id === id)?.archived_at);
  assert.throws(() => demoUndo(undone, event));
  s = demoMutate(s, {
    entity: 'tasks',
    action: 'update',
    id,
    expectedVersion: 1,
    data: { title: 'newer' },
  });
  assert.throws(() => demoUndo(s, event), /sửa tiếp/);
});
test('assistant adds only explicit tasks; blocks sensitive actions and invents no monitor status', () => {
  const snapshot = demoSnapshot();
  assert.equal(planAssistant('Hôm nay nên học gì?', snapshot, id).mutation, undefined);
  assert.equal(
    planAssistant('Thêm task: Học tiếng Anh', snapshot, id).mutation?.data.title,
    'Học tiếng Anh',
  );
  assert.match(planAssistant('Web nào đang lỗi?', snapshot, id).text, /chưa được kết nối/);
  assert.equal(agentPolicy('read_vault_secret').allowed, false);
  assert.equal(agentPolicy('unknown').allowed, false);
  assert.equal(agentPolicy('bulk_update').confirmation, true);
  const b = taskBuckets(snapshot.tasks, dateKey());
  assert.ok(b.today.every((t) => t.status === 'todo'));
});
