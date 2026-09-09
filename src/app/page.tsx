'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Eye,
  TrendingUp,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { TaskIcon } from '@/components/task-icon';
import { TASK_PRESETS } from '@/lib/session-config';
import type { SessionRecord } from '@/lib/types';

interface SessionListItem {
  id: string;
  task_type: string;
  topic: string | null;
  duration_sec: number;
  overall_score: number | null;
  created_at: string;
}

function scoreColor(v: number): string {
  return v >= 80 ? '#8ab89a' : v >= 60 ? '#d4a574' : '#c47a7a';
}

function ScoreBadge({ score }: { score: number | null }) {
  const v = score ?? 0;
  const color = scoreColor(v);
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold"
      style={{
        color,
        border: `1.5px solid ${color}55`,
        background: `${color}14`,
      }}
    >
      {v || '--'}
    </span>
  );
}

/** 环形小评分（最近训练用，呼应参考稿 score-ring） */
function StepCard({
  step,
  title,
  desc,
  icon: Icon,
  delay,
}: {
  step: string;
  title: string;
  desc: string;
  icon: typeof ClipboardList;
  delay: number;
}) {
  return (
    <div
      className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] transition-shadow hover:shadow-[0_4px_20px_rgba(44,36,34,0.06)]"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2e0e2]">
          <Icon className="h-4.5 w-4.5 text-[#c4838a]" strokeWidth={1.6} />
        </span>
        <span className="font-mono text-xs font-bold tracking-wider text-[#c4838a]">
          {step}
        </span>
      </div>
      <h3 className="mt-3.5 font-serif text-[15px] font-bold tracking-[0.5px] text-[#2c2422]">
        {title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#6e625e]">{desc}</p>
    </div>
  );
}

