const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'JARVIS_OWNER_ID',
];
let missing = false;
for (const key of required) {
  const exists = Boolean(process.env[key]);
  console.log(`${exists ? 'OK' : 'MISSING'} ${key}`);
  missing ||= !exists;
}
if (process.env.JARVIS_OWNER_ID && !/^[a-f0-9-]{36}$/i.test(process.env.JARVIS_OWNER_ID)) {
  console.log('INVALID JARVIS_OWNER_ID');
  missing = true;
}
if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32) {
  console.log('INVALID CRON_SECRET (minimum 32 characters)');
  missing = true;
}
const groups = {
  jobs: ['CRON_SECRET'],
  llm: ['LLM_API_KEY', 'LLM_MODEL'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  email: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL', 'NOTIFICATION_FROM'],
  github: ['GITHUB_TOKEN'],
  vercel: ['VERCEL_TOKEN'],
  github_webhook: ['GITHUB_WEBHOOK_SECRET'],
  vercel_webhook: ['VERCEL_WEBHOOK_SECRET'],
  todoist: ['TODOIST_TOKEN'],
  google_calendar: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
};
for (const [name, keys] of Object.entries(groups)) {
  const configured =
    keys.every((k) => process.env[k]) &&
    (name !== 'jobs' ||
      Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  console.log(`${configured ? 'CONFIGURED' : 'NOT CONFIGURED'} ${name}`);
}
console.log('Configuration values and credentials are never printed.');
process.exitCode = missing ? 1 : 0;
