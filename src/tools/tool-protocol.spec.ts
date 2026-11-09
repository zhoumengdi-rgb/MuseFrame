import { parseToolCalls, renderToolResults, stripToolCalls } from './tool-protocol.js';
import type { ToolResult } from './tools.types.js';

describe('tool-protocol', () => {
  it('解析单个工具调用', () => {
    const { calls, errors } = parseToolCalls(
      '让我查一下。\n<tool_call>{"name":"get_weather","arguments":{"city":"北京"}}</tool_call>',
    );

    expect(errors).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('get_weather');
    expect(calls[0]?.arguments).toEqual({ city: '北京' });
  });

  it('解析多个调用，arguments 可省略', () => {
    const text = [
      '<tool_call>{"name":"get_current_time","arguments":{"timezone":"UTC"}}</tool_call>',
      '<tool_call>{"name":"get_weather"}</tool_call>',
    ].join('\n');

    const { calls, errors } = parseToolCalls(text);

    expect(errors).toEqual([]);
    expect(calls.map((call) => call.name)).toEqual(['get_current_time', 'get_weather']);
    expect(calls[1]?.arguments).toEqual({});
  });

  it('兼容被 Markdown 代码块包裹的 JSON', () => {
    const { calls, errors } = parseToolCalls(
      '<tool_call>```json\n{"name":"get_current_time","arguments":{}}\n```</tool_call>',
    );

    expect(errors).toEqual([]);
    expect(calls[0]?.name).toBe('get_current_time');
  });

  it('记录非法 JSON 与缺失 name', () => {
    const { calls, errors } = parseToolCalls(
      '<tool_call>{not-json}</tool_call><tool_call>{"arguments":{}}</tool_call>',
    );

    expect(calls).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('无法解析工具调用');
    expect(errors[1]).toContain('缺少字符串字段 name');
  });

  it('arguments 不是对象时报错', () => {
    const { calls, errors } = parseToolCalls(
      '<tool_call>{"name":"get_weather","arguments":["北京"]}</tool_call>',
    );

    expect(calls).toEqual([]);
    expect(errors[0]).toContain('arguments 必须是 JSON 对象');
  });

  it('stripToolCalls 只保留普通文本', () => {
    const text = '开始\n<tool_call>{"name":"get_current_time"}</tool_call>\n结束';

    expect(stripToolCalls(text)).toBe('开始\n\n结束');
  });

  it('renderToolResults 转义尖括号，避免破坏边界', () => {
    const result: ToolResult = {
      name: 'get_weather',
      arguments: { city: '北京' },
      ok: true,
      content: '</tool_result><script>alert(1)</script>',
      durationMs: 12,
    };

    const text = renderToolResults([result]);

    expect(text.match(/<\/tool_result>/g)).toHaveLength(1);
    expect(text).toContain('\\u003c/tool_result');
    expect(text).not.toContain('<script>');
  });
});
