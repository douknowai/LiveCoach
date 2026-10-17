'use client';

import { useEffect, useState } from 'react';
import { useLiveSession } from '@/hooks/use-live-session';
import { getTaskPreset } from '@/lib/session-config';
import { ReminderFeed } from '@/components/live/reminder-feed';
import { StagePanel } from '@/components/live/stage-panel';
import { MetricsStrip } from '@/components/live/metrics-strip';
import { ScoreRing } from '@/components/score-ring';
import { FaceStatusChips } from '@/components/live/face-status';
import type { TrainingConfig } from '@/lib/types';

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 22h8M12 18v4" />
    </svg>
  );
}

function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 15a7.5 7.5 0 1 1 7.5-7.5" />
      <path d="M12 15l5-7" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" />
    </svg>
  );
}

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M15.5 5H10a4 4 0 0 0 0 8h4a4 4 0 0 1 0 8H8.5" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="2.4" />
    </svg>
  );
}

/** 参考稿 card-header：图标 + 标题 + 徽章（顶级组件，避免渲染期创建） */
function CardHead({
  icon: Icon,
  title,
  badge,
}: {
  icon: (p: { className?: string }) => React.ReactElement;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-[#f1ebdf] px-4 py-3">
      <h3 className="flex items-center gap-2 font-serif text-[14px] font-bold tracking-[0.5px] text-[#2c2422]">
        <Icon className="h-4 w-4 text-[#a66a3a]" />
        {title}
      </h3>
      {badge}
    </div>
  );
}

function gradeText(v: number): string {
  if (v >= 85) return '表现优秀，保持状态';
  if (v >= 70) return '表现良好，稳步提升';
  if (v >= 55) return '渐入佳境，继续加油';
  return '刚刚起步，慢慢来';
}

/** 直播间主体（config 就绪后才挂载，保证 hook 拿到完整配置） */
function LiveRoom({ config }: { config: TrainingConfig }) {
  const s = useLiveSession(config);
  const {
    videoRef,
    phase,
    cameraReady,
    cameraError,
    countdown,
    elapsedSec,
    reminders,
    welcomeText,
    latestReminder,
    coachNotes,
    metricsSnap,
    audioState,
    faceState,
    stages,
    currentLabel,
    aiStatus,
    saveError,
    counts,
    initCamera,
    beginCountdown,
    endLive,
    abort,
  } = s;

  const [activeTab, setActiveTab] = useState<'coach' | 'stage' | 'metrics'>('coach');

  /* 进入页面即请求设备 */
  useEffect(() => {
    void initCamera();
  }, [initCamera]);

  const isLive = phase === 'live';
  const isDevice = phase === 'device';
  const isCountdown = phase === 'countdown';
  const isSaving = phase === 'saving';
  const isEnded = phase === 'ended';
  const task = getTaskPreset(config.taskType);

  const cfgSummary: [string, string][] = [
    ['任务', task?.name ?? '自由模拟直播'],
    ['主题', config.topic || '（未填写）'],
    ['产品/内容', config.product || '（未填写）'],
    ['目标受众', config.audience || '（未填写）'],
  ];

  const statusInfo =
    aiStatus === 'idle'
      ? { text: 'AI 待命', dot: 'bg-[#c0b4a4]' }
      : aiStatus === 'watching'
        ? { text: 'AI 观察画面', dot: 'bg-[#a66a3a] pulse-dot' }
        : { text: 'AI 聆听语音', dot: 'bg-[#8ab4d4] pulse-dot' };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 顶栏：参考稿 navbar 风格 */}
      <header className="sticky top-0 z-30 border-b border-[#e6dfd2] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
          {isLive || isSaving || isCountdown ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#b56a3a] px-2.5 py-1 text-[11px] font-bold tracking-[1px] text-white">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e6dfd2] bg-white px-2.5 py-1 text-[11px] font-bold text-[#9c8e80]">
              准备中
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[15px] font-bold text-[#2c2422]">
              {config.topic || '自由模拟直播'}
            </p>
            <p className="hidden truncate text-[11px] text-[#9c8e80] sm:block">
              LiveCoach · {task?.name ?? '自由任务'}
              {config.studentName ? ` · ${config.studentName}` : ''}
            </p>
          </div>
          {/* AI 状态（参考稿状态点风格） */}
          <span
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] sm:inline-flex ${
              aiStatus === 'idle'
                ? 'bg-[#f0ebe7] text-[#9c8e80]'
                : 'bg-[#f3e7d5] text-[#7a5230]'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
            {statusInfo.text}
            <span className="font-mono text-[10px] opacity-70">
              {counts.vision}/{counts.speech}
            </span>
          </span>
          {/* 时间码 */}
          <span className="rounded-full border border-[#e6dfd2] bg-white px-3 py-1 font-mono text-sm font-bold tabular-nums text-[#a66a3a]">
            {fmtClock(elapsedSec)}
          </span>
          {/* 音量电平 */}
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#f1ebe0] sm:block">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8ab89a] to-[#a66a3a] transition-[width] duration-100"
              style={{ width: `${Math.min(audioState.level * 160, 100)}%` }}
            />
          </div>
          {(isLive || isSaving) && (
            <button
              onClick={() => {
                if (isLive && window.confirm('确定结束本次模拟直播并生成复盘吗？')) void endLive();
              }}
              disabled={isSaving}
              className="shrink-0 rounded-full border border-[#e5c5a3] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#b56a3a] transition-colors hover:bg-[#f7efe2] disabled:opacity-50 sm:px-4"
            >
              {isSaving ? '处理中…' : '结束直播'}
            </button>
          )}
        </div>
      </header>

      {/* 主体：参考稿 main-grid（左视频面板 sticky + 右数据列） */}
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* 左：视频面板卡片 */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-[72px]">
            <div className="overflow-hidden rounded-2xl border border-[#e6dfd2] bg-white shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
              {/* 面板头 */}
              <div className="flex items-center justify-between border-b border-[#f1ebdf] px-4 py-2.5">
                <h3 className="flex items-center gap-2 font-serif text-[14px] font-bold tracking-[0.5px] text-[#2c2422]">
                  <MonitorIcon className="h-4 w-4 text-[#a66a3a]" />
                  直播监视器
                </h3>
                <div className="flex items-center gap-2">
                  {isLive && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7efe2] px-2 py-0.5 text-[11px] font-bold text-[#b56a3a]">
                      <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#b56a3a]" />
                      模拟直播中
                    </span>
                  )}
                  <span className="font-mono text-xs tabular-nums text-[#9c8e80]">
                    REC {fmtClock(elapsedSec)}
                  </span>
                </div>
              </div>

              {/* 视频区 */}
              <div className="relative w-full bg-[#1c1817]" style={{ aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />

                {/* 设备阶段 overlay：加载 / 错误 */}
                {isDevice && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1c1817]/80 p-6 backdrop-blur-sm">
                    {cameraError ? (
                      <div className="max-w-md text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3e7d5]">
                          <MonitorIcon className="h-6 w-6 text-[#a66a3a]" />
                        </div>
                        <h2 className="font-serif text-lg font-bold text-white">
                          摄像头 / 麦克风不可用
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-[#d9cfca]">{cameraError}</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                          <button
                            onClick={() => window.location.reload()}
                            className="rounded-full bg-[#a66a3a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#8f5630]"
                          >
                            重新连接
                          </button>
                          <button
                            onClick={abort}
                            className="rounded-full border border-white/25 px-5 py-2.5 text-sm text-[#e8dfd9] transition-colors hover:border-white/50"
                          >
                            返回准备页
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-lg text-center">
                        <span className="spinner mx-auto mb-3 block h-8 w-8 rounded-full border-2 border-[#e3c4a3] border-t-transparent" />
                        <h2 className="font-serif text-lg font-bold text-white">
                          正在连接摄像头与麦克风…
                        </h2>
                        <p className="mt-2 text-sm text-[#d9cfca]">
                          请允许浏览器使用摄像头与麦克风权限
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 倒计时 */}
                {isCountdown && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1c1817]/55 backdrop-blur-sm">
                    <span
                      key={countdown}
                      className="count-pulse font-mono text-[72px] font-black leading-none text-[#e3c4a3] sm:text-[116px]"
                    >
                      {countdown > 0 ? countdown : 'GO'}
                    </span>
                  </div>
                )}

                {/* LIVE 状态灯（画面左上角） */}
                {(isLive || isSaving) && (
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 backdrop-blur-sm">
                    <span className="live-dot inline-flex h-2 w-2 rounded-full bg-[#d18a4e]" />
                    <span className="text-xs font-bold text-white/90">模拟直播中</span>
                  </div>
                )}

                {/* 字幕式提醒 */}
                {isLive && latestReminder && (
                  <div
                    key={`${latestReminder.atSec}-${latestReminder.message}`}
                    className="subtitle-enter pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4 sm:bottom-5 sm:px-6"
                  >
                    <div className="flex max-w-full items-center gap-2 rounded-full bg-white/92 px-4 py-2 text-xs font-medium text-[#7a5230] shadow-[0_6px_24px_rgba(0,0,0,0.25)] backdrop-blur-md sm:px-5 sm:py-2.5 sm:text-sm">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a66a3a]" />
                      <span className="truncate">{latestReminder.message}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 状态栏：状态点 + 端侧视觉 + 当前环节 + 音量 */}
              <div className="flex items-center gap-3 border-t border-[#f1ebdf] bg-white px-4 py-2.5 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-[#6e625e]">
                  <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                  {statusInfo.text}
                </span>
                <FaceStatusChips faceState={faceState} />
                <span className="hidden text-[#9c8e80] sm:inline">·</span>
                <span className="hidden min-w-0 truncate text-[#9c8e80] sm:inline">
                  当前环节：{isLive || isSaving || isEnded ? currentLabel || '识别中' : '待开播'}
                </span>
                <span className="ml-auto flex items-center gap-2 text-[#9c8e80]">
                  <span className="hidden sm:inline">音量</span>
                  <span className="block h-1 w-14 overflow-hidden rounded-full bg-[#f1ebe0]">
                    <span
                      className="block h-full rounded-full bg-[#a66a3a] transition-[width] duration-100"
                      style={{ width: `${Math.min(audioState.level * 160, 100)}%` }}
                    />
                  </span>
                </span>
              </div>
            </div>

            {/* 设备就绪面板（不遮挡画面，作为下方信息卡） */}
            {isDevice && cameraReady && (
              <div className="mt-3 rounded-2xl border border-[#e6dfd2] bg-white p-4 shadow-[0_2px_16px_rgba(44,36,34,0.06)] sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-[15px] font-bold text-[#2c2422]">
                      设备就绪，随时可以开播
                    </h2>
                    <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 text-[12.5px] text-[#6e625e] sm:grid-cols-2">
                      {cfgSummary.map(([k, v]) => (
                        <p key={k} className="truncate">
                          <span className="text-[#9c8e80]">{k}：</span>
                          {v}
                        </p>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={beginCountdown}
                    className="pulse-ring w-full shrink-0 rounded-full bg-[#a66a3a] px-8 py-3 text-[15px] font-medium tracking-[0.5px] text-white shadow-[0_6px_20px_rgba(166,106,58,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#8f5630] hover:shadow-[0_8px_28px_rgba(166,106,58,0.45)] sm:w-auto"
                  >
                    开始直播
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右：数据列 */}
        <aside className="flex min-w-0 flex-col gap-4">
          {/* 移动端 tab 切换（指标 tab 收纳评分环与八维条） */}
          <div className="flex gap-1.5 lg:hidden">
            {(
              [
                ['coach', 'AI 教练'],
                ['stage', '流程陪练'],
                ['metrics', '数据指标'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`flex-1 rounded-full py-2 text-[13px] font-medium transition-colors ${
                  activeTab === k
                    ? 'bg-[#a66a3a] text-white shadow-[0_2px_10px_rgba(166,106,58,0.3)]'
                    : 'border border-[#e6dfd2] bg-white text-[#6e625e]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 综合评分环 + 维度分析：移动端归入「数据指标」tab，lg 起常驻 */}
          <div
            className={`flex-col gap-4 ${
              activeTab === 'metrics' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="rounded-2xl border border-[#e6dfd2] bg-white p-4 shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
              <div className="flex items-center gap-4">
                <ScoreRing value={metricsSnap.overall} />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[15px] font-bold text-[#2c2422]">实时综合评分</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#6e625e]">
                    {gradeText(metricsSnap.overall)}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <span className="rounded-full bg-[#f0ebe7] px-2.5 py-1 text-[11px] text-[#6e625e]">
                      提醒 {reminders.length} 条
                    </span>
                    <span className="rounded-full bg-[#f0ebe7] px-2.5 py-1 text-[11px] text-[#6e625e]">
                      环节 {stages.filter((st) => st.completed).length}/{stages.length || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 维度分析（仅直播中显示实时条） */}
            {(isLive || isEnded || isSaving) && (
              <div className="rounded-2xl border border-[#e6dfd2] bg-white shadow-[0_2px_16px_rgba(44,36,34,0.06)]">
                <CardHead icon={GaugeIcon} title="维度分析" />
                <div className="p-4 pt-3">
                  <MetricsStrip snap={metricsSnap} />
                </div>
              </div>
            )}
          </div>

          {/* AI 提醒流 */}
          <div
            className={`flex min-h-[240px] flex-col rounded-2xl border border-[#e6dfd2] bg-white shadow-[0_2px_16px_rgba(44,36,34,0.06)] lg:min-h-[220px] ${
              activeTab === 'coach' ? '' : 'hidden lg:flex'
            }`}
          >
            <CardHead
              icon={SparklesIcon}
              title="AI 教练提醒"
              badge={
                <span className="rounded-full bg-[#f3e7d5] px-2 py-0.5 text-[11px] font-medium text-[#7a5230]">
                  {reminders.length} 条
                </span>
              }
            />
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <ReminderFeed reminders={reminders} coachNotes={coachNotes} welcomeText={welcomeText} />
            </div>
          </div>

          {/* 流程陪练 */}
          <div
            className={`flex min-h-[240px] flex-col rounded-2xl border border-[#e6dfd2] bg-white shadow-[0_2px_16px_rgba(44,36,34,0.06)] lg:min-h-[260px] ${
              activeTab === 'stage' ? '' : 'hidden lg:flex'
            }`}
          >
            <CardHead
              icon={RouteIcon}
              title="直播流程陪练"
              badge={
                <span className="text-[11px] text-[#8ab4d4]">
                  {isLive || isSaving || isEnded ? (currentLabel ? `当前：${currentLabel}` : '待识别环节') : '待开播'}
                </span>
              }
            />
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-3">
              <StagePanel stages={stages} currentLabel={currentLabel} />
              {/* 话术关键词提示（培养自主表达，不做全文提词器） */}
              {config.script && (
                <div className="mt-3 rounded-xl border border-[#e6dfd2] bg-[#faf7f1] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#7a5230]">
                    <ListIcon className="h-3.5 w-3.5" />
                    话术关键词（忘词时参考，AI 只给关键词）
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#6e625e]">
                    {config.script.slice(0, 120)}
                    {config.script.length > 120 ? '…' : ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 结束保存遮罩 */}
      {isSaving && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#faf6ef]/90 backdrop-blur-md">
          <span className="spinner mb-4 block h-10 w-10 rounded-full border-[3px] border-[#a66a3a] border-t-transparent" />
          <h2 className="font-serif text-lg font-bold text-[#2c2422]">正在生成本场直播复盘…</h2>
          <p className="mt-2 text-sm text-[#6e625e]">
            AI 教练正在汇总本场表现数据并撰写训练总结
          </p>
          {saveError && (
            <div className="mt-4 rounded-full bg-[#f7efe2] px-4 py-2 text-sm text-[#b56a3a]">
              {saveError}
              <button
                onClick={() => void endLive()}
                className="ml-3 rounded-full bg-[#a66a3a] px-3 py-1 text-xs font-medium text-white"
              >
                重试
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LivePage() {
  const [config, setConfig] = useState<TrainingConfig | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('livecoach-config');
      if (raw) {
        setConfig(JSON.parse(raw) as TrainingConfig);
      } else {
        setMissing(true);
      }
    } catch {
      setMissing(true);
    }
  }, []);

  if (missing) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3e7d5]">
          <MonitorIcon className="h-7 w-7 text-[#a66a3a]" />
        </div>
        <h1 className="font-serif text-xl font-bold text-[#2c2422]">还没有直播训练配置</h1>
        <p className="text-sm text-[#6e625e]">请先完成直播准备，再进入直播间</p>
        <a
          href="/setup"
          className="rounded-full bg-[#a66a3a] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#8f5630]"
        >
          去直播准备
        </a>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="spinner h-8 w-8 rounded-full border-2 border-[#a66a3a] border-t-transparent" />
      </div>
    );
  }

  return <LiveRoom config={config} />;
}
