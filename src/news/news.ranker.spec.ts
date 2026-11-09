import { rankNews, tokenizeQuery } from './news.ranker.js';
import type { NewsItem } from './news.types.js';

const now = Date.parse('2026-11-08T12:00:00Z');

function item(
  url: string,
  title: string,
  publishedAt: number,
  weight = 1,
  summary = '',
): NewsItem {
  return {
    id: url,
    title,
    summary,
    url,
    publishedAt,
    sourceId: 'test',
    sourceName: '测试',
    sourceWeight: weight,
  };
}

const news = [
  item('https://example.com/a', '普通新闻', now - 3_600_000, 1),
  item('https://example.com/b', '芯片行业新进展', now - 6 * 3_600_000, 0.8),
  item('https://example.com/c', '另一条新闻', now - 30 * 3_600_000, 0.5),
];

describe('rankNews', () => {
  it('无关键词时按综合时效与信源权重排序', () => {
    const ranked = rankNews(news, { now });

    expect(ranked.map((entry) => entry.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });

  it('关键词命中标题可以超过更新的普通新闻', () => {
    const ranked = rankNews(news, { now, query: '芯片' });

    expect(ranked[0]?.title).toBe('芯片行业新进展');
  });

  it('关键词命中摘要获得较低加分', () => {
    const items = [
      item('https://example.com/fresh', '最新消息', now),
      item('https://example.com/summary', '行业观察', now - 60_000, 1, '涉及量子计算'),
    ];

    const ranked = rankNews(items, { now, query: '量子计算' });

    expect(ranked[0]?.url).toBe('https://example.com/summary');
  });

  it('遵守 limit 并保持稳定排序', () => {
    const ranked = rankNews(news, { now, limit: 2 });

    expect(ranked).toHaveLength(2);
    expect(rankNews(news, { now, limit: 2 })).toEqual(ranked);
  });

  it('分词去掉短词与重复词', () => {
    expect(tokenizeQuery('AI，芯片  AI 的')).toEqual(['ai', '芯片']);
  });
});
