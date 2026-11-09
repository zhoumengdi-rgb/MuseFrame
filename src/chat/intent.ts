export type ChatIntent = 'image' | 'video' | 'text';

const VIDEO_PATTERNS: RegExp[] = [
  /视频/,
  /短视频/,
  /数字人/,
  /动起来/,
  /动画(短片|片)/,
  /运镜|镜头运动|镜头语言|摄影机|跟拍|环绕拍摄|推拉摇移|长镜头/,
  /镜头.{0,4}(推进|推近|拉远|拉近|环绕|跟随|平移|横移|摇移|切换)/,
  /航拍|俯拍|仰拍|低角度拍摄|高角度拍摄/,
  /慢动作|慢镜头|延时摄影|转场/,
];

const IMAGE_PATTERNS: RegExp[] = [
  /(帮我|给我|替我|帮忙|请)\s*画(?!面|中|里|上|册|家|室|质|风|法|笔|展|廊)/,
  /^\s*画(?!面|中|里|上|册|家|室|质|风|法|笔|展|廊)/,
  /画(?!面|中|里|上|册|家|室|质|风|法|笔|展|廊)(一|两|几)?(个|只|幅|张|位|条|头|座|栋|片)/,
  /(画图|绘图|绘画|ai\s*绘图|ai\s*绘画)/i,
  /(配图|插图|封面图|海报图)/,
  /配.{0,2}图/,
  // 允许“一张武松打虎的”这类定语出现在动词与名词之间，但限制在单句内
  /生成[^。！？!?\n]{0,20}(图片|图像|照片|插画|海报|封面|配图|图)/,
];

const NEGATED_MEDIA = /(不要|不用|别)(画|生成|做).{0,6}(图|图片|视频)/;

export function detectIntent(text: string): ChatIntent {
  const input = text.trim();
  if (!input) return 'text';

  if (NEGATED_MEDIA.test(input)) return 'text';
  if (VIDEO_PATTERNS.some((pattern) => pattern.test(input))) return 'video';
  if (IMAGE_PATTERNS.some((pattern) => pattern.test(input))) return 'image';
  return 'text';
}
