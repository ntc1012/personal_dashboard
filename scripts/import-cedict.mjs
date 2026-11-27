import { mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const url = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error('CC-CEDICT download failed.');
const compressed = Buffer.from(await response.arrayBuffer());
if (compressed.length > 15_000_000) throw new Error('Unexpected dataset size.');
const text = gunzipSync(compressed, { maxOutputLength: 40_000_000 }).toString('utf8');
if (!text.includes('CC-CEDICT') || text.split('\n').length < 50000)
  throw new Error('Dataset validation failed.');
await mkdir('data', { recursive: true });
await writeFile('data/cedict.txt.gz', compressed);
await writeFile(
  'data/CC-CEDICT-LICENSE.txt',
  text
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .join('\n') +
    '\n\nSource: ' +
    url +
    '\nDictionary licensed CC BY-SA 4.0. Attribution: CC-CEDICT contributors / MDBG.\nhttps://creativecommons.org/licenses/by-sa/4.0/\n',
);
console.log('CC-CEDICT downloaded and validated; license preserved.');
