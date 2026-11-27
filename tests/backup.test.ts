import test from 'node:test';
import assert from 'node:assert/strict';
import { demoSnapshot, demoMutate, type DemoState } from '../src/lib/demo';
import { planBackupRestore } from '../src/lib/backup';
import { blankModules } from '../src/lib/modules';
test('JSON restore validates and preserves dependencies, IDs and existing records', () => {
  const source = demoSnapshot();
  const empty = {
    ...source,
    ...blankModules(),
    projects: [],
    tasks: [],
    project_configs: [],
    changes: [],
  };
  const file = { format: 'jarvis-export-v1', data: source };
  const plan = planBackupRestore(file, empty);
  assert.equal(plan.operations[0].entity, 'projects');
  assert.ok(plan.operations.some((m) => m.entity === 'tasks'));
  const restored = plan.operations.reduce<DemoState>((state, m) => demoMutate(state, m), {
    snapshot: empty,
    events: [],
  });
  assert.equal(restored.snapshot.tasks.length, source.tasks.length);
  assert.equal(restored.snapshot.projects[0].id, source.projects.at(-1)?.id);
  assert.equal(planBackupRestore(file, restored.snapshot).operations.length, 0);
  const corrupt = structuredClone(file);
  corrupt.data.tasks[0].priority = 'invalid' as 'high';
  assert.throws(() => planBackupRestore(corrupt, empty));
});
