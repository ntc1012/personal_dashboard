import 'server-only';
import { redirect } from 'next/navigation';
import { isConfigured, ownerSession } from './supabase/server';
import { loadSnapshot } from '@/app/actions';
import Dashboard from '@/components/dashboard';
import Setup from '@/components/setup';
import type { Section } from './types';
export async function dashboardPage(section: Section) {
  if (!isConfigured())
    return <Setup demoEnabled={process.env.JARVIS_ENABLE_DEMO === 'true' && !process.env.VERCEL} />;
  let needsMfa = false;
  try {
    needsMfa = (await ownerSession()).needsMfa;
  } catch {
    redirect('/login');
  }
  if (needsMfa) redirect('/verify');
  const result = await loadSnapshot();
  if (!result.ok)
    return (
      <main className="setup-page">
        <h1>Chưa tải được không gian của bạn</h1>
        <p>{result.error}</p>
        <a href="/">Thử lại</a>
      </main>
    );
  return <Dashboard initial={result.value} mode="cloud" initialSection={section} />;
}
export const dashboardSections = [
  'home',
  'projects',
  'tasks',
  'configs',
  'chat',
  'settings',
  'study',
  'gym',
  'ai-usage',
  'vault',
  'monitor',
  'news',
  'review',
] as const;
