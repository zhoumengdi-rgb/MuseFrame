export type SseEventName =
  | 'reasoning'
  | 'message'
  | 'status'
  | 'media'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'complete';

export type SseHandler = (event: SseEventName, data: unknown) => void;

export async function readSse(response: Response, onEvent: SseHandler): Promise<void> {
  if (!response.body) {
    throw new Error('响应没有可读取的数据流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      let eventName: SseEventName = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() as SseEventName;
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (!dataLines.length) continue;
      onEvent(eventName, JSON.parse(dataLines.join('\n')));
    }
  }
}
