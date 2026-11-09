import { parseToolCalls } from './tool-protocol.js';
import { ToolsService } from './tools.service.js';

function firstCall(text: string) {
  const call = parseToolCalls(text).calls[0];
  if (!call) throw new Error('测试用例应包含一个合法工具调用');
  return call;
}

describe('ToolsService', () => {
  let service: ToolsService;

  beforeEach(() => {
    service = new ToolsService();
  });

  it('系统提示词包含工具目录与调用协议', () => {
    const prompt = service.buildSystemPrompt('基础提示');

    expect(prompt).toContain('get_current_time');
    expect(prompt).toContain('get_weather');
    expect(prompt).toContain('<tool_call>');
    expect(prompt).toContain('<tool_result>');
  });

  it('执行 get_current_time 返回结构化实时数据', async () => {
    const call = firstCall(
      '<tool_call>{"name":"get_current_time","arguments":{"timezone":"Asia/Shanghai"}}</tool_call>',
    );

    const result = await service.execute(call);

    expect(result.ok).toBe(true);
    const data = JSON.parse(result.content) as {
      timezone: string;
      local: string;
      utcOffset: string;
      iso: string;
    };
    expect(data.timezone).toBe('Asia/Shanghai');
    expect(data.local).toBeTruthy();
    expect(data.utcOffset).toContain('GMT+08:00');
    expect(Number.isNaN(Date.parse(data.iso))).toBe(false);
  });

  it('无效时区返回失败而不是抛出', async () => {
    const call = firstCall(
      '<tool_call>{"name":"get_current_time","arguments":{"timezone":"Mars/Olympus"}}</tool_call>',
    );

    const result = await service.execute(call);

    expect(result.ok).toBe(false);
    expect(result.content).toContain('无效的时区');
  });

  it('未知工具返回失败', async () => {
    const result = await service.execute({
      name: 'not_exists',
      arguments: {},
      raw: '<tool_call>{"name":"not_exists"}</tool_call>',
    });

    expect(result.ok).toBe(false);
    expect(result.content).toContain('未知工具');
  });

  it('缺少必填参数时不会执行工具', async () => {
    const call = firstCall('<tool_call>{"name":"get_weather","arguments":{}}</tool_call>');

    const result = await service.execute(call);

    expect(result.ok).toBe(false);
    expect(result.content).toContain('缺少必填参数：city');
  });

  it('支持注册自定义工具', async () => {
    service.register({
      name: 'echo',
      description: '原样返回文本',
      parameters: { text: { type: 'string', description: '文本', required: true } },
      execute: (args) => `echo:${String(args.text)}`,
    });

    const result = await service.execute({
      name: 'echo',
      arguments: { text: 'hello' },
      raw: '',
    });

    expect(result.ok).toBe(true);
    expect(result.content).toBe('echo:hello');
  });
});
