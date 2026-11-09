import type { NewsSource } from './news.types.js';

const MINUTE = 60_000;

/**
 * 默认信源按更新节律配置轮询间隔：滚动新闻快、垂直媒体慢。
 * 可通过 NEWS_SOURCES 环境变量传入 JSON 数组覆盖。
 */
export const DEFAULT_NEWS_SOURCES: NewsSource[] = [
  {
    id: 'chinanews',
    name: '中国新闻网',
    url: 'https://www.chinanews.com.cn/rss/scroll-news.xml',
    intervalMs: 3 * MINUTE,
    weight: 1,
  },
  {
    id: 'ithome',
    name: 'IT之家',
    url: 'https://www.ithome.com/rss/',
    intervalMs: 5 * MINUTE,
    weight: 0.9,
  },
  {
    id: '36kr',
    name: '36氪',
    url: 'https://36kr.com/feed',
    intervalMs: 5 * MINUTE,
    weight: 0.8,
  },
  {
    id: 'sspai',
    name: '少数派',
    url: 'https://sspai.com/feed',
    intervalMs: 15 * MINUTE,
    weight: 0.7,
  },
];

export function loadNewsSources(): NewsSource[] {
  const raw = process.env.NEWS_SOURCES;
  if (!raw) return DEFAULT_NEWS_SOURCES;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_NEWS_SOURCES;

    const sources = parsed.filter(isNewsSource).map((source) => ({
      ...source,
      weight: clampWeight(source.weight),
    }));

    return sources.length ? sources : DEFAULT_NEWS_SOURCES;
  } catch {
    return DEFAULT_NEWS_SOURCES;
  }
}

function isNewsSource(value: unknown): value is NewsSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<NewsSource>;
  return (
    typeof source.id === 'string' &&
    !!source.id.trim() &&
    typeof source.name === 'string' &&
    !!source.name.trim() &&
    typeof source.url === 'string' &&
    /^https?:\/\//i.test(source.url) &&
    typeof source.intervalMs === 'number' &&
    source.intervalMs >= 30_000 &&
    (source.weight === undefined || typeof source.weight === 'number')
  );
}

function clampWeight(weight: number | undefined): number {
  if (typeof weight !== 'number' || !Number.isFinite(weight)) return 1;
  return Math.min(1, Math.max(0, weight));
}
