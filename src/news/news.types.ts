export interface NewsSource {
  id: string;
  name: string;
  url: string;
  /** 该信源的更新节律，调度器按此间隔轮询 */
  intervalMs: number;
  /** 排序权重，0-1 */
  weight: number;
}

export interface NewsItem {
  /** 归一化后的 URL，作为去重键 */
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: number;
  sourceId: string;
  sourceName: string;
  sourceWeight: number;
}

export interface NewsQuery {
  query?: string;
  hours?: number;
  limit?: number;
}

export interface NewsSourceStatus {
  id: string;
  name: string;
  ok: boolean;
  lastFetchedAt: number | null;
  lastError: string | null;
  itemCount: number;
}
