import { describe, expect, it } from 'vitest';
import { detectIntent } from './intent.js';

describe('detectIntent', () => {
  it.each([
    ['描述一只猫', 'text'],
    ['介绍一下敦煌莫高窟', 'text'],
    ['今天发生了什么', 'text'],
    ['画面构图怎么安排', 'text'],
    ['画一只猫', 'image'],
    ['你能画一只猫吗', 'image'],
    ['帮我画一张海报', 'image'],
    ['生成一张图片', 'image'],
    ['生成一张武松打虎的图片', 'image'],
    ['帮我生成一张武松打虎的图片', 'image'],
    ['生成一幅国潮风格的海报', 'image'],
    ['给这篇文章配图', 'image'],
    ['做一个封面图', 'image'],
    ['用 AI 绘图生成一只柴犬', 'image'],
    ['生成小猫跑动的视频', 'video'],
    ['把这张照片动起来', 'video'],
    ['数字人视频怎么做', 'video'],
    ['一只小猫在月光下的屋顶上奔跑，城市的霓虹灯在远处闪烁，电影级画质，流畅运镜。', 'video'],
    ['海浪拍打礁石，镜头缓缓推进，慢动作。', 'video'],
    ['海浪拍打礁石，镜头缓缓推进。', 'video'],
    ['无人机航拍雪山日出', 'video'],
    ['画一只奔跑的小猫，电影级画质', 'image'],
    ['描述一张电影级画质的照片', 'text'],
    ['不要画图，用文字描述', 'text'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectIntent(text)).toBe(expected);
  });
});
