import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { z } from 'zod';
import { requireOwner } from '@/lib/supabase/server';
import { indexCedict } from '@/lib/cedict';
export const runtime = 'nodejs';
let cedict: Map<string, string[]> | null = null;
async function chinese(term: string) {
  if (!cedict) {
    const raw = gunzipSync(await readFile(join(process.cwd(), 'data', 'cedict.txt.gz')), {
      maxOutputLength: 40_000_000,
    }).toString('utf8');
    cedict = indexCedict(raw);
  }
  return cedict.get(term) || [];
}
export async function GET(request: Request) {
  if (!(process.env.JARVIS_ENABLE_DEMO === 'true' && !process.env.VERCEL)) {
    try {
      const { db } = await requireOwner();
      const { data, error } = await db.rpc('take_rate', {
        p_bucket: 'dictionary',
        p_limit: 30,
        p_seconds: 60,
      });
      if (error || !data)
        return Response.json({ error: 'Hãy chờ trước khi tra tiếp.' }, { status: 429 });
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  try {
    const params = new URL(request.url).searchParams;
    const language = z.enum(['en', 'zh']).parse(params.get('language'));
    const term = z.string().trim().min(1).max(60).parse(params.get('term'));
    if (language === 'zh') {
      const definitions = await chinese(term);
      return Response.json({
        definitions: definitions.length ? definitions : ['Không tìm thấy từ này trong CC-CEDICT.'],
        attribution: 'CC-CEDICT contributors / MDBG, CC BY-SA 4.0',
      });
    }
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(6000), cache: 'no-store' },
    );
    if (res.status === 404) return Response.json({ definitions: ['Không tìm thấy từ này.'] });
    if (!res.ok) throw new Error('Dictionary unavailable');
    const data = await res.json();
    const definitions: string[] = [];
    for (const entry of (Array.isArray(data) ? data : []).slice(0, 3))
      for (const meaning of entry.meanings || [])
        for (const definition of (meaning.definitions || []).slice(0, 3))
          if (typeof definition.definition === 'string')
            definitions.push(`${meaning.partOfSpeech}: ${definition.definition}`.slice(0, 1000));
    return Response.json({ definitions: definitions.slice(0, 10) });
  } catch {
    return Response.json(
      { error: 'Không tra được từ. Kiểm tra kết nối; từ điển Trung cần dữ liệu CC-CEDICT đã tải.' },
      { status: 503 },
    );
  }
}
