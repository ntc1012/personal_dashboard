import 'server-only';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { TLSSocket } from 'node:tls';
import ipaddr from 'ipaddr.js';
export function isPublicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function publicUrl(raw: string) {
  const u = new URL(raw);
  if (
    !['http:', 'https:'].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.hash ||
    u.hostname.endsWith('.') ||
    !['', '80', '443'].includes(u.port)
  )
    throw new Error('URL không được phép.');
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    (!hostname.includes('.') && !hostname.includes(':'))
  )
    throw new Error('Chỉ cho phép địa chỉ internet công khai.');
  return u;
}
export type SafeResponse = {
  status: number;
  body: string;
  headers: Record<string, string>;
  sslExpiresAt: string | null;
};
export async function safeHttp(
  raw: string,
  {
    timeout = 8000,
    maxBytes = 2_000_000,
    redirects = 3,
    headersOnly = false,
  }: { timeout?: number; maxBytes?: number; redirects?: number; headersOnly?: boolean } = {},
): Promise<SafeResponse> {
  const u = publicUrl(raw),
    host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS timeout')), Math.min(timeout, 3000)).unref(),
    ),
  ]);
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error('Địa chỉ nội bộ hoặc dành riêng bị chặn.');
  const target = addresses.find((a) => a.family === 4) || addresses[0];
  const result = await new Promise<SafeResponse>((resolve, reject) => {
    const request = u.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      u,
      {
        method: 'GET',
        headers: {
          'user-agent': 'JARVIS-Personal-Monitor/1.0',
          accept: 'application/json, application/xml, text/xml, text/html, */*',
          'accept-encoding': 'identity',
        },
        lookup: (_hostname, _opts, callback) => {
          if (_opts.all) callback(null, [target]);
          else callback(null, target.address, target.family);
        },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers))
          if (v) headers[k] = Array.isArray(v) ? v.join(',') : v;
        let sslExpiresAt: string | null = null;
        if (u.protocol === 'https:') {
          const cert = (res.socket as TLSSocket).getPeerCertificate();
          const expires = cert?.valid_to ? new Date(cert.valid_to) : null;
          if (expires && !isNaN(expires.valueOf())) sslExpiresAt = expires.toISOString();
        }
        if (headersOnly) {
          resolve({ status: res.statusCode || 0, body: '', headers, sslExpiresAt });
          res.destroy();
          return;
        }
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy(new Error('Phản hồi vượt giới hạn kích thước.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers,
            sslExpiresAt,
          }),
        );
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Request timeout')), timeout);
    timer.unref();
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(result.status) && result.headers.location) {
    if (redirects <= 0) throw new Error('Quá nhiều chuyển hướng.');
    return safeHttp(new URL(result.headers.location, u).href, {
      timeout,
      maxBytes,
      redirects: redirects - 1,
      headersOnly,
    });
  }
  return result;
}
