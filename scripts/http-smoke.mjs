import assert from 'node:assert/strict';
const base = process.env.SMOKE_URL || 'http://127.0.0.1:3000';
const setup = await fetch(base);
assert.equal(setup.status, 200);
const setupText = await setup.text();
assert.match(setupText, /Chưa kết nối dữ liệu cá nhân/);
assert.equal(setup.headers.get('x-frame-options'), 'DENY');
assert.match(setup.headers.get('content-security-policy'), /frame-ancestors 'none'/);
const login = await fetch(base + '/login', { redirect: 'manual' });
assert.equal(login.status, 307);
assert.equal(new URL(login.headers.get('location'), base).pathname, '/');
const demo = await fetch(base + '/demo');
assert.equal(demo.status, 200);
const text = await demo.text();
assert.match(text, /BẢN DÙNG THỬ/);
assert.match(text, /Không gian của bạn/);
assert.match(text, /J.A.R.V.I.S./);
assert.doesNotMatch(text, /service_role|sb_secret_/);
const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
assert.equal(manifest.display, 'standalone');
for (const icon of manifest.icons) {
  assert.equal((await fetch(base + icon.src)).status, 200);
}
const cssPaths = [...text.matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map((m) =>
  m[1].replaceAll('&amp;', '&'),
);
assert.ok(cssPaths.length);
for (const path of cssPaths) assert.equal((await fetch(new URL(path, base))).status, 200);
console.log(
  'HTTP smoke passed: setup, login redirect, demo, security headers, manifest, icons and CSS.',
);

const sections = [
  'projects',
  'tasks',
  'configs',
  'study',
  'gym',
  'ai-usage',
  'vault',
  'monitor',
  'news',
  'review',
  'chat',
  'settings',
];
for (const section of sections) {
  const res = await fetch(base + '/demo/' + section);
  assert.equal(res.status, 200, section);
  const html = await res.text();
  assert.ok(!html.includes('Internal Server Error'), section);
  assert.match(html, /BẢN DÙNG THỬ/);
}
assert.equal((await fetch(base + '/api/cron/monitor')).status, 401);
assert.equal((await fetch(base + '/api/cron/integrations')).status, 401);
assert.equal(
  (await fetch(base + '/api/webhooks/unknown', { method: 'POST', body: '{}' })).status,
  404,
);
assert.equal(
  (await fetch(base + '/api/webhooks/github', { method: 'POST', body: '{}' })).status,
  503,
);
assert.equal(
  (
    await fetch(base + '/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ text: 'test', requestId: 'bad' }),
    })
  ).status,
  401,
);
const dictionary = await fetch(
  base + '/api/dictionary?language=zh&term=' + encodeURIComponent('你好'),
);
assert.equal(dictionary.status, 200);
const definitions = await dictionary.json();
assert.ok(definitions.definitions.some((s) => s.includes('hello')));
assert.equal((await fetch(base + '/sw.js')).status, 200);
assert.equal((await fetch(base + '/offline.html')).status, 200);
console.log('All module routes, protected APIs, Chinese dictionary and offline shell passed.');

assert.match(text, /Nhấn để vào/);
for (const [path, size, signature] of [
  ['/media/color-your-night-55e3ce1e6324.mp4', 44630474, 'ftyp'],
  ['/media/color-your-night-3461b3e453d8.mp3', 5534876, 'ID3'],
]) {
  const result = await fetch(base + path, { headers: { Range: 'bytes=0-31' } });
  assert.equal(result.status, 206, path);
  assert.equal(result.headers.get('content-range'), `bytes 0-31/${size}`);
  assert.match(result.headers.get('cache-control'), /public.*immutable/);
  assert.equal(result.headers.get('set-cookie'), null);
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(bytes.length, 32);
  assert.ok(bytes.toString('latin1').includes(signature), path);
}
console.log(
  'Fixed background media passed: entry screen, partial downloads, file signatures and cache.',
);
