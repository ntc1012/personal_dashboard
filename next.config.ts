import type { NextConfig } from 'next';
import { realtimeOrigins } from './src/lib/realtime-policy';
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  outputFileTracingIncludes: {
    '/api/dictionary': ['./data/cedict.txt.gz', './data/CC-CEDICT-LICENSE.txt'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cache-Control', value: 'private, no-store' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self'" +
              (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'" +
              realtimeOrigins(process.env.NEXT_PUBLIC_SUPABASE_URL) +
              (process.env.NODE_ENV === 'development' ? ' ws://127.0.0.1:*' : '') +
              "; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
      {
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};
export default config;
