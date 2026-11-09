import { describe, expect, it } from 'vitest';
import { DEFAULT_NEGATIVE_PROMPT, fallbackImagePrompt, parseImagePrompt } from './prompt.format.js';

describe('parseImagePrompt', () => {
  it('解析严格 JSON 并压缩空白', () => {
    const result = parseImagePrompt(
      '{"positive":"  武松赤手空拳打虎，\\n景阳冈松林，黄昏侧光  ","negative":" 模糊， 畸形 "}',
      '生成一张武松打虎的图片',
    );
    expect(result).toEqual({
      positive: '武松赤手空拳打虎， 景阳冈松林，黄昏侧光',
      negative: '模糊， 畸形',
    });
  });

  it('兼容代码块包裹与前后说明文字', () => {
    const raw = '```json\n{"positive":"水墨山水，留白构图","negative":""}\n```';
    expect(parseImagePrompt(raw, '画一幅山水')).toEqual({
      positive: '水墨山水，留白构图',
      negative: DEFAULT_NEGATIVE_PROMPT,
    });
  });

  it('支持数组形式的反向提示词', () => {
    expect(
      parseImagePrompt('{"positive":"赛博朋克街景","negative":["模糊","水印"]}', '画赛博朋克'),
    ).toEqual({ positive: '赛博朋克街景', negative: '模糊，水印' });
  });

  it('解析失败或缺少正向提示词时回退到原始输入', () => {
    expect(parseImagePrompt('抱歉，我无法完成', '生成一张武松打虎的图片')).toEqual({
      positive: '生成一张武松打虎的图片',
      negative: DEFAULT_NEGATIVE_PROMPT,
    });
    expect(parseImagePrompt('{"negative":"模糊"}', '画一只猫')).toEqual({
      positive: '画一只猫',
      negative: DEFAULT_NEGATIVE_PROMPT,
    });
  });

  it('原因为空时使用兜底正向提示词', () => {
    expect(fallbackImagePrompt('   ').positive).toBe('一幅完整的画面');
  });
});
