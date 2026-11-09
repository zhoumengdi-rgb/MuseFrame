const TRACKING_PARAMS = new Set([
  'spm',
  'from',
  'ref',
  'referrer',
  'source',
  'share_token',
  'share_source',
  'fbclid',
  'gclid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

/**
 * 归一化新闻链接：
 * - 仅允许 http/https
 * - 去掉 hash、默认端口、www 前缀与末尾斜杠
 * - 移除 utm_* 等跟踪参数，其余参数排序
 * 返回 null 表示该链接不可用。
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  url.search = '';
  for (const [key, value] of params) {
    url.searchParams.append(key, value);
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname || '/';

  return url.toString().replace(/\/$/, '');
}
