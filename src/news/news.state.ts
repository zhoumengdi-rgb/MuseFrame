import type { NewsItem, NewsSource } from './news.types.js';

const MAX_ITEMS = 400;
const MAX_SEEN_URLS = 5000;
const WATERMARK_OVERLAP_MS = 5 * 60_000;

/**
 * 维护每个信源的水位线、全局 URL 去重集合与新闻缓存。
 * - 水位线之后的条目才会被接收（保留 5 分钟重叠，避免漏掉迟到条目，重复由 URL 去重兜底）
 * - 去重键是归一化 URL，跨信源生效
 */
export class NewsState {
  private readonly watermarks = new Map<string, number>();
  private readonly seen = new Map<string, number>();
  private readonly items = new Map<string, NewsItem>();

  ingest(source: NewsSource, incoming: NewsItem[], now = Date.now()): NewsItem[] {
    const accepted: NewsItem[] = [];
    let watermark = this.watermarks.get(source.id);

    for (const item of incoming) {
      if (watermark !== undefined && item.publishedAt <= watermark - WATERMARK_OVERLAP_MS) {
        continue;
      }
      if (this.seen.has(item.id)) continue;

      this.seen.set(item.id, now);
      this.items.set(item.id, item);
      accepted.push(item);

      if (watermark === undefined || item.publishedAt > watermark) {
        watermark = item.publishedAt;
      }
    }

    if (watermark !== undefined) {
      this.watermarks.set(source.id, watermark);
    }
    this.prune();
    return accepted;
  }

  all(): NewsItem[] {
    return [...this.items.values()];
  }

  getWatermark(sourceId: string): number | undefined {
    return this.watermarks.get(sourceId);
  }

  size(): number {
    return this.items.size;
  }

  private prune(): void {
    if (this.seen.size > MAX_SEEN_URLS) {
      const overflow = this.seen.size - MAX_SEEN_URLS;
      const oldest = [...this.seen.entries()]
        .sort(([, a], [, b]) => a - b)
        .slice(0, overflow);
      for (const [url] of oldest) {
        this.seen.delete(url);
      }
    }

    if (this.items.size > MAX_ITEMS) {
      const sorted = [...this.items.values()].sort((a, b) => b.publishedAt - a.publishedAt);
      for (const item of sorted.slice(MAX_ITEMS)) {
        this.items.delete(item.id);
      }
    }
  }
}