export default function HomePage() {
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/session/list?limit=4')
      .then((r) => r.json())
      .then((d: { ok: boolean; sessions?: SessionListItem[] }) => {
        if (d.ok && d.sessions) setRecent(d.sessions);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero（参照参考稿：居中 Serif 标题 + 宽字距英文副标题 + 光晕） */}
      <section className="relative px-4 pb-14 pt-16 text-center sm:pt-20">
        <div
          className="pointer-events-none absolute left-1/2 top-[-60px] -translate-x-1/2 rounded-full"
          style={{
            width: 240,
            height: 240,
            background:
              'radial-gradient(circle, rgba(196,131,138,0.12) 0%, transparent 70%)',
          }}
        />
        <div className="fade-up relative mx-auto max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e8c4c8] bg-[#f2e0e2] px-3.5 py-1.5 text-xs font-medium tracking-[0.3px] text-[#9d5f68]">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#c47a7a]" />
            面向职业教育 · 高校直播实训场景
          </div>
          <h1 className="font-serif text-[28px] font-bold leading-[1.3] tracking-[2px] text-[#2c2422] sm:text-[34px]">
            <span className="text-[#c4838a]">直播</span>实训 AI 陪练
          </h1>
          <p className="mt-2.5 text-[11px] font-light tracking-[5px] text-[#a69791]">
            LIVE PRACTICE · AI COACH
          </p>
          <p className="mx-auto mt-5 max-w-[500px] text-[13px] leading-[1.7] tracking-[0.3px] text-[#a69791]">
            AI 教练实时观察你的镜头表现、表情姿态、语言表达与直播流程：
            离镜头太近、忘词冷场、遗漏环节，都会像耳返一样轻声提醒。
            直播结束，立即获得复盘报告与成长记录。
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/setup"
              className="pulse-ring group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c4838a] px-8 py-3.5 text-[14px] font-medium tracking-[0.3px] text-white transition-all hover:bg-[#b8727a] hover:shadow-[0_4px_20px_rgba(196,131,138,0.35)] sm:w-auto"
            >
              开始模拟直播训练
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/history"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#e8e0dc] bg-white px-7 py-3.5 text-[14px] text-[#6e625e] transition-all hover:border-[#a69791] hover:text-[#2c2422] sm:w-auto"
            >
              查看成长记录
            </Link>
          </div>
        </div>
      </section>

      {/* 三步流程 */}
      <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StepCard
            step="01"
            title="选择训练任务"
            desc="产品介绍、直播带货、农产品、文旅等 8 类实训场景，也可自拟主题自由演练"
            icon={ClipboardList}
            delay={0.05}
          />
          <StepCard
            step="02"
            title="AI 实时陪练"
            desc="镜头、表情、语速、停顿、口头禅与流程环节全程观察，即时轻量提醒，不打断表达"
            icon={Eye}
            delay={0.13}
          />
          <StepCard
            step="03"
            title="AI 复盘与成长"
            desc="结束即得复盘报告：雷达图、提醒统计与改进建议，多次训练沉淀成长曲线"
            icon={TrendingUp}
            delay={0.21}
          />
        </div>
      </section>

      {/* 任务选择 */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold tracking-[1px] text-[#2c2422]">
              选择一个直播训练任务
            </h2>
            <p className="mt-1.5 text-[13px] text-[#a69791]">
              选择任务后进入直播准备页，填写越完整 AI 陪练越有针对性
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {TASK_PRESETS.map((t, i) => (
            <Link
              key={t.id}
              href={`/setup?task=${t.id}`}
              className="fade-up group relative overflow-hidden rounded-2xl border border-[#e8e0dc] bg-white p-5 transition-all hover:-translate-y-1 hover:border-[#e8c4c8] hover:shadow-[0_8px_28px_rgba(196,131,138,0.14)]"
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2e0e2] transition-colors group-hover:bg-[#e8c4c8]">
                <TaskIcon
                  taskId={t.id}
                  className="h-5 w-5 text-[#c4838a]"
                />
              </span>
              <h3 className="mt-3.5 font-serif text-[15px] font-bold tracking-[0.5px] text-[#2c2422]">
                {t.name}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#a69791]">
                {t.desc}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#c4838a] opacity-0 transition-opacity group-hover:opacity-100">
                进入准备 <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 最近训练 */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold tracking-[1px] text-[#2c2422]">
              最近训练
            </h2>
            <p className="mt-1.5 text-[13px] text-[#a69791]">
              训练—反馈—复盘—再训练，每一场都被记录
            </p>
          </div>
          {recent.length > 0 && (
            <Link
              href="/history"
              className="inline-flex items-center gap-1 text-[13px] text-[#c4838a] transition-colors hover:text-[#b8727a]"
            >
              全部记录 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        {loaded && recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e8e0dc] bg-white/50 p-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-[#d8cdc6]" strokeWidth={1.4} />
            <p className="mt-3 text-[13.5px] text-[#a69791]">
              还没有训练记录，选择上方任务开始第一场模拟直播吧
            </p>
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {recent.map((s: SessionListItem) => (
              <Link
                key={s.id}
                href={`/review/${s.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-[#e8e0dc] bg-white p-4 transition-all hover:border-[#e8c4c8] hover:shadow-[0_4px_20px_rgba(44,36,34,0.06)]"
              >
                <ScoreBadge score={s.overall_score} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[14.5px] font-bold tracking-[0.3px] text-[#2c2422]">
                    {s.topic || '自由模拟直播'}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[#a69791]">
                    <TaskIcon taskId={s.task_type} className="h-3.5 w-3.5" />
                    {new Date(s.created_at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {Math.floor(s.duration_sec / 60)} 分钟
                  </p>
                </div>
                <span className="hidden shrink-0 items-center gap-1 text-xs text-[#c4838a] opacity-70 transition-opacity group-hover:opacity-100 sm:inline-flex">
                  复盘 <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-[#e8e0dc] bg-white/60 px-4 py-8 text-center text-xs leading-relaxed text-[#a69791]">
        LiveCoach · AI 辅助模拟直播演练与实时主播陪练系统
        <span className="mx-2">·</span>
        分析仅针对直播表现与训练相关的外在表现
      </footer>
    </div>
  );
}
