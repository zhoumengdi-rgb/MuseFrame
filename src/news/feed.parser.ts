import { XMLParser } from 'fast-xml-parser';
import type { NewsItem, NewsSource } from './news.types.js';
import { normalizeUrl } from './url.util.js';

const TITLE_MAX_CHARS = 200;
const SUMMARY_MAX_CHARS = 300;

type XmlNode = Record<string, unknown>;

const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};

/** 解析 RSS 2.0 / RSS 1.0 / Atom，输出统一结构；忽略无法使用的条目。 */
export function parseFeed(xml: string, source: NewsSource, now = Date.now()): NewsItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    cdataPropName: '__cdata',
    textNodeName: '#text',
  });

  const doc = parser.parse(xml) as XmlNode;
  const items: NewsItem[] = [];

  for (const raw of extractRawItems(doc)) {
    const title = cleanText(textOf(raw.title), TITLE_MAX_CHARS);
    if (!title) continue;

    const link = extractLink(raw);
    if (!link) continue;

    const url = normalizeUrl(link, source.url);
    if (!url) continue;

    const published = parseDate(
      textOf(raw.pubDate ?? raw.published ?? raw.updated ?? raw['dc:date'] ?? raw.date),
    );
    const publishedAt = published ?? now;
    const summary = cleanText(
      textOf(raw.description ?? raw.summary ?? raw['content:encoded'] ?? raw.content ?? raw['media:description']),
      SUMMARY_MAX_CHARS,
    );

    items.push({
      id: url,
      title,
      summary,
      url,
      publishedAt,
      sourceId: source.id,
      sourceName: source.name,
      sourceWeight: source.weight,
    });
  }

  return items;
}

export function cleanText(input: string, maxChars: number): string {
  const withoutBlocks = input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const decoded = decodeEntities(withoutBlocks.replace(/<[^>]+>/g, ' '));
  const text = decoded.replace(/\s+/g, ' ').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function extractRawItems(doc: XmlNode): XmlNode[] {
  const rss = asNode(doc.rss);
  const channel = asNode(rss?.channel);
  if (channel) {
    const items = toArray(channel.item).map(asNode).filter(isNode);
    if (items.length) return items;
  }

  const rdf = asNode(doc['rdf:RDF']);
  if (rdf) {
    const items = toArray(rdf.item).map(asNode).filter(isNode);
    if (items.length) return items;
  }

  const feed = asNode(doc.feed);
  if (feed) {
    return toArray(feed.entry).map(asNode).filter(isNode);
  }

  return [];
}

function extractLink(raw: XmlNode): string | null {
  const link = raw.link;
  if (typeof link === 'string') return link.trim();

  const links = toArray(link).map(asNode).filter(isNode);
  const alternate = links.find((item) => !item['@_rel'] || item['@_rel'] === 'alternate');
  const href = alternate?.['@_href'];
  if (typeof href === 'string') return href.trim();

  const id = textOf(raw.id);
  return id.startsWith('http') ? id : null;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (isNode(value)) {
    if (typeof value.__cdata === 'string') return value.__cdata;
    if (typeof value['#text'] === 'string') return value['#text'];
  }
  return '';
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return codePoint(Number.parseInt(lower.slice(2), 16), match);
    if (lower.startsWith('#')) return codePoint(Number.parseInt(lower.slice(1), 10), match);
    return namedEntities[lower] ?? match;
  });
}

function codePoint(value: number, fallback: string): string {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

function asNode(value: unknown): XmlNode | undefined {
  return isNode(value) ? value : undefined;
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
