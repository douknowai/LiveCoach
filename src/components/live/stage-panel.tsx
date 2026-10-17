'use client';

import type { LiveStage } from '@/lib/types';

/** 流程陪练面板：环节进度 + 当前环节高亮 + 遗漏标记（参考稿列表风格，浅色） */
export function StagePanel({
  stages,
  currentLabel,
}: {
  stages: LiveStage[];
  currentLabel: string;
}) {
  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#e6dfd2] bg-[#faf7f1] p-4 text-center text-xs text-[#9c8e80]">
        未填写直播流程，AI 将根据内容自动识别环节
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {stages.map((s) => {
        const isCurrent = s.name === currentLabel && s.enteredAtSec >= 0;
        const isDone = s.completed && !isCurrent;
        const isMissed = s.enteredAtSec >= 0 && !s.completed && !isCurrent;
        return (
          <div
            key={s.index}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all ${
              isCurrent
                ? 'border border-[#e3c4a3] bg-[#f3e7d5] font-semibold text-[#7a5230]'
                : isDone
                  ? 'border border-transparent text-[#9c8e80]'
                  : isMissed
                    ? 'border border-transparent text-[#b8874e]'
                    : 'border border-transparent text-[#6e625e]'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                isCurrent
                  ? 'bg-[#a66a3a] text-white'
                  : isDone
                    ? 'bg-[#e2ecdf] text-[#6e9a7e]'
                    : isMissed
                      ? 'bg-[#f2e4d3] text-[#b8874e]'
                      : 'bg-[#f0ebe7] text-[#9c8e80]'
              }`}
            >
              {isDone ? '✓' : isCurrent ? '•' : s.index + 1}
            </span>
            <span className="truncate">{s.name}</span>
            {isCurrent && (
              <span className="live-dot ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#a66a3a]" />
            )}
            {isMissed && (
              <span className="ml-auto shrink-0 text-[10px] text-[#b8874e]">待补充</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
