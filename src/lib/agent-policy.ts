export type AgentTool =
  | 'list_projects'
  | 'list_tasks'
  | 'get_connected_status'
  | 'get_project'
  | 'get_gym_summary'
  | 'get_ai_usage'
  | 'search_news'
  | 'get_weekly_review'
  | 'find_credential'
  | 'get_study_summary'
  | 'update_task'
  | 'search_configs'
  | 'get_monitor_status'
  | 'add_task'
  | 'log_workout'
  | 'log_study'
  | 'add_project_note'
  | 'mark_news_read'
  | 'bulk_update'
  | 'bulk_archive'
  | 'disable_monitor'
  | 'update_config'
  | 'send_notification'
  | 'read_vault_secret'
  | 'deploy'
  | 'read_env_value';
const tiers: Record<AgentTool, 1 | 2 | 3 | 4> = {
  list_projects: 1,
  list_tasks: 1,
  get_connected_status: 1,
  get_project: 1,
  get_gym_summary: 1,
  get_ai_usage: 1,
  search_news: 1,
  get_weekly_review: 1,
  find_credential: 1,
  get_study_summary: 1,
  update_task: 3,
  search_configs: 1,
  get_monitor_status: 1,
  add_task: 2,
  log_workout: 2,
  log_study: 2,
  add_project_note: 2,
  mark_news_read: 2,
  bulk_update: 3,
  bulk_archive: 3,
  disable_monitor: 3,
  update_config: 3,
  send_notification: 3,
  read_vault_secret: 4,
  deploy: 4,
  read_env_value: 4,
};
// The server owns this registry. Never accept a tier or approval flag from a model.
export function agentPolicy(tool: string) {
  if (!Object.hasOwn(tiers, tool))
    return { allowed: false, tier: null, confirmation: false, undo: false };
  const tier = tiers[tool as AgentTool];
  return { allowed: tier < 4, tier, confirmation: tier === 3, undo: tier === 2 };
}
