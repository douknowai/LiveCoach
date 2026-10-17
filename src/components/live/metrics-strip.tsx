'use client';

import { METRIC_KEYS, METRIC_LABELS, type MetricKey } from '@/lib/types';
import type { MetricsSnapshot } from '@/lib/metrics-engine';

/** 参考稿 sub-score-item：标签 + 细条 + 等宽数字，多色渐变 */
const BAR_COLORS: Record<MetricKey, string> = {
  cameraPresence: 'linear-gradient(90deg, #e3c4a3, #a66a3a)',
  expression: 'linear-gradient(90deg, #c5d8ea, #8ab4d4)',
  posture: 'linear-gradient(90deg, #cfe2cb, #a8c69f)',
  language: 'linear-gradient(90deg, #ecd3b2, #d4a574)',
  pacing: 'linear-gradient(90deg, #ddd0ec, #b8a4d4)',
  content: 'linear-gradient(90deg, #efc9a6, #e0a478)',
  interaction: 'linear-gradient(90deg, #c8e0d2, #8ab89a)',
  charisma: 'linear-gradient(90deg, #ecdec2, #d4b48c)',
};

/** 直播实时指标：8 维细条 */
export function MetricsStrip({ snap }: { snap: MetricsSnapshot }) {
  return (
    <div className="space-y-0">
      {METRIC_KEYS.map((k, i) => {
        const v = Math.round(snap.metrics[k]);
        const color =
          v >= 85 ? '#8ab89a' : v >= 70 ? '#a66a3a' : v >= 55 ? '#d4a574' : '#c0b4a4';
        return (
          <div
            key={k}
            className={`flex items-center py-2 ${
              i < METRIC_KEYS.length - 1 ? 'border-b border-[#f5f0e6]' : ''
            }`}
          >
            <span className="w-[68px] shrink-0 text-[12.5px] text-[#6e625e]">
              {METRIC_LABELS[k]}
            </span>
            <span className="mx-3 h-[5px] flex-1 overflow-hidden rounded-full bg-[#f1ebe0]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${v}%`,
                  background: BAR_COLORS[k],
                  transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums" style={{ color }}>
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
}
