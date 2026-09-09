'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BookUser } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ScoreRadar } from '@/components/review/score-radar';
import { ScoreRing } from '@/components/score-ring';
import { TaskIcon } from '@/components/task-icon';
import { SessionTimeline } from '@/components/review/session-timeline';
import { getTaskPreset, loadStoredProfile, saveStoredProfile, COACH_STYLE_META, type StoredProfile } from '@/lib/session-config';
import type { ReviewReport, SessionRecord, LiveStage, GrowthProfile, MetricKey } from '@/lib/types';
import { METRIC_KEYS, METRIC_LABELS } from '@/lib/types';

const ZERO_METRICS = Object.fromEntries(
  METRIC_KEYS.map((k) => [k, 0])
) as Record<(typeof METRIC_KEYS)[number], number>;

/** 后端复盘失败时落库的占位对象（非真实 ReviewReport），渲染前必须排除 */
function isFailedSummary(s: unknown): boolean {
  return typeof s === 'object' && s !== null && (s as { failed?: unknown }).failed === true;
}

function gradeOf(score: number): { label: string; color: string } {
  if (score >= 85) return { label: '优秀', color: '#8ab89a' };
  if (score >= 70) return { label: '良好', color: '#c4838a' };
  if (score >= 55) return { label: '合格', color: '#d4a574' };
  return { label: '继续加油', color: '#c4bab3' };
}

/** 参考稿 vp-stat：白卡大数字统计 */
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#e8e0dc] bg-white px-3 py-3.5 text-center shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:px-4">
      <p className="text-lg font-bold tabular-nums text-[#2c2422] sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#a69791]">{label}</p>
    </div>
  );
}

function CardHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between border-b border-[#f0eae6] pb-3">
      <h2 className="font-serif text-[15px] font-bold tracking-[0.5px] text-[#2c2422]">{title}</h2>
      {hint && <span className="text-[11px] text-[#a69791]">{hint}</span>}
    </div>
  );
}

