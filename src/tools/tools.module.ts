import { Module } from '@nestjs/common';
import { NewsModule } from '../news/news.module.js';
import { NewsService } from '../news/news.service.js';
import { createLatestNewsTool } from '../news/latest-news.tool.js';
import { ToolsService } from './tools.service.js';

@Module({
  imports: [NewsModule],
  providers: [
    {
      provide: ToolsService,
      useFactory: (news: NewsService) => {
        const tools = new ToolsService();
        tools.register(createLatestNewsTool(news));
        return tools;
      },
      inject: [NewsService],
    },
  ],
  exports: [ToolsService],
})
export class ToolsModule {}
