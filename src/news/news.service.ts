import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { parseFeed } from './feed.parser.js';
import { rankNews } from './news.ranker.js';
import { loadNewsSources } from './news.sources.js';
import { NewsState } from './news.state.js';
import type { NewsQuery, NewsSource, NewsSourceStatus } from './news.types.js';

const FETCH_TIMEOUT_MS = 8_000;
const BOOTSTRAP_HOURS = 48;
const TICK_MS = 15_000;
const MAX_FEED_CHARS = 2 * 1024 * 1024;
const QUERY_CACHE_TTL_MS = 30_000;
const MAX_QUERY_CACHE_ENTRIES = 50;
const DEFAULT_HOURS = 24;
const DEFAULT_LIMIT = 8;

interface SourceRuntime {
  source: NewsSource;
  nextPollAt: number;
  lastFetchedAt: number | null;
  lastError: string | null;
  failures: number;
  inFlight: boolean;
}

interface CachedResult {
  expiresAt: number;
  value: string;
}

@Injectable()
export class NewsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsService.name);
  private readonly state = new NewsState();
  private readonly runtime = new Map<string, SourceRuntime>();
  private readonly queryCache = new Map<string, CachedResult>();
  private timer?: NodeJS.Timeout;
  private bootstrap?: Promise<void>;
  private lastBootstrapAt = 0;

  constructor() {
    for (const source of loadNewsSources()) {
      this.runtime.set(source.id, {
        source,
        nextPollAt: 0,
        lastFetchedAt: null,
        lastError: null,
        failures: 0,
        inFlight: false,
      });
    }
  }

  onModuleInit(): void {
    void this.startBootstrap();
    this.timer = setInterval(() => {
      void this.pollDueSources();
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * 返回按关键词与时效排序的新闻 JSON，供工具调用使用。
   * 首次调用会等待启动时的首轮抓取，避免返回空结果。
   */
  async getLatest(query: NewsQuery = {}): Promise<string> {
    if (!this.state.size()) {
      await this.ensureInitialData();
    }

    const hours = clampInt(query.hours, 1, 72, DEFAULT_HOURS);
    const limit = clampInt(query.limit, 1, 20, DEFAULT_LIMIT);
    const keyword = (query.query ?? '').trim();

    const cacheKey = `${keyword}|${hours}|${limit}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const now = Date.now();
    const since = now - hours * 3_600_000;
    const recent = this.state.all().filter((item) => item.publishedAt >= since);
    const ranked = rankNews(recent, { query: keyword, now, limit });

    const payload = JSON.stringify(
      {
        windowHours: hours,
        count: ranked.length,
        items: ranked.map((item) => ({
          title: item.title,
          source: item.sourceName,
          publishedAt: new Date(item.publishedAt).toISOString(),
          url: item.url,
          summary: item.summary,
        })),
        sources: this.status().map((source) => ({
          name: source.name,
          ok: source.ok,
          itemCount: source.itemCount,
          error: source.lastError,
        })),
      },
      null,
      2,
    );

    this.queryCache.set(cacheKey, {
      expiresAt: now + QUERY_CACHE_TTL_MS,
      value: payload,
    });
    this.trimQueryCache();
    return payload;
  }

  status(): NewsSourceStatus[] {
    const counts = new Map<string, number>();
    for (const item of this.state.all()) {
      counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
    }

    return [...this.runtime.values()].map((runtime) => ({
      id: runtime.source.id,
      name: runtime.source.name,
      ok: runtime.lastError === null && runtime.lastFetchedAt !== null,
      lastFetchedAt: runtime.lastFetchedAt,
      lastError: runtime.lastError,
      itemCount: counts.get(runtime.source.id) ?? 0,
    }));
  }

  private startBootstrap(): Promise<void> {
    if (this.state.size()) return Promise.resolve();
    this.lastBootstrapAt = Date.now();
    const pending = this.refreshAll().finally(() => {
      this.bootstrap = undefined;
    });
    this.bootstrap = pending;
    return pending;
  }

  private async ensureInitialData(): Promise<void> {
    if (this.state.size()) return;
    if (this.bootstrap) {
      await this.bootstrap;
      return;
    }
    if (Date.now() - this.lastBootstrapAt < QUERY_CACHE_TTL_MS) return;
    await this.startBootstrap();
  }

  private async refreshAll(): Promise<void> {
    await Promise.allSettled([...this.runtime.values()].map((runtime) => this.refreshSource(runtime)));
  }

  private async pollDueSources(): Promise<void> {
    const now = Date.now();
    const due = [...this.runtime.values()].filter(
      (runtime) => !runtime.inFlight && runtime.nextPollAt <= now,
    );
    await Promise.allSettled(due.map((runtime) => this.refreshSource(runtime)));
  }

  private async refreshSource(runtime: SourceRuntime): Promise<void> {
    if (runtime.inFlight) return;
    runtime.inFlight = true;

    try {
      const xml = await fetchFeed(runtime.source.url);
      const parsed = parseFeed(xml, runtime.source);

      const firstFetch = runtime.lastFetchedAt === null && !this.state.getWatermark(runtime.source.id);
      const cutoff = Date.now() - BOOTSTRAP_HOURS * 3_600_000;
      const incoming = firstFetch ? parsed.filter((item) => item.publishedAt >= cutoff) : parsed;

      const accepted = this.state.ingest(runtime.source, incoming);
      if (accepted.length) this.queryCache.clear();

      runtime.failures = 0;
      runtime.lastError = null;
      runtime.lastFetchedAt = Date.now();
      runtime.nextPollAt = Date.now() + withJitter(runtime.source.intervalMs);
    } catch (error) {
      runtime.failures += 1;
      runtime.lastError = toMessage(error);
      const backoff = Math.min(
        runtime.source.intervalMs * 2 ** Math.min(runtime.failures, 4),
        30 * 60_000,
      );
      runtime.nextPollAt = Date.now() + backoff;
      this.logger.warn(`信源「${runtime.source.name}」刷新失败：${runtime.lastError}`);
    } finally {
      runtime.inFlight = false;
    }
  }

  private trimQueryCache(): void {
    while (this.queryCache.size > MAX_QUERY_CACHE_ENTRIES) {
      const oldest = this.queryCache.keys().next().value;
      if (oldest === undefined) break;
      this.queryCache.delete(oldest);
    }
  }
}

async function fetchFeed(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'User-Agent': 'low-code-test/1.0',
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_FEED_CHARS) throw new Error('响应体过大');

  const text = await response.text();
  if (text.length > MAX_FEED_CHARS) throw new Error('响应体过大');
  return text;
}

function withJitter(intervalMs: number): number {
  return Math.round(intervalMs * (0.9 + Math.random() * 0.2));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
