export function indexCedict(raw: string) {
  const map = new Map<string, string[]>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(\S+) (\S+) \[{1,2}([^\]]+)\]{1,2} \/(.+)\/$/);
    if (!match) continue;
    for (const key of new Set([match[1], match[2]])) {
      const entries = map.get(key) || [];
      if (entries.length < 8) entries.push(`[${match[3]}] ${match[4].replaceAll('/', '; ')}`);
      map.set(key, entries);
    }
  }
  return map;
}
