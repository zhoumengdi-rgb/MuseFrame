import type { ToolDefinition } from '../tools.types.js';

const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export const currentTimeTool: ToolDefinition = {
  name: 'get_current_time',
  description: '获取指定时区的当前日期、时间与星期，用于回答“现在几点”“今天几号”等实时问题。',
  parameters: {
    timezone: {
      type: 'string',
      description: `IANA 时区名称，例如 Asia/Shanghai、America/New_York；默认 ${DEFAULT_TIMEZONE}`,
      required: false,
    },
  },
  execute(args) {
    const timezone =
      typeof args.timezone === 'string' && args.timezone.trim() ? args.timezone.trim() : DEFAULT_TIMEZONE;

    let formatter: Intl.DateTimeFormat;
    let offsetFormatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'medium',
      });
      offsetFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset',
      });
    } catch {
      throw new Error(`无效的时区：${timezone}`);
    }

    const now = new Date();
    const utcOffset =
      offsetFormatter.formatToParts(now).find((part) => part.type === 'timeZoneName')?.value ?? '';

    return JSON.stringify(
      {
        timezone,
        local: formatter.format(now),
        utcOffset,
        iso: now.toISOString(),
      },
      null,
      2,
    );
  },
};
