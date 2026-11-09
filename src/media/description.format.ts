export interface VideoNarration {
  subject: string;
  motion: string;
  style: string;
  sound: string;
  onScreenText: string;
}

const VIDEO_LABELS: Record<string, keyof VideoNarration> = {
  主体: 'subject',
  画面推进: 'motion',
  镜头风格: 'style',
  声音: 'sound',
  画面文字描述: 'onScreenText',
  画面文字: 'onScreenText',
};

export function parseImageNarration(raw: string): string {
  return raw
    .replace(/^\s*\**\s*画面描述\s*\**\s*[:：]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parseVideoNarration(raw: string): Partial<VideoNarration> {
  const result: Partial<VideoNarration> = {};

  for (const line of raw.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*(?:[-*•]\s*)?(?:\d+[.、)]\s*)?\*{0,2}\s*([^：:*]+?)\s*\*{0,2}\s*[:：]\s*(.*)$/u,
    );
    if (!match) continue;

    const key = VIDEO_LABELS[match[1].trim()];
    if (!key) continue;

    const value = match[2].replace(/\*\*/gu, '').trim();
    if (value) {
      result[key] = value;
    }
  }

  return result;
}

export function composeImageAnswer(narration: string | undefined, prompt: string): string {
  const description = parseImageNarration(narration ?? '') || prompt.trim() || '已按你的描述完成生成。';
  return `已为你生成图片。\n\n**画面描述**：${description}`;
}

export function composeVideoAnswer(
  narration: Partial<VideoNarration> | undefined,
  prompt: string,
  model: string,
  duration: number,
): string {
  const fields = narration ?? {};
  const rows: Array<[string, string]> = [
    ['使用模型', model],
    ['时长', `${duration} 秒`],
    ['主体', fields.subject || prompt.trim() || '未指定'],
    ['画面推进', fields.motion || '未指定'],
    ['镜头风格', fields.style || '未指定'],
    ['声音', fields.sound || '未指定'],
    ['画面文字描述', fields.onScreenText || '无'],
  ];

  const table = rows
    .map(([label, value]) => `| ${label} | ${escapeCell(value)} |`)
    .join('\n');

  return `已为你生成视频。\n\n| 项目 | 内容 |\n| --- | --- |\n${table}`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
}
