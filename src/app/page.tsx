import { redirect } from 'next/navigation';
import { isConfigured, ownerSession } from '@/lib/supabase/server';
import { loadSnapshot } from './actions';
import Dashboard from '@/components/dashboard';
import Setup from '@/components/setup';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function Home() {
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
  return <Dashboard initial={result.value} mode="cloud" />;
}
