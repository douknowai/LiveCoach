'use client';

import { useMemo, useState } from 'react';
import type { Reminder, LiveStage, MetricSample } from '@/lib/types';
import { TYPE_META } from '@/components/live/reminder-feed';

/**
 * SessionTimeline：复盘页「直播时间轴回放」
 * 三层结构自上而下：环节色带 → 综合评分曲线 → 提醒事件泳道（按优先级分 3 行）
 * 点击提醒点展开该时刻详情（消息 / 来源 / 此刻评分），把后台分析翻译成可回放的故事线
 */

const STAGE_COLORS = ['rgba(166,106,58,0.10)', 'rgba(176,138,184,0.10)', 'rgba(138,180,212,0.09)', 'rgba(212,165,116,0.10)'];

const PRIORITY_ROW: Record<number, number> = { 1: 0, 2: 1, 3: 2 };

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SessionTimeline({
  reminders,
  stages,
  samples,
}: {
  reminders: Reminder[];
  stages: LiveStage[];
  samples: MetricSample[];
}) {
  const [selected, setSelected] = useState<Reminder | null>(null);

  const duration = useMemo(() => {
    const ends = [
      ...reminders.map((r) => r.atSec),
      ...samples.map((s) => s.atSec),
      ...stages.map((s) => s.enteredAtSec),
      60,
    ];
    return Math.max(...ends) + 8;
  }, [reminders, samples, stages]);

  const stageSegs = useMemo(() => {
    const sorted = stages
      .filter((s) => s.enteredAtSec >= 0)
      .sort((a, b) => a.enteredAtSec - b.enteredAtSec);
    return sorted.map((s, i) => ({
      ...s,
      start: s.enteredAtSec,
      end: i + 1 < sorted.length ? sorted[i + 1].enteredAtSec : duration,
      color: STAGE_COLORS[i % STAGE_COLORS.length],
    }));
  }, [stages, duration]);

  const curve = useMemo(() => {
    if (samples.length < 2) return null;
    const sorted = [...samples].sort((a, b) => a.atSec - b.atSec);
    const pts = sorted
      .map((s) => {
        const x = (s.atSec / duration) * 1000;
        const y = 64 - ((Math.max(35, Math.min(100, s.overall)) - 35) / 65) * 60;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { pts, last: sorted[sorted.length - 1] };
  }, [samples, duration]);

  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n }, (_, i) => (duration * i) / (n - 1));
  }, [duration]);

  /** 此刻评分：时间点前最近的采样 */
  const scoreAt = (atSec: number): number | null => {
    let best: number | null = null;
    for (const s of samples) {
      if (s.atSec <= atSec) best = s.overall;
      else break;
    }
    return best;
  };

  const hasAny = reminders.length > 0 || stageSegs.length > 0 || curve !== null;

  return (
    <section className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)] sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] text-[#a66a3a]" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.2 2" />
        </svg>
        <h3 className="font-serif text-[15px] font-bold text-[#2c2422]">直播时间轴</h3>
        <span className="rounded-full bg-[#f3e7d5] px-2 py-0.5 text-[11px] font-medium text-[#7a5230]">
          {reminders.length} 条提醒 · {stageSegs.length} 个环节
        </span>
        <span className="ml-auto text-[11px] text-[#9c8e80]">点击提醒点查看该时刻详情</span>
      </div>

      {!hasAny ? (
        <p className="mt-6 text-center text-[13px] text-[#9c8e80]">本场记录暂无时间轴数据</p>
      ) : (
        <div className="mt-4">
          {/* 环节色带 */}
          <div className="flex h-[22px] gap-0.5 overflow-hidden rounded-md">
            {stageSegs.map((s, i) => (
              <div
                key={`${s.name}-${s.start}-${i}`}
                className="relative min-w-0 flex items-center overflow-hidden px-1.5"
                style={{ flex: `${Math.max(s.end - s.start, 2)} 0 0%`, background: s.color }}
              >
                <span className="truncate text-[10px] font-medium text-[#6e625e]">{s.name}</span>
              </div>
            ))}
          </div>

          {/* 评分曲线 */}
          <div className="relative mt-2 h-16">
            {curve ? (
              <svg viewBox="0 0 1000 64" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
                <defs>
                  <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a66a3a" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#a66a3a" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[55, 75, 90].map((v) => {
                  const y = 64 - ((v - 35) / 65) * 60;
                  return (
                    <line key={v} x1="0" y1={y} x2="1000" y2={y} stroke="#e6dfd2" strokeWidth="1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
                  );
                })}
                <polyline points={`0,64 ${curve.pts} ${(curve.last.atSec / duration) * 1000},64`} fill="url(#tl-fill)" stroke="none" />
                <polyline points={curve.pts} fill="none" stroke="#a66a3a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-[#f1ebdf] text-[11px] text-[#9c8e80]">
                本场无评分采样（旧版记录仅展示提醒时间轴）
              </div>
            )}
            {curve && (
              <span className="absolute right-0 top-0 font-mono text-[10px] text-[#9c8e80]">
                综合评分 {curve.last.overall}
              </span>
            )}
          </div>

          {/* 提醒泳道：priority 1-3 分三行 */}
          <div className="relative mt-2 h-[42px] rounded-md bg-[#faf7f0]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="absolute inset-x-0 h-px bg-[#f1ebdf]" style={{ top: 14 * (row + 1) }} />
            ))}
            {reminders.map((r, i) => {
              const meta = TYPE_META[r.type] ?? { color: '#a66a3a', label: '提醒' };
              const row = PRIORITY_ROW[r.priority ?? 2] ?? 1;
              const active = selected === r;
              return (
                <button
                  key={`tl-${r.atSec}-${i}`}
                  type="button"
                  onClick={() => setSelected(active ? null : r)}
                  title={`${fmt(r.atSec)} · ${meta.label}`}
                  className="absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 hover:scale-125 before:absolute before:-inset-2.5 before:content-[''] before:rounded-full"
                  style={{ left: `${Math.min((r.atSec / duration) * 100, 99.2)}%`, top: 14 * (row + 1) }}
                  aria-label={`${fmt(r.atSec)} ${meta.label}提醒`}
                >
                  <span
                    className="block rounded-full transition-shadow"
                    style={{
                      width: active ? 9 : 7,
                      height: active ? 9 : 7,
                      background: meta.color,
                      boxShadow: active ? `0 0 0 3px ${meta.color}33` : undefined,
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* 时间刻度 */}
          <div className="relative mt-1 h-4">
            {ticks.map((t, i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 font-mono text-[10px] text-[#9c8e80]"
                style={{ left: `${(t / duration) * 100}%` }}
              >
                {fmt(t)}
              </span>
            ))}
          </div>

          {/* 选中提醒详情 */}
          {selected && (
            <div
              className="mt-3 rounded-lg rounded-l-none border border-y-[#e6dfd2] border-r-[#e6dfd2] p-3.5"
              style={{
                borderLeft: `3px solid ${(TYPE_META[selected.type] ?? { color: '#a66a3a' }).color}`,
                background: 'rgba(166,106,58,0.045)',
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: (TYPE_META[selected.type] ?? { color: '#a66a3a' }).color }}
                >
                  {(TYPE_META[selected.type] ?? { label: '提醒' }).label}
                </span>
                <span className="rounded-full bg-[#f1ebdf] px-1.5 py-0.5 text-[10px] text-[#8f847f]">
                  {selected.source === 'face' ? '端侧·即时' : selected.source === 'vision' ? 'AI·视觉' : selected.source === 'speech' ? 'AI·语音' : '本地规则'}
                </span>
                {selected.priority === 1 && (
                  <span className="rounded-full bg-[#f7efe2] px-1.5 py-0.5 text-[10px] font-semibold text-[#b56a3a]">重要</span>
                )}
                <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-[#9c8e80]">
                  {scoreAt(selected.atSec) !== null && <span>此刻评分 {scoreAt(selected.atSec)}</span>}
                  <span>{fmt(selected.atSec)}</span>
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#3a322e]">{selected.message}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
