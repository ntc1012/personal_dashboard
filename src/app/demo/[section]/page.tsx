import { notFound } from 'next/navigation';
import Dashboard from '@/components/dashboard';
import { demoSnapshot } from '@/lib/demo';
import { dashboardSections } from '@/lib/dashboard-page';
import type { Section } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function DemoSection({ params }: { params: Promise<{ section: string }> }) {
  if (process.env.JARVIS_ENABLE_DEMO !== 'true' || process.env.VERCEL) notFound();
  const { section } = await params;
  if (!(dashboardSections as readonly string[]).includes(section)) notFound();
  return <Dashboard initial={demoSnapshot()} mode="demo" initialSection={section as Section} />;
}
