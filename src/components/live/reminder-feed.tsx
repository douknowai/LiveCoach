'use client';

import { Sparkles } from 'lucide-react';
import type { Reminder } from '@/lib/types';
import type { CoachNote } from '@/hooks/use-live-session';

/** 参考稿 feedback-item：左边框色条 + 浅底类型标签（无 emoji，柔和色系） */
const TYPE_META: Record<string, { color: string; label: string }> = {
  smile: { color: '#a66a3a', label: '表情' },
  distance: { color: '#8ab4d4', label: '镜头' },
  head: { color: '#8ab4d4', label: '头部' },
  posture: { color: '#8ab4d4', label: '姿态' },
  position: { color: '#8ab4d4', label: '构图' },
  gaze: { color: '#d4a574', label: '视线' },
  energy: { color: '#d4a574', label: '状态' },
  volume: { color: '#d4a574', label: '音量' },
  pace: { color: '#d4a574', label: '语速' },
  pause: { color: '#b56a3a', label: '冷场' },
  filler: { color: '#d4a574', label: '口头禅' },
  interaction: { color: '#b8a4d4', label: '互动' },
  stage: { color: '#8ab4d4', label: '流程' },
  content: { color: '#b56a3a', label: '内容' },
  praise: { color: '#8ab89a', label: '鼓励' },
};

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** 提醒来源徽标：端侧即时（本地零延迟）/ AI 视觉 / AI 语音；本地音频规则不标记避免噪音 */
const SOURCE_META: Record<string, { text: string; className: string }> = {
  face: { text: '端侧·即时', className: 'bg-[#f3e7d5] text-[#7a5230]' },
  vision: { text: 'AI·视觉', className: 'bg-[#f1ebdf] text-[#8f847f]' },
  speech: { text: 'AI·语音', className: 'bg-[#f1ebdf] text-[#8f847f]' },
};

export { TYPE_META };

/** 右侧 AI 教练提醒流：欢迎语便签 + 提醒 + 环节点评合并展示（最新在上） */
export function ReminderFeed({
  reminders,
  coachNotes,
  welcomeText,
}: {
  reminders: Reminder[];
  coachNotes: CoachNote[];
  welcomeText?: string;
}) {
  type Row =
    | { kind: 'reminder'; at: number; r: Reminder }
    | { kind: 'note'; at: number; n: CoachNote };

  const rows: Row[] = [
    ...reminders.map<Row>((r) => ({ kind: 'reminder', at: r.atSec, r })),
    ...coachNotes.map<Row>((n) => ({ kind: 'note', at: n.atSec, n })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="thin-scroll h-full space-y-2 overflow-y-auto pr-1">
      {welcomeText != null && (
        <div
          className="reminder-enter rounded-lg rounded-l-none border border-y-[#e6dfd2] border-r-[#e6dfd2] p-3"
          style={{ borderLeft: '3px solid #a66a3a', background: 'rgba(166,106,58,0.08)' }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#a66a3a]" strokeWidth={1.8} />
            <span className="text-[11px] font-semibold text-[#7a5230]">教练 · 个性化陪练</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#4a423e]">
            {welcomeText}
            {welcomeText.length > 0 && (
              <span className="welcome-caret ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] bg-[#a66a3a]" />
            )}
          </p>
        </div>
      )}
      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#e6dfd2] bg-[#faf7f1] p-5 text-center">
          <p className="text-[13px] text-[#6e625e]">AI 教练正在观察中</p>
          <p className="mt-1 text-xs text-[#9c8e80]">
            出现明显问题时会在这里提醒你，状态正常时不会打扰
          </p>
        </div>
      )}
      {rows.map((row, i) => {
        if (row.kind === 'note') {
          const n = row.n;
          return (
            <div
              key={`note-${n.atSec}-${i}`}
              className="reminder-enter rounded-lg rounded-l-none border border-y-[#e6dfd2] border-r-[#e6dfd2] p-3"
              style={{ borderLeft: '3px solid #8ab4d4', background: 'rgba(138,180,212,0.07)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#7a9cb8]">环节点评</span>
                <span className="ml-auto font-mono text-[10px] text-[#9c8e80]">{fmt(n.atSec)}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#4a423e]">{n.message}</p>
            </div>
          );
        }
        const r = row.r;
        const meta = TYPE_META[r.type] ?? { color: '#a66a3a', label: '提醒' };
        const isPraise = r.type === 'praise';
        return (
          <div
            key={`${r.atSec}-${i}`}
            className="reminder-enter rounded-lg rounded-l-none border border-y-[#e6dfd2] border-r-[#e6dfd2] p-3"
            style={{
              borderLeft: `3px solid ${meta.color}`,
              background: isPraise ? 'rgba(138,184,154,0.08)' : 'rgba(166,106,58,0.045)',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-semibold"
                style={{ color: meta.color }}
              >
                {meta.label}
              </span>
              {r.priority === 1 && (
                <span className="rounded-full bg-[#f7efe2] px-1.5 py-0.5 text-[10px] font-semibold text-[#b56a3a]">
                  重要
                </span>
              )}
              {SOURCE_META[r.source] && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${SOURCE_META[r.source].className}`}
                >
                  {SOURCE_META[r.source].text}
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] text-[#9c8e80]">{fmt(r.atSec)}</span>
            </div>
            <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#3a322e]">
              {r.message}
            </p>
          </div>
        );
      })}
    </div>
  );
}
