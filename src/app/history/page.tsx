'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { SiteHeader } from '@/components/site-header';
import { TaskIcon } from '@/components/task-icon';
import { getTaskPreset } from '@/lib/session-config';
import type { SessionRecord } from '@/lib/types';

function scoreColor(v: number): string {
  return v >= 80 ? '#8ab89a' : v >= 60 ? '#d4a574' : '#b56a3a';
}

function CardHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between border-b border-[#f1ebdf] pb-3">
      <h2 className="font-serif text-[15px] font-bold tracking-[0.5px] text-[#2c2422]">{title}</h2>
      {hint && <span className="text-[11px] text-[#9c8e80]">{hint}</span>}
    </div>
  );
}

export default function HistoryPage() {
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    fetch('/api/session/list?limit=30')
      .then((r) => r.json())
      .then((d: { ok: boolean; sessions?: SessionRecord[] }) => {
        if (d.ok && d.sessions) setRecords(d.sessions);
      })
      .catch(() => undefined)
      .finally(() => setStatus('ready'));
  }, []);

  /** 按时间正序构建趋势数据 */
  const trendData = useMemo(() => {
    const asc = [...records].reverse();
    return asc.map((r, i) => ({
      name: `第${i + 1}场`,
      总分: r.overall_score ?? 0,
      镜头表现: r.metrics?.cameraPresence ?? 0,
      语言表达: r.metrics?.expression ?? 0,
      互动能力: r.metrics?.interaction ?? 0,
    }));
  }, [records]);

  /** 跨场次高频问题 */
  const commonIssues = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      const seen = new Set<string>();
      for (const rem of r.reminders ?? []) {
        if (seen.has(rem.message)) continue;
        seen.add(rem.message);
        map.set(rem.message, (map.get(rem.message) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [records]);

  const progress = useMemo(() => {
    if (records.length < 2) return null;
    const first = records[records.length - 1];
    const last = records[0];
    const diff = (last.overall_score ?? 0) - (first.overall_score ?? 0);
    return { count: records.length, diff, firstScore: first.overall_score ?? 0, lastScore: last.overall_score ?? 0 };
  }, [records]);

  const remove = async (id: string) => {
    if (!window.confirm('确定删除这条训练记录吗？')) return;
    await fetch(`/api/session/${id}`, { method: 'DELETE' });
    setRecords((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-bold tracking-[1px] text-[#2c2422] sm:text-[26px]">
            训练成长记录
          </h1>
          <p className="mt-2 text-[13px] text-[#9c8e80]">
            训练—反馈—复盘—再次训练：查看历次模拟直播表现与能力变化
          </p>
        </div>

        {status === 'loading' ? (
          <div className="flex justify-center py-20">
            <span className="spinner h-8 w-8 rounded-full border-2 border-[#a66a3a] border-t-transparent" />
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e0d6d0] bg-white/60 p-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3e7d5]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-[#a66a3a]" aria-hidden>
                <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
              </svg>
            </div>
            <p className="mt-4 font-serif text-base font-bold text-[#2c2422]">还没有训练记录</p>
            <p className="mt-1 text-sm text-[#9c8e80]">
              完成第一场模拟直播后，这里将呈现你的成长曲线
            </p>
            <Link
              href="/setup"
              className="mt-5 inline-block rounded-full bg-[#a66a3a] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#8f5630]"
            >
              开始第一场训练
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 进步概览：参考稿 vp-stat 风格 */}
            {progress && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: '累计训练场次', value: String(progress.count), color: '#2c2422' },
                  { label: '首次训练总分', value: String(progress.firstScore), color: '#9c8e80' },
                  { label: '最近一次总分', value: String(progress.lastScore), color: scoreColor(progress.lastScore) },
                  {
                    label: '整体变化',
                    value: `${progress.diff >= 0 ? '+' : ''}${progress.diff}`,
                    color: progress.diff >= 0 ? '#8ab89a' : '#b56a3a',
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-2xl border border-[#e6dfd2] bg-white p-3.5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:p-4"
                  >
                    <p className="text-xs text-[#9c8e80]">{s.label}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl" style={{ color: s.color }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 能力趋势 */}
            {records.length >= 2 && (
              <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
                <CardHead title="能力变化趋势" hint="按时间顺序展示总分与重点维度的变化" />
                <div className="h-[240px] sm:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid stroke="rgba(44,36,34,0.06)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#9c8e80', fontSize: 11 }}
                        stroke="rgba(44,36,34,0.12)"
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#9c8e80', fontSize: 11 }}
                        stroke="rgba(44,36,34,0.12)"
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#ffffff',
                          border: '1px solid #e6dfd2',
                          borderRadius: 12,
                          fontSize: 12,
                          boxShadow: '0 8px 24px rgba(44,36,34,0.10)',
                        }}
                        labelStyle={{ color: '#2c2422', fontWeight: 700 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="总分"
                        stroke="#a66a3a"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#a66a3a', strokeWidth: 0 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="镜头表现"
                        stroke="#8ab4d4"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="语言表达"
                        stroke="#d4a574"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="互动能力"
                        stroke="#b8a4d4"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 常见问题 */}
            {commonIssues.length > 0 && (
              <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
                <CardHead title="跨场次常见问题" hint="出现过的训练场次越多，越是需要持续关注的短板" />
                <div className="space-y-2.5">
                  {commonIssues.map(([msg, count]) => (
                    <div key={msg}>
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-[#4a423e]">{msg}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-[#9c8e80]">
                          {count} 场次
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#f1ebe0]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / Math.max(commonIssues[0][1], 1)) * 100}%`,
                            background: 'linear-gradient(90deg, #ecd3b2, #d4a574)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 训练列表 */}
            <div>
              <h2 className="mb-3 font-serif text-[15px] font-bold tracking-[0.5px] text-[#2c2422]">
                全部训练记录
              </h2>
              <div className="space-y-2.5">
                {records.map((r) => {
                  const task = getTaskPreset(r.task_type);
                  const sc = scoreColor(r.overall_score ?? 0);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-2xl border border-[#e6dfd2] bg-white p-3 shadow-[0_1px_3px_rgba(44,36,34,0.04)] transition-all hover:border-[#d8cbc5] hover:shadow-[0_4px_16px_rgba(44,36,34,0.08)] sm:gap-4 sm:p-4"
                    >
                      <Link
                        href={`/review/${r.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4"
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold tabular-nums sm:h-12 sm:w-12 sm:text-lg"
                          style={{ background: `${sc}14`, color: sc }}
                        >
                          {r.overall_score ?? '--'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-serif text-[15px] font-bold text-[#2c2422]">
                            {r.topic || '自由模拟直播'}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#9c8e80]">
                            <TaskIcon taskId={r.task_type} className="h-3.5 w-3.5 shrink-0" />
                            {task?.name ?? '自由任务'}
                            {r.student_name ? ` · ${r.student_name}` : ''} ·{' '}
                            {new Date(r.created_at).toLocaleString('zh-CN', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            · {Math.floor(r.duration_sec / 60)} 分钟 · 提醒{' '}
                            {r.reminders?.length ?? 0} 次
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-xs text-[#a66a3a] sm:block">
                          查看复盘 →
                        </span>
                      </Link>
                      <button
                        onClick={() => void remove(r.id)}
                        className="shrink-0 rounded-full border border-[#e6dfd2] px-3 py-2 text-xs text-[#9c8e80] transition-colors hover:border-[#e5c5a3] hover:bg-[#f7efe2] hover:text-[#b56a3a] sm:py-1.5"
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
