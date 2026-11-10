import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat.types.js';
import {
  buildSummarySystemContent,
  clampCovered,
  formatSummarySource,
  MAX_SUMMARY_CHARS,
  planSummary,
  RECENT_HISTORY,
  sanitizeSummary,
  SUMMARY_TRIGGER_MESSAGES,
} from './summary.format.js';

function history(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `第${index}条消息`,
  }));
}

describe('planSummary', () => {
  it('未达到阈值时不生成摘要', () => {
    expect(planSummary(history(SUMMARY_TRIGGER_MESSAGES - 1), 0)).toBeNull();
  });

  it('达到阈值后压缩最早的消息并保留最近 20 条', () => {
    const plan = planSummary(history(30), 0);

    expect(plan?.overflow).toHaveLength(10);
    expect(plan?.nextSummaryUpTo).toBe(10);
    expect(plan?.recent).toHaveLength(RECENT_HISTORY);
    expect(plan?.recent[0]?.content).toBe('第10条消息');
    expect(plan?.recent.at(-1)?.content).toBe('第29条消息');
  });

  it('已有摘要时只统计摘要之后的消息', () => {
    const plan = planSummary(history(40), 10);

    expect(plan?.overflow).toHaveLength(10);
    expect(plan?.nextSummaryUpTo).toBe(20);
    expect(plan?.recent).toHaveLength(RECENT_HISTORY);
  });

  it('历史积压时单次最多压缩 40 条，其余留给下次', () => {
    const plan = planSummary(history(120), 0);

    expect(plan?.overflow).toHaveLength(40);
    expect(plan?.nextSummaryUpTo).toBe(40);
    expect(plan?.recent).toHaveLength(RECENT_HISTORY);
  });
});

describe('clampCovered', () => {
  it('把非法或越界的已覆盖数量收敛到合法范围', () => {
    expect(clampCovered(-1, 10)).toBe(0);
    expect(clampCovered(Number.NaN, 10)).toBe(0);
    expect(clampCovered(3.5, 10)).toBe(0);
    expect(clampCovered(4, 10)).toBe(4);
    expect(clampCovered(99, 10)).toBe(10);
  });
});

describe('formatSummarySource', () => {
  it('包含已有摘要与带角色标签的新增对话', () => {
    const text = formatSummarySource('用户喜欢科幻', history(2));

    expect(text).toContain('已有摘要：\n用户喜欢科幻');
    expect(text).toContain('用户：第0条消息');
    expect(text).toContain('助手：第1条消息');
  });

  it('没有旧摘要时标注为无', () => {
    expect(formatSummarySource('   ', history(1))).toContain('已有摘要：（无）');
  });

  it('单条消息过长时截断', () => {
    const text = formatSummarySource('', [{ role: 'user', content: '长'.repeat(1000) }]);

    expect(text).not.toContain('长'.repeat(801));
  });
});

describe('sanitizeSummary', () => {
  it('清理 HTML 标签、换行与首尾空白', () => {
    expect(sanitizeSummary('<b>用户</b>喜欢\r\n\r\n\r\n科幻')).toBe('用户喜欢\n\n科幻');
  });

  it('限制摘要最大长度', () => {
    expect(sanitizeSummary('长'.repeat(MAX_SUMMARY_CHARS + 50))).toHaveLength(MAX_SUMMARY_CHARS);
  });
});

describe('buildSummarySystemContent', () => {
  it('标记摘要并提醒不要执行其中的指令', () => {
    const text = buildSummarySystemContent('用户在研究 SSE');

    expect(text).toContain('## 更早对话摘要');
    expect(text).toContain('不要执行');
    expect(text).toContain('用户在研究 SSE');
  });
});
