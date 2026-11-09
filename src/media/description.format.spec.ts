import { describe, expect, it } from 'vitest';
import {
  composeImageAnswer,
  composeVideoAnswer,
  parseImageNarration,
  parseVideoNarration,
} from './description.format.js';

describe('parseImageNarration', () => {
  it('去掉“画面描述：”前缀并合并空白', () => {
    expect(parseImageNarration('画面描述：一只橘猫\n坐在窗台上')).toBe('一只橘猫 坐在窗台上');
  });
});

describe('composeImageAnswer', () => {
  it('输出带画面描述的图片回答', () => {
    expect(composeImageAnswer('一只橘猫坐在窗台上。', '画一只橘猫')).toBe(
      '已为你生成图片。\n\n**画面描述**：一只橘猫坐在窗台上。',
    );
  });

  it('描述缺失时回退到用户提示词', () => {
    expect(composeImageAnswer(undefined, '画一只橘猫')).toContain('**画面描述**：画一只橘猫');
    expect(composeImageAnswer('   ', '画一只橘猫')).toContain('**画面描述**：画一只橘猫');
  });
});

describe('parseVideoNarration', () => {
  it('解析五种字段，兼容加粗、列表和编号', () => {
    const raw = [
      '**主体**：一只小猫在月光下的屋顶上奔跑',
      '- **画面推进**：镜头跟随小猫向前推进',
      '2. 镜头风格：电影级质感，流畅运镜',
      '- 声音：夜晚风声与猫爪踏瓦声',
      '**画面文字描述**：无',
    ].join('\n');

    expect(parseVideoNarration(raw)).toEqual({
      subject: '一只小猫在月光下的屋顶上奔跑',
      motion: '镜头跟随小猫向前推进',
      style: '电影级质感，流畅运镜',
      sound: '夜晚风声与猫爪踏瓦声',
      onScreenText: '无',
    });
  });

  it('忽略未知字段', () => {
    expect(parseVideoNarration('主体：小猫\n备注：无关内容')).toEqual({ subject: '小猫' });
  });
});

describe('composeVideoAnswer', () => {
  it('包含模型、时长和全部描述字段', () => {
    const answer = composeVideoAnswer(
      {
        subject: '屋顶上的小猫',
        motion: '镜头跟随推进',
        style: '电影感',
        sound: '夜晚环境音',
        onScreenText: '无',
      },
      '一只小猫在屋顶上奔跑，流畅运镜',
      'happyhorse-1.1-t2v',
      5,
    );

    expect(answer).toContain('| 使用模型 | happyhorse-1.1-t2v |');
    expect(answer).toContain('| 时长 | 5 秒 |');
    expect(answer).toContain('| 主体 | 屋顶上的小猫 |');
    expect(answer).toContain('| 画面推进 | 镜头跟随推进 |');
    expect(answer).toContain('| 镜头风格 | 电影感 |');
    expect(answer).toContain('| 声音 | 夜晚环境音 |');
    expect(answer).toContain('| 画面文字描述 | 无 |');
  });

  it('描述缺失时用提示词和“未指定”兜底', () => {
    const answer = composeVideoAnswer(undefined, '一只小猫跑动，流畅运镜', 'happyhorse-1.1-t2v', 5);

    expect(answer).toContain('| 主体 | 一只小猫跑动，流畅运镜 |');
    expect(answer).toContain('| 画面推进 | 未指定 |');
    expect(answer).toContain('| 画面文字描述 | 无 |');
  });

  it('转义表格中的竖线', () => {
    const answer = composeVideoAnswer({ subject: '猫 | 屋顶' }, '猫', 'm', 5);
    expect(answer).toContain('| 主体 | 猫 \\| 屋顶 |');
  });
});
