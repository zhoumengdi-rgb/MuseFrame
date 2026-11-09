import { NewsState } from './news.state.js';
import type { NewsItem, NewsSource } from './news.types.js';

const sourceA: NewsSource = {
  id: 'source-a',
  name: 'A',
  url: 'https://a.example.com/feed',
  intervalMs: 60_000,
  weight: 1,
};

const sourceB: NewsSource = {
  id: 'source-b',
  name: 'B',
  url: 'https://b.example.com/feed',
  intervalMs: 60_000,
  weight: 0.8,
};

function item(url: string, publishedAt: number, source: NewsSource = sourceA): NewsItem {
  return {
    id: url,
    title: url,
    summary: '',
    url,
    publishedAt,
    sourceId: source.id,
    sourceName: source.name,
    sourceWeight: source.weight,
  };
}

describe('NewsState', () => {
  it('水位线只接收新条目，并推进水位线', () => {
    const now = Date.now();
    const state = new NewsState();

    const first = state.ingest(sourceA, [item('https://example.com/1', now - 3_600_000)], now);
    expect(first).toHaveLength(1);

    const second = state.ingest(
      sourceA,
      [
        item('https://example.com/old', now - 7_200_000),
        item('https://example.com/new', now),
      ],
      now,
    );

    expect(second.map((entry) => entry.url)).toEqual(['https://example.com/new']);
    expect(state.getWatermark(sourceA.id)).toBe(now);
  });

  it('保留 5 分钟重叠窗口，迟到条目由 URL 去重兜底', () => {
    const now = Date.now();
    const state = new NewsState();

    state.ingest(sourceA, [item('https://example.com/a', now)], now);
    const late = state.ingest(
      sourceA,
      [
        item('https://example.com/a', now),
        item('https://example.com/late', now - 60_000),
      ],
      now,
    );

    expect(late.map((entry) => entry.url)).toEqual(['https://example.com/late']);
  });

  it('归一化 URL 跨信源去重，同一批次内也去重', () => {
    const state = new NewsState();
    const now = Date.now();
    const url = 'https://example.com/shared';

    expect(state.ingest(sourceA, [item(url, now), item(url, now)], now)).toHaveLength(1);
    expect(state.ingest(sourceB, [item(url, now + 1, sourceB)], now)).toHaveLength(0);
    expect(state.size()).toBe(1);
  });

  it('不同 URL 即使标题相同也会保留', () => {
    const state = new NewsState();
    const now = Date.now();

    const accepted = state.ingest(
      sourceA,
      [item('https://example.com/a', now), item('https://example.com/b', now)],
      now,
    );

    expect(accepted).toHaveLength(2);
  });
});
