import type {
  ModuleMap,
  ExtraEntity,
  MonitorCheck,
  Incident,
  AgentLog,
  IntegrationSnapshot,
  JobRun,
} from './modules';
import type {
  IntegrationConnection,
  ConnectedItem,
  IntegrationActivity,
} from './integration-model';
export type Section =
  | 'home'
  | 'projects'
  | 'tasks'
  | 'configs'
  | 'chat'
  | 'settings'
  | 'study'
  | 'gym'
  | 'ai-usage'
  | 'vault'
  | 'monitor'
  | 'news'
  | 'review';
export type CoreEntity = 'projects' | 'tasks' | 'project_configs';
export type Entity = CoreEntity | ExtraEntity;
export type Group = 'personal' | 'school' | 'work';
export type RecordBase = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
export type Project = RecordBase & {
  vercel_project_id?: string;
  name: string;
  category: Group;
  prod_url: string;
  repo_url: string;
  stack: string;
  status: 'active' | 'paused' | 'done';
  notes: string;
};
export type Task = RecordBase & {
  title: string;
  project_id: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  done_at: string | null;
  notes: string;
};
export type ProjectConfig = RecordBase & {
  project_id: string;
  title: string;
  run_steps: string;
  deploy_steps: string;
  env_var_names: string;
  runtime: string;
  troubleshooting: string;
};
export type Change = {
  id: string;
  entity: Entity;
  record_id: string;
  action: 'create' | 'update' | 'archive';
  created_at: string;
  undone_at: string | null;
  after_version: number;
};
export type Snapshot = ModuleMap & {
  projects: Project[];
  tasks: Task[];
  project_configs: ProjectConfig[];
  changes: Change[];
  monitor_checks: MonitorCheck[];
  incidents: Incident[];
  agent_logs: AgentLog[];
  integration_snapshots: IntegrationSnapshot[];
  job_runs: JobRun[];
  integration_connections: IntegrationConnection[];
  connected_items: ConnectedItem[];
  integration_activity: IntegrationActivity[];
};
export type Mutation = {
  entity: Entity;
  action: 'create' | 'update' | 'archive';
  id: string;
  expectedVersion?: number;
  data: Record<string, unknown>;
};
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