/** 复盘完成后计算并回写成长档案（纯前端计算，稳定无 LLM 依赖） */
function computeGrowthProfile(
  cur: SessionRecord,
  prevRec: SessionRecord | null,
  before: GrowthProfile | null
): GrowthProfile {
  const overall = cur.overall_score ?? 0;
  const weak = [...METRIC_KEYS]
    .sort((a, b) => (cur.metrics?.[a] ?? 0) - (cur.metrics?.[b] ?? 0))
    .slice(0, 2) as MetricKey[];
  const improved = (prevRec?.metrics
    ? METRIC_KEYS.filter((k) => (cur.metrics?.[k] ?? 0) - (prevRec.metrics?.[k] ?? 0) >= 3)
    : []) as MetricKey[];
  const sessions = (before?.sessions ?? 0) + 1;
  const lastOveralls = [overall, ...(before?.lastOveralls ?? [])].slice(0, 5);
  const parts = [`第 ${sessions} 场 · 总评 ${overall} 分`];
  if (improved.length) {
    parts.push(`${improved.map((k) => METRIC_LABELS[k]).join('、')} 较上场提升`);
  }
  if (weak.length) {
    parts.push(`待突破：${weak.map((k) => METRIC_LABELS[k]).join('、')}`);
  }
  return {
    sessions,
    weakMetrics: weak,
    improvedMetrics: improved,
    lastOveralls,
    note: parts.join('，'),
    updatedAt: new Date().toISOString(),
  };
}

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [prev, setPrev] = useState<SessionRecord | null>(null);
  const [profile] = useState<StoredProfile>(() => loadStoredProfile());
  const coachLabel =
    COACH_STYLE_META.find((c) => c.value === profile.coachStyle)?.label ?? '专业导师';
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [generating, setGenerating] = useState<'idle' | 'generating' | 'done' | 'failed'>(
    'idle'
  );
  const pollTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);

  // 卸载时停止复盘轮询（mountedRef 在 effect 内复位，兼容 StrictMode 双执行）
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const t of pollTimersRef.current) window.clearTimeout(t);
      pollTimersRef.current = [];
    };
  }, []);

  const generateReview = useCallback(async (id: string) => {
    setGenerating('generating');
    try {
      const res = await fetch(`/api/session/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ growth: loadStoredProfile().growth }),
      });
      const d = (await res.json()) as { ok: boolean; ready?: boolean };
      if (!d.ok) {
        setGenerating('failed');
        return;
      }
      // 触发成功（或已就绪）后轮询检查复盘是否落库
      let attempts = 0;
      const readRecord = async (): Promise<'pending' | 'done' | 'failed'> => {
        try {
          const r = await fetch(`/api/session/${id}`);
          const rd = (await r.json()) as { ok: boolean; record?: SessionRecord };
          const s = rd.ok ? rd.record?.summary : null;
          if (s && typeof s === 'object') {
            if ((s as { failed?: boolean }).failed) return 'failed';
            setRecord(rd.record ?? null);
            return 'done';
          }
        } catch {
          // 单次轮询失败忽略，继续重试
        }
        return 'pending';
      };
      // 卸载安全的轮询调度：登记 timer，卸载时统一清理
      const schedule = (fn: () => void) => {
        const t = window.setTimeout(() => {
          pollTimersRef.current = pollTimersRef.current.filter((x) => x !== t);
          if (mountedRef.current) fn();
        }, 2500);
        pollTimersRef.current.push(t);
      };
      const poll = async () => {
        if (!mountedRef.current) return;
        attempts += 1;
        const state = await readRecord();
        if (state !== 'pending') {
          setGenerating(state === 'done' ? 'done' : 'failed');
          return;
        }
        if (attempts >= 5) {
          // after() 未能完成时，降级为同步生成（浏览器长等待）
          try {
            const r2 = await fetch(`/api/session/${id}/review?mode=sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ growth: loadStoredProfile().growth }),
            });
            const d2 = (await r2.json()) as { ok: boolean; ready?: boolean };
            if (d2.ok) {
              const state2 = await readRecord();
              setGenerating(state2 === 'done' ? 'done' : state2 === 'failed' ? 'failed' : 'failed');
              return;
            }
          } catch {
            // 同步降级失败
          }
          setGenerating('failed');
          return;
        }
        schedule(() => void poll());
      };
      void poll();
    } catch {
      setGenerating('failed');
    }
  }, []);

  useEffect(() => {
    const id = params?.id;
    if (!id) return;
    fetch(`/api/session/${id}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; record?: SessionRecord; prev?: SessionRecord | null }) => {
        if (!mountedRef.current) return;
        if (d.ok && d.record) {
          setRecord(d.record);
          setPrev(d.prev ?? null);
          setStatus('ready');
          // 无 AI 复盘（或上次生成失败的占位）时自动触发/重试生成
          if (!d.record.summary || isFailedSummary(d.record.summary)) {
            void generateReview(id);
          } else {
            setGenerating('done');
          }
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        if (mountedRef.current) setStatus('error');
      });
  }, [params?.id, generateReview]);

  // 复盘就绪后自动回写成长档案（幂等：同一条记录只累计一次）
  const growthAppliedRef = useRef<string | null>(null);
  // 初始化即读现有档案：老学员进入复盘页时应立刻看到历史档案，而非等待本场复盘生成
  const [growth, setGrowth] = useState<GrowthProfile | null>(() => loadStoredProfile().growth ?? null);
  useEffect(() => {
    if (generating !== 'done' || !record || !record.summary) return;
    // 失败占位复盘（AI 生成失败）不计入成长档案
    if (isFailedSummary(record.summary)) return;
    if (growthAppliedRef.current === record.id) return;
    growthAppliedRef.current = record.id;
    const stored = loadStoredProfile();
    const next = computeGrowthProfile(record, prev, stored.growth);
    saveStoredProfile({ ...stored, growth: next });
    setGrowth(next);
  }, [generating, record, prev]);

  const reminderAgg = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of record?.reminders ?? []) {
      map.set(r.message, (map.get(r.message) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [record]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="spinner h-8 w-8 rounded-full border-2 border-[#c4838a] border-t-transparent" />
      </div>
    );
  }

  if (status === 'error' || !record) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="font-serif text-lg font-bold text-[#2c2422]">未找到该训练记录</p>
        <Link
          href="/history"
          className="rounded-full bg-[#c4838a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#b8727a]"
        >
          返回训练记录
        </Link>
      </div>
    );
  }

  const score = record.overall_score ?? 0;
  const grade = gradeOf(score);
  const task = getTaskPreset(record.task_type);
  const summary: ReviewReport | null =
    record.summary && !isFailedSummary(record.summary) ? record.summary : null;
  const stageList: LiveStage[] = record.stage_timeline ?? [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* 头部：评分环 + 标题 + 等级 */}
        <div className="fade-up mb-6 flex flex-col gap-5 rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)] sm:p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-5">
            <ScoreRing value={score} size={108} />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#a69791]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2e0e2] px-2.5 py-1 font-medium text-[#9d5f68]">
                  <TaskIcon taskId={record.task_type} className="h-3.5 w-3.5" />
                  {task?.name ?? '自由模拟直播'}
                </span>
                <span>
                  {new Date(record.created_at).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <h1 className="mt-2 font-serif text-xl font-bold tracking-[0.5px] text-[#2c2422] sm:text-2xl">
                {record.topic || '自由模拟直播'} · 训练复盘
              </h1>
              <span
                className="mt-2.5 inline-block rounded-full px-3 py-1 text-xs font-semibold"
                style={{ color: grade.color, background: `${grade.color}18` }}
              >
                {grade.label}
              </span>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-start gap-3 lg:justify-end">
            <Link
              href={`/setup?task=${record.task_type}`}
              className="w-full rounded-full bg-[#c4838a] px-6 py-3 text-center text-sm font-medium text-white shadow-[0_4px_16px_rgba(196,131,138,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#b8727a] sm:w-auto"
            >
              再练一场
            </Link>
            <Link
              href="/history"
              className="w-full rounded-full border border-[#e8e0dc] bg-white px-6 py-3 text-center text-sm font-medium text-[#6e625e] transition-colors hover:border-[#c4bab3] sm:w-auto"
            >
              全部记录
            </Link>
          </div>
        </div>

        {/* 统计条 */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="直播时长" value={`${Math.floor(record.duration_sec / 60)}分${record.duration_sec % 60}秒`} />
          <StatPill label="AI 提醒次数" value={record.reminders?.length ?? 0} />
          <StatPill label="覆盖流程环节" value={`${stageList.filter((s) => s.enteredAtSec >= 0).length}/${stageList.length || '-'}`} />
          <StatPill label="训练场次" value={`第 ${prev ? 2 : 1} 场`} />
        </div>

        {/* 直播时间轴回放（环节带 + 评分曲线 + 提醒事件） */}
        <div className="mb-6 fade-up">
          <SessionTimeline
            reminders={record.reminders ?? []}
            stages={stageList}
            samples={record.metric_samples ?? []}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
          {/* 左：AI 总结 */}
          <div className="space-y-5">
            <div className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)] sm:p-6">
              <CardHead title="AI 训练总结" hint={summary ? '由 AI 教练生成本场复盘' : undefined} />
              {summary ? (
                <div className="space-y-5">
                  <p className="text-[15px] leading-[1.9] text-[#3a322e]">{summary.overall}</p>
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#6e9a7e]">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e2ecdf] text-[10px]">✓</span>
                      表现较好的部分
                    </h3>
                    <ul className="space-y-1.5">
                      {summary.strengths.map((s, i) => (
                        <li
                          key={i}
                          className="rounded-lg rounded-l-none border border-y-[#eef2ec] border-r-[#eef2ec] bg-[#f4f8f2] px-3.5 py-2 text-[13.5px] text-[#4a423e]"
                          style={{ borderLeft: '3px solid #8ab89a' }}
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#b56a6a]">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f2dede] text-[10px]">!</span>
                      最需要改进的问题
                    </h3>
                    <ul className="space-y-1.5">
                      {summary.weaknesses.map((s, i: number) => (
                        <li
                          key={i}
                          className="rounded-lg rounded-l-none border border-y-[#f5ecec] border-r-[#f5ecec] bg-[#faf3f3] px-3.5 py-2 text-[13.5px] text-[#4a423e]"
                          style={{ borderLeft: '3px solid #c47a7a' }}
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-[#ecdcc3] bg-[#faf5ec] p-4">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-[#a87f4a]">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f0e2cb] text-[10px]">◆</span>
                      下一次训练建议
                    </h3>
                    <ul className="mt-2.5 space-y-1.5">
                      {summary.nextAdvice.map((s, i: number) => (
                        <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-[#4a423e]">
                          <span className="font-semibold text-[#c49a6c]">{i + 1}.</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : generating === 'generating' ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#e8e0dc] bg-[#faf6f4] px-4 py-4 text-sm text-[#6e625e]">
                  <span className="spinner h-4 w-4 shrink-0 rounded-full border-2 border-[#c4838a] border-t-transparent" />
                  AI 教练正在回看本场直播数据，生成训练总结...
                </div>
              ) : generating === 'failed' ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#ecdcc3] bg-[#faf5ec] px-4 py-4 text-sm text-[#a87f4a]">
                  复盘生成遇到问题
                  <button
                    onClick={() => record && void generateReview(record.id)}
                    className="rounded-full bg-[#c4838a] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#b8727a]"
                  >
                    重新生成
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#a69791]">暂无复盘内容，但数据已保留。</p>
              )}
            </div>

            {/* 各维度点评：参考稿 report-table 行式布局 */}
            {summary && (
              <div className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)] sm:p-6">
                <CardHead title="分维度点评" />
                <div>
                  {[
                    { label: '流程与节奏', text: summary.stageReview },
                    { label: '表达表现', text: summary.expressionReview },
                    { label: '镜头表现', text: summary.cameraReview },
                    { label: '互动表现', text: summary.interactionReview },
                  ].map((d, i) => (
                    <div
                      key={d.label}
                      className={`flex flex-col gap-1.5 py-3.5 ${
                        i < 3 ? 'border-b border-[#f5efec]' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-[#2c2422]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#c4838a]" />
                        {d.label}
                      </span>
                      <p className="pl-3.5 text-[13px] leading-relaxed text-[#6e625e]">{d.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 环节时间线 */}
            {stageList.length > 0 && (
              <div className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)] sm:p-6">
                <CardHead title="直播流程完成情况" />
                <div className="flex flex-wrap gap-2">
                  {stageList.map((s) => {
                    const entered = s.enteredAtSec >= 0;
                    return (
                      <span
                        key={s.name}
                        className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                          entered
                            ? 'bg-[#eef5ea] text-[#6e9a7e]'
                            : 'bg-[#faf5ec] text-[#b8874e]'
                        }`}
                      >
                        {entered ? '✓' : '○'} {s.name}
                        {entered && (
                          <span className="ml-1.5 font-mono text-[11px] opacity-70">
                            {Math.floor(s.enteredAtSec / 60)}:
                            {String(s.enteredAtSec % 60).padStart(2, '0')}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[#a69791]">
                  绿色为已进入的环节，黄色为本次直播未覆盖的环节。
                </p>
              </div>
            )}
          </div>

          {/* 右：雷达图 + 提醒统计 */}
          <div className="space-y-5">
            <div className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
              <CardHead title="能力雷达图" hint={prev ? '虚线为上一次训练' : undefined} />
              <ScoreRadar
                metrics={record.metrics ?? ZERO_METRICS}
                compare={prev ? prev.metrics ?? ZERO_METRICS : null}
              />
            </div>

            <div className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
              <CardHead title="成长档案" hint="AI 教练自动维护，下次陪练生效" />
              {growth ? (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#faf3f3] to-white p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2e0e2]">
                      <BookUser className="h-4 w-4 text-[#c4838a]" strokeWidth={1.6} />
                    </span>
                    <div>
                      <p className="text-[13px] font-bold text-[#2c2422]">
                        已陪练 {growth.sessions} 场
                      </p>
                      <p className="text-[11px] text-[#a69791]">
                        {coachLabel} · {profile?.learner.background || '未填写背景'}
                      </p>
                    </div>
                  </div>

                  {(growth.weakMetrics.length > 0 || growth.improvedMetrics.length > 0) && (
                    <div className="space-y-2">
                      {growth.improvedMetrics.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-[#a69791]">正在进步</span>
                          {growth.improvedMetrics.map((k) => (
                            <span key={k} className="rounded-full bg-[#eef5ea] px-2 py-0.5 text-[11px] font-medium text-[#6e9a7e]">
                              {METRIC_LABELS[k]}
                            </span>
                          ))}
                        </div>
                      )}
                      {growth.weakMetrics.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-[#a69791]">待突破</span>
                          {growth.weakMetrics.map((k) => (
                            <span key={k} className="rounded-full bg-[#faf5ec] px-2 py-0.5 text-[11px] font-medium text-[#b8874e]">
                              {METRIC_LABELS[k]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {growth.lastOveralls.length > 1 && (
                    <div>
                      <p className="mb-1.5 text-[11px] text-[#a69791]">最近总分走势（左旧右新）</p>
                      <div className="flex items-end gap-1.5">
                        {growth.lastOveralls.slice().reverse().map((v, i) => (
                          <div key={i} className="flex flex-1 flex-col items-center gap-1">
                            <span className="font-mono text-[11px] font-bold tabular-nums text-[#6e625e]">{v}</span>
                            <div
                              className="w-full rounded-t-md bg-gradient-to-t from-[#f2e0e2] to-[#e8c4c8]"
                              style={{ height: `${Math.max(((v ?? 0) / 100) * 36, 4)}px` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="rounded-xl border border-[#f0eae6] bg-[#faf6f4] p-3 text-[12.5px] leading-relaxed text-[#6e625e]">
                    {growth.note || '档案将随训练自动积累，AI 教练据此调整陪练重点。'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[#a69791]">
                  本场是档案记录的第一场训练。复盘完成后，AI 将自动提炼弱项与进步点，作为下次陪练的起点。
                </p>
              )}
            </div>

            <div className="fade-up rounded-2xl border border-[#e8e0dc] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
              <CardHead title="本场 AI 提醒统计" />
              {reminderAgg.length === 0 ? (
                <p className="text-sm text-[#a69791]">本场直播 AI 未触发提醒，状态整体稳定。</p>
              ) : (
                <div className="space-y-2.5">
                  {reminderAgg.map(([msg, count], i) => {
                    const hot = count >= 3;
                    return (
                      <div key={`${msg}-${i}`}>
                        <div className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="truncate text-[#4a423e]">{msg}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-bold tabular-nums ${
                              hot ? 'bg-[#f9eded] text-[#c47a7a]' : 'bg-[#f0ebe7] text-[#6e625e]'
                            }`}
                          >
                            ×{count}
                          </span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#f0eae7]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min((count / Math.max(reminderAgg[0][1], 1)) * 100, 100)}%`,
                              background: hot ? '#c47a7a' : '#e8c4c8',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 border-t border-[#f0eae6] pt-3 text-xs leading-relaxed text-[#a69791]">
                提示：同一问题出现 3 次以上，建议在下次训练时列为重点改进目标。
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
