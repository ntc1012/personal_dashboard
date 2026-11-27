import { notFound } from 'next/navigation';
import Dashboard from '@/components/dashboard';
import { demoSnapshot } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default function Demo() {
  if (process.env.JARVIS_ENABLE_DEMO !== 'true' || process.env.VERCEL) notFound();
  return <Dashboard initial={demoSnapshot()} mode="demo" />;
}
