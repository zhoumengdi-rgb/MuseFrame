import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { ToolsModule } from '../tools/tools.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { SummaryService } from './summary.service.js';

@Module({
  imports: [ToolsModule, MediaModule],
  controllers: [ChatController],
  providers: [ChatService, SummaryService],
})
export class ChatModule {}
