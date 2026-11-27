import { notFound } from 'next/navigation';
import { dashboardPage, dashboardSections } from '@/lib/dashboard-page';
import type { Section } from '@/lib/types';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(dashboardSections as readonly string[]).includes(section)) notFound();
  return dashboardPage(section as Section);
}
