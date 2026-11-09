import type { NewsService } from './news.service.js';
import type { ToolDefinition } from '../tools/tools.types.js';

export function createLatestNewsTool(news: NewsService): ToolDefinition {
  return {
    name: 'get_latest_news',
    description:
      '查询最近的最新新闻、时事与热点资讯，可按关键词过滤。用于回答“今天发生了什么”“最近有什么新闻”“某话题的最新进展”等实时问题。',
    parameters: {
      query: {
        type: 'string',
        description: '可选关键词，例如 人工智能、经济、芯片；不传则返回综合热点',
        required: false,
      },
      hours: {
        type: 'number',
        description: '回看小时数，1-72，默认 24',
        required: false,
      },
      limit: {
        type: 'number',
        description: '返回条数，1-20，默认 8',
        required: false,
      },
    },
    execute(args) {
      return news.getLatest({
        query: typeof args.query === 'string' ? args.query : undefined,
        hours: typeof args.hours === 'number' ? args.hours : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
    },
  };
}
