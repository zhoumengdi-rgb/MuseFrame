import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from './chat.service.js';

interface ChatRequestBody {
  messages?: unknown;
  summary?: unknown;
  summaryUpTo?: unknown;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async stream(
    @Body() body: ChatRequestBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const request = this.chatService.normalizeRequest(body);
    if (!request.messages.length) {
      res.status(400).type('text/plain').send('缺少提问内容');
      return;
    }

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    // 视频任务可能持续数分钟，定期心跳避免中间代理断开空闲连接
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
    }, 15_000);

    try {
      for await (const event of this.chatService.stream(request, abort.signal)) {
        if (res.writableEnded || res.destroyed) break;
        res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }
}
