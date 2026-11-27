import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
const files = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const parts = await Promise.all(
  files.map(
    async (file) =>
      '\n-- SOURCE: ' + file + '\n' + (await readFile('supabase/migrations/' + file, 'utf8')),
  ),
);
await mkdir('output/sql', { recursive: true });
await writeFile(
  'output/sql/jarvis-install.sql',
  '-- J.A.R.V.I.S. fresh installation. Run pending migrations only on an existing project.\n' +
    parts.join('\n'),
);
console.log('Bundled ' + files.length + ' migrations into output/sql/jarvis-install.sql.');
