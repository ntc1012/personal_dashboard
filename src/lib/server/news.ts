import 'server-only';
import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { extraSchemas } from '../modules';
export function plainText(value: unknown, max = 4000) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
export function parseFeed(xml: string, sourceId: string, keywords: string[] = []) {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('RSS không hợp lệ hoặc vượt giới hạn.');
  if (XMLValidator.validate(xml) !== true) throw new Error('RSS / Atom không hợp lệ.');
  const p = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    trimValues: true,
  });
  const data = p.parse(xml),
    raw = data?.rss?.channel?.item || data?.feed?.entry || [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.slice(0, 100).flatMap((item) => {
    const title = plainText(item.title?.['#text'] ?? item.title, 500);
    const links = Array.isArray(item.link) ? item.link : [item.link];
    const link =
      links.find(
        (v: unknown) =>
          typeof v === 'object' && v !== null && (!('@_rel' in v) || v['@_rel'] === 'alternate'),
      ) ?? links[0];
    const url = typeof link === 'string' ? link : link?.['@_href'];
    const summary = plainText(
      item.description ??
        item.summary?.['#text'] ??
        item.summary ??
        item.content?.['#text'] ??
        item.content,
    );
    const tags = keywords.filter((k) =>
      (title + ' ' + summary).toLowerCase().includes(k.toLowerCase()),
    );
    if (keywords.length && !tags.length) return [];
    const time = new Date(item.pubDate || item.published || item.updated || '');
    const parsed = extraSchemas.news_items.safeParse({
      source_id: sourceId,
      title,
      url,
      summary,
      published_at: isNaN(time.valueOf()) ? null : time.toISOString(),
      tags,
      read: false,
      external_id: createHash('sha256').update(String(url)).digest('hex'),
    });
    return parsed.success ? [parsed.data] : [];
  });
}
export function parseSecurityFeed(raw: string, sourceId: string, keywords: string[] = []) {
  if (!raw.trimStart().startsWith('{')) return parseFeed(raw, sourceId, keywords);
  if (raw.length > 2_000_000) throw new Error('Nguồn CVE vượt giới hạn.');
  const doc = JSON.parse(raw);
  if (!Array.isArray(doc.vulnerabilities)) throw new Error('Chỉ hỗ trợ JSON CISA KEV.');
  return (doc.vulnerabilities as Record<string, unknown>[])
    .slice(-100)
    .reverse()
    .flatMap((v) => {
      const cve = String(v.cveID || '');
      if (!/^CVE-\d{4}-\d{4,8}$/.test(cve)) return [];
      const title = plainText(`${cve} · ${v.vulnerabilityName || v.product || ''}`, 500),
        summary = plainText(v.shortDescription);
      const tags = keywords.filter((k) =>
        (title + ' ' + summary + ' ' + v.vendorProject).toLowerCase().includes(k.toLowerCase()),
      );
      if (keywords.length && !tags.length) return [];
      const url = `https://www.cve.org/CVERecord?id=${cve}`,
        date = new Date(String(v.dateAdded || ''));
      return [
        extraSchemas.news_items.parse({
          source_id: sourceId,
          title,
          url,
          summary,
          published_at: isNaN(date.valueOf()) ? null : date.toISOString(),
          tags: [cve, ...tags].slice(0, 30),
          read: false,
          external_id: createHash('sha256').update(url).digest('hex'),
        }),
      ];
    });
}
