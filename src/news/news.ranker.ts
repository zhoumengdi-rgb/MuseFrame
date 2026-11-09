import type { NewsItem } from './news.types.js';

const RECENCY_MAX = 60;
const SOURCE_MAX = 20;
const KEYWORD_MAX = 40;
const DEFAULT_HALF_LIFE_HOURS = 12;

export interface RankOptions {
  query?: string;
  now?: number;
  limit?: number;
  halfLifeHours?: number;
}

/**
 * 排序函数：时效性（半衰期衰减）+ 信源权重 + 关键词命中。
 * 无关键词时按时效与信源综合排序，保证“今天发生了什么”优先返回新内容。
 */
export function rankNews(items: NewsItem[], options: RankOptions = {}): NewsItem[] {
  const now = options.now ?? Date.now();
  const halfLifeHours = options.halfLifeHours ?? DEFAULT_HALF_LIFE_HOURS;
  const tokens = tokenizeQuery(options.query ?? '');
  const limit = options.limit ?? items.length;

  return items
    .map((item) => ({ item, score: scoreItem(item, now, halfLifeHours, tokens) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.publishedAt - a.item.publishedAt ||
        a.item.url.localeCompare(b.item.url),
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function tokenizeQuery(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[\s,，。！？、；;：:()（）[\]【】"“”'‘’/|]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ];
}

function scoreItem(item: NewsItem, now: number, halfLifeHours: number, tokens: string[]): number {
  const ageHours = Math.max(0, (now - item.publishedAt) / 3_600_000);
  const recency = RECENCY_MAX * Math.pow(0.5, ageHours / halfLifeHours);
  const source = SOURCE_MAX * clamp01(item.sourceWeight);

  if (!tokens.length) return recency + source;

  const title = item.title.toLowerCase();
  const summary = item.summary.toLowerCase();
  let keyword = 0;
  for (const token of tokens) {
    if (title.includes(token)) keyword += 20;
    else if (summary.includes(token)) keyword += 5;
  }

  return recency + source + Math.min(keyword, KEYWORD_MAX);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
