import type { Metadata, Viewport } from 'next';
import './globals.css';
import './utilities.css';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/vietnamese-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './modules.css';
import PwaSupport from '@/components/pwa-support';
import BackgroundMedia from '@/components/background-media';
import './background-media.css';
import DashboardMotion from '@/components/dashboard-motion';
import './dashboard-motion.css';
import './background-palettes.css';
import './persona-menu.css';
export const maxDuration = 60;
export const metadata: Metadata = {
  title: 'J.A.R.V.I.S. — Personal dashboard',
  description: 'Không gian cá nhân cho dự án, công việc và những điều cần nhớ.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: 'J.A.R.V.I.S.', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#08152e' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <DashboardMotion>
          <BackgroundMedia />
          {children}
        </DashboardMotion>
        <PwaSupport />
      </body>
    </html>
  );
}
