/**
 * ReminderEngine：AI 提醒节流引擎
 * 产品原则：提醒要像现场指导老师——只在出现明显问题时说，
 * 同类问题短期内不重复，整体频率受控，不干扰主播表达。
 */

import type { Reminder, ReminderType } from './types';

/** 各类提醒的冷却时间（毫秒） */
const COOLDOWN: Partial<Record<ReminderType, number>> = {
  smile: 45000,
  distance: 30000,
  head: 25000,
  posture: 30000,
  position: 35000,
  gaze: 30000,
  energy: 40000,
  volume: 30000,
  pace: 40000,
  pause: 25000,
  filler: 50000,
  interaction: 45000,
  stage: 20000,
  content: 35000,
  praise: 60000,
};

/** 全局最小提醒间隔 */
const GLOBAL_GAP = 7000;

/** 冷启动期：前 10 秒不提醒 */
const WARMUP_SEC = 10;

export class ReminderEngine {
  private lastByType = new Map<ReminderType, number>();
  private lastGlobal = 0;
  private history: Reminder[] = [];
  /** 与 history 一一对齐的入队时间戳（毫秒） */
  private tsList: number[] = [];
  /** 本次主攻维度对应的提醒类型（冷却减半，更积极提醒） */
  private focusTypes = new Set<ReminderType>();

  /** 设置本次主攻维度对应的提醒类型（startLive 时由 hook 注入） */
  setFocusTypes(types: ReminderType[]): void {
    this.focusTypes = new Set(types);
  }

  /**
   * 尝试入队一条提醒，返回是否通过节流
   */
  push(
    r: Omit<Reminder, 'atSec'>,
    elapsedSec: number
  ): Reminder | null {
    if (elapsedSec < WARMUP_SEC) return null;
    const now = Date.now();
    // 全局频率限制
    if (now - this.lastGlobal < GLOBAL_GAP) return null;
    // 同类冷却（主攻维度冷却减半：教练知道你在练什么，提醒更积极）
    const base = COOLDOWN[r.type] ?? 30000;
    const cd = this.focusTypes.has(r.type) ? Math.round(base * 0.5) : base;
    if (now - (this.lastByType.get(r.type) ?? 0) < cd) return null;
    const full: Reminder = { ...r, atSec: elapsedSec };
    this.lastByType.set(r.type, now);
    this.lastGlobal = now;
    this.history.push(full);
    this.tsList.push(now);
    if (this.history.length > 300) {
      this.history.shift();
      this.tsList.shift();
    }
    return full;
  }

  /** 获取最近 N 秒内的提醒（供 AI 上下文避免重复） */
  recent(seconds = 90): Reminder[] {
    const now = Date.now();
    return this.history.filter(
      (_, i) => now - (this.tsList[i] ?? 0) < seconds * 1000
    );
  }

  /** 最近提醒摘要（给 AI 的上下文） */
  recentDigest(count = 6): Array<{ type: string; message: string }> {
    return this.history
      .slice(-count)
      .map((r) => ({ type: r.type, message: r.message }));
  }

  /** 某类型最近一次提醒距今的秒数 */
  secondsSinceType(type: ReminderType): number {
    const t = this.lastByType.get(type);
    return t ? (Date.now() - t) / 1000 : Infinity;
  }

  all(): Reminder[] {
    return [...this.history];
  }

  /** 统计各类型提醒次数 */
  stats(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const r of this.history) s[r.type] = (s[r.type] ?? 0) + 1;
    return s;
  }

  reset(): void {
    this.lastByType.clear();
    this.lastGlobal = 0;
    this.history = [];
    this.tsList = [];
    this.focusTypes.clear();
  }
}
