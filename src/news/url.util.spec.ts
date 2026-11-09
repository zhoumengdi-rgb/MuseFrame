import { normalizeUrl } from './url.util.js';

describe('normalizeUrl', () => {
  it('去掉 www、hash、默认端口与跟踪参数，并排序查询参数', () => {
    expect(
      normalizeUrl('https://www.Example.com:443/a/b/?utm_source=x&b=2&a=1&spm=abc#frag'),
    ).toBe('https://example.com/a/b?a=1&b=2');
  });

  it('解析相对链接', () => {
    expect(
      normalizeUrl('/news/1?from=rss', 'https://www.chinanews.com.cn/rss/scroll-news.xml'),
    ).toBe('https://chinanews.com.cn/news/1');
  });

  it('根路径去掉末尾斜杠', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('拒绝非 http(s) 与非法链接', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
});
