import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, publicUrl, safeHttp } from '../src/lib/server/safe-http';
import { parseFeed, parseSecurityFeed } from '../src/lib/server/news';
test('network checks reject loopback, private, metadata, mapped IPs and unusual URL schemes', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.1.1',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  for (const url of [
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://localhost',
    'http://app.local',
    'https://example.com:8443',
  ])
    assert.throws(() => publicUrl(url));
  await assert.rejects(safeHttp('http://2130706433/'), /bị chặn/);
  await assert.rejects(safeHttp('http://[::1]/'), /bị chặn/);
});
test('RSS parsing strips markup, blocks XML entities, handles Atom and deduplicates by URL', () => {
  const source = crypto.randomUUID();
  const rss =
    '<rss><channel><item><title>Next.js security</title><link>https://example.com/news</link><description><![CDATA[<script>steal()</script><b>Patch available</b>]]></description></item></channel></rss>';
  const first = parseFeed(rss, source, ['Next.js']);
  assert.equal(first.length, 1);
  assert.equal(first[0].summary, 'Patch available');
  assert.equal(parseFeed(rss, source)[0].external_id, first[0].external_id);
  assert.equal(parseFeed(rss, source, ['Postgres']).length, 0);
  assert.throws(() =>
    parseFeed('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', source),
  );
  const atom =
    '<feed><entry><title>Advisory</title><link rel="alternate" href="https://example.com/a"/><summary>Text</summary></entry></feed>';
  assert.equal(parseFeed(atom, source)[0].url, 'https://example.com/a');
  const kev = JSON.stringify({
    vulnerabilities: [
      {
        cveID: 'CVE-2026-12345',
        vulnerabilityName: 'Example product',
        shortDescription: 'Update available',
        dateAdded: '2026-11-27',
      },
    ],
  });
  assert.equal(parseSecurityFeed(kev, source)[0].tags[0], 'CVE-2026-12345');
});
