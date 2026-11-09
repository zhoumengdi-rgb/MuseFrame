import { parseFeed } from './feed.parser.js';
import type { NewsSource } from './news.types.js';

const source: NewsSource = {
  id: 'test',
  name: '测试信源',
  url: 'https://www.example.com/feed.xml',
  intervalMs: 60_000,
  weight: 0.8,
};

describe('parseFeed', () => {
  it('解析 RSS：清洗 HTML/实体、归一化链接、跳过无效条目', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>测试</title>
    <item>
      <title><![CDATA[AI &amp; 芯片]]></title>
      <link>https://www.example.com/news/1?utm_source=rss</link>
      <description><![CDATA[<p>第一段 &amp; 更多</p><script>alert(1)</script>]]></description>
      <pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title></title>
      <link>https://example.com/empty-title</link>
    </item>
    <item>
      <title>没有链接</title>
    </item>
  </channel>
</rss>`;

    const items = parseFeed(xml, source);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'AI & 芯片',
      summary: '第一段 & 更多',
      url: 'https://example.com/news/1',
      sourceId: 'test',
      sourceName: '测试信源',
      sourceWeight: 0.8,
    });
    expect(items[0]?.publishedAt).toBe(Date.parse('Sun, 08 Nov 2026 10:00:00 GMT'));
  });

  it('解析 Atom：使用 alternate 链接与 published 时间', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom 测试</title>
  <entry>
    <title>Atom 标题</title>
    <link rel="self" href="https://example.com/self"/>
    <link rel="alternate" href="https://example.com/a?utm_medium=x"/>
    <published>2026-11-08T10:00:00Z</published>
    <summary type="html">&lt;p&gt;摘要内容&lt;/p&gt;</summary>
  </entry>
</feed>`;

    const items = parseFeed(xml, source);

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Atom 标题');
    expect(items[0]?.url).toBe('https://example.com/a');
    expect(items[0]?.summary).toBe('摘要内容');
    expect(items[0]?.publishedAt).toBe(Date.parse('2026-11-08T10:00:00Z'));
  });

  it('缺失日期时回退到当前时间', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    const xml = `<rss><channel><item><title>无日期</title><link>https://example.com/no-date</link></item></channel></rss>`;

    const items = parseFeed(xml, source, now);

    expect(items[0]?.publishedAt).toBe(now);
  });
});
