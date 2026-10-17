'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardList,
  Video,
  ListOrdered,
  FileText,
  Check,
  ArrowRight,
  ShieldCheck,
  UserRound,
  Sparkles,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { TaskIcon } from '@/components/task-icon';
import {
  TASK_PRESETS,
  getTaskPreset,
  COACH_STYLE_META,
  BACKGROUND_OPTIONS,
  GOAL_OPTIONS,
  EXPERIENCE_LEVELS,
  normalizeConfig,
  loadStoredProfile,
  saveStoredProfile,
} from '@/lib/session-config';
import { METRIC_LABELS, METRIC_KEYS } from '@/lib/types';
import type { TrainingConfig, MetricKey, LearnerProfile } from '@/lib/types';

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTask = searchParams.get('task') ?? 'product_intro';

  const [taskType, setTaskType] = useState(initialTask);
  const [form, setForm] = useState<TrainingConfig>(() => {
    const p = getTaskPreset(initialTask) ?? TASK_PRESETS[0];
    const stored = loadStoredProfile();
    return normalizeConfig({
      taskType: p.id,
      topic: p.defaultTopic,
      product: p.defaultProduct,
      persona: p.defaultPersona,
      audience: p.defaultAudience,
      outline: p.defaultOutline,
      script: p.defaultScript,
      studentName: stored.learner.name,
      coachStyle: stored.coachStyle,
      learner: stored.learner,
      focusMetrics: stored.focusMetrics,
    });
  });

  /** 切换任务类型时填充对应示例 */
  const applyPreset = (id: string) => {
    const p = getTaskPreset(id);
    setTaskType(id);
    if (!p) return;
    setForm((f) => ({
      ...f,
      taskType: p.id,
      topic: p.defaultTopic,
      product: p.defaultProduct,
      persona: p.defaultPersona,
      audience: p.defaultAudience,
      outline: p.defaultOutline,
      script: p.defaultScript,
    }));
  };

  useEffect(() => {
    const q = searchParams.get('task');
    if (q && q !== taskType) applyPreset(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const outlineStages = useMemo(
    () => form.outline.split('\n').map((s) => s.trim()).filter(Boolean),
    [form.outline]
  );

  const set = (key: keyof TrainingConfig) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const setLearner = (patch: Partial<LearnerProfile>) =>
    setForm((f) => ({ ...f, learner: { ...f.learner, ...patch } }));

  const toggleFocus = (key: MetricKey) =>
    setForm((f) => {
      const has = f.focusMetrics.includes(key);
      if (has) return { ...f, focusMetrics: f.focusMetrics.filter((k) => k !== key) };
      if (f.focusMetrics.length >= 2) return f;
      return { ...f, focusMetrics: [...f.focusMetrics, key] };
    });

  const startLive = () => {
    const cfg: TrainingConfig = {
      ...form,
      studentName: form.learner.name || form.studentName,
    };
    sessionStorage.setItem('livecoach-config', JSON.stringify(cfg));
    saveStoredProfile({
      learner: cfg.learner,
      coachStyle: cfg.coachStyle,
      focusMetrics: cfg.focusMetrics,
    });
    router.push('/live');
  };

  const [profileHint] = useState(() => {
    const g = loadStoredProfile().growth;
    if (!g || g.sessions === 0) return '首次见面：这是你的第一场训练，教练会从零开始陪你。';
    const weak = g.weakMetrics.map((k) => METRIC_LABELS[k]).join('、') || '暂无';
    const trend = g.lastOveralls.length >= 2 ? `近两场 ${g.lastOveralls[1]}→${g.lastOveralls[0]} 分` : `上次 ${g.lastOveralls[0] ?? '-'} 分`;
    return `已记住你：完成 ${g.sessions} 场训练，${trend}，上次弱项 ${weak}。开场教练会主动提起。`;
  });

  const inputCls =
    'w-full rounded-xl border border-[#e6dfd2] bg-white px-3.5 py-2.5 text-base text-[#2c2422] placeholder:text-[#c0b4a4] outline-none transition-all focus:border-[#a66a3a] focus:ring-2 focus:ring-[#a66a3a]/15 sm:text-sm';
  const labelCls = 'mb-1.5 block text-[13px] font-medium text-[#6e625e]';

  /** 参考稿 card：图标 + 标题的卡片头 */
  const CardHead = ({
    icon: Icon,
    title,
    hint,
  }: {
    icon: typeof Video;
    title: string;
    hint?: string;
  }) => (
    <div className="mb-4 flex items-center justify-between border-b border-[#f1ebdf] pb-3">
      <h2 className="flex items-center gap-2 font-serif text-[14px] font-bold tracking-[0.5px] text-[#2c2422]">
        <Icon className="h-4 w-4 text-[#a66a3a]" strokeWidth={1.7} />
        {title}
      </h2>
      {hint && <span className="text-[11px] text-[#9c8e80]">{hint}</span>}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* 左：配置表单 */}
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:p-6">
          <CardHead icon={ClipboardList} title="训练任务" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {TASK_PRESETS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyPreset(t.id)}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  taskType === t.id
                    ? 'border-[#a66a3a] bg-[#f3e7d5] shadow-[0_2px_12px_rgba(166,106,58,0.18)]'
                    : 'border-[#e6dfd2] bg-white hover:border-[#c0b4a4]'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    taskType === t.id ? 'bg-white' : 'bg-[#f0ebe7]'
                  }`}
                >
                  <TaskIcon
                    taskId={t.id}
                    className={`h-4 w-4 ${taskType === t.id ? 'text-[#a66a3a]' : 'text-[#9c8e80]'}`}
                  />
                </span>
                <span
                  className={`text-[13px] font-medium leading-tight ${
                    taskType === t.id ? 'text-[#7a5230]' : 'text-[#6e625e]'
                  }`}
                >
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:p-6">
          <CardHead icon={Video} title="本次直播信息" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>直播主题</label>
              <input
                className={inputCls}
                placeholder="例如：便携榨汁杯新品直播介绍"
                value={form.topic}
                onChange={set('topic')}
                maxLength={60}
              />
            </div>
            <div>
              <label className={labelCls}>产品或内容</label>
              <input
                className={inputCls}
                placeholder="本次直播介绍什么产品/内容"
                value={form.product}
                onChange={set('product')}
                maxLength={120}
              />
            </div>
            <div>
              <label className={labelCls}>主播身份</label>
              <input
                className={inputCls}
                placeholder="例如：电商专业学生，实习带货主播"
                value={form.persona}
                onChange={set('persona')}
                maxLength={60}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>目标受众</label>
              <input
                className={inputCls}
                placeholder="例如：18-28 岁关注健康饮食的年轻用户"
                value={form.audience}
                onChange={set('audience')}
                maxLength={120}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:p-6">
          <CardHead
            icon={UserRound}
            title="AI 教练定制"
            hint="一对一定制：教练人格按你的画像全程陪练"
          />

          <label className={labelCls}>教练人格</label>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {COACH_STYLE_META.map((c) => {
              const active = form.coachStyle === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, coachStyle: c.value }))}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-[#a66a3a] bg-[#fbf5ea]'
                      : 'border-[#f1ebdf] bg-[#faf7f0] hover:border-[#e3c4a3]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[13px] font-semibold ${
                        active ? 'text-[#7a5230]' : 'text-[#2c2422]'
                      }`}
                    >
                      {c.label}
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        active ? 'border-[#a66a3a] bg-[#a66a3a]' : 'border-[#d8cdc8] bg-white'
                      }`}
                    >
                      {active && <Check className="h-3 w-3 text-white" strokeWidth={2.4} />}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[#9c8e80]">{c.sample}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>怎么称呼你（选填）</label>
              <input
                className={inputCls}
                placeholder="例如：小李同学"
                value={form.learner.name}
                onChange={(e) => setLearner({ name: e.target.value })}
                maxLength={16}
              />
            </div>
            <div>
              <label className={labelCls}>职业背景</label>
              <select
                className={inputCls}
                value={form.learner.background}
                onChange={(e) => setLearner({ background: e.target.value })}
              >
                <option value="">请选择</option>
                {BACKGROUND_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className={labelCls}>直播经验</label>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_LEVELS.map((lv) => {
                const active = form.learner.experience === lv.value;
                return (
                  <button
                    key={lv.value}
                    type="button"
                    onClick={() => setLearner({ experience: lv.value })}
                    className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                      active
                        ? 'border-[#a66a3a] bg-[#f3e7d5] text-[#7a5230]'
                        : 'border-[#e6dfd2] bg-[#faf7f0] text-[#6e625e] hover:border-[#e3c4a3]'
                    }`}
                  >
                    {lv.label}
                    <span className="ml-1 text-[10px] opacity-70">{lv.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <label className={labelCls}>训练目标</label>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((g) => {
                const active = form.learner.goal === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setLearner({ goal: active ? '' : g })}
                    className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                      active
                        ? 'border-[#a66a3a] bg-[#f3e7d5] text-[#7a5230]'
                        : 'border-[#e6dfd2] bg-[#faf7f0] text-[#6e625e] hover:border-[#e3c4a3]'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <label className={labelCls}>一句话介绍自己（选填，教练会据此调整语气）</label>
            <input
              className={inputCls}
              placeholder="例如：我比较内向，一紧张语速就容易变快"
              value={form.learner.selfNote}
              onChange={(e) => setLearner({ selfNote: e.target.value })}
              maxLength={60}
            />
          </div>

          <div className="mt-5">
            <label className={labelCls}>
              本次主攻维度（选 1-2 个，教练会重点关注并加密提醒）
            </label>
            <div className="flex flex-wrap gap-2">
              {METRIC_KEYS.map((k) => {
                const active = form.focusMetrics.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleFocus(k)}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                      active
                        ? 'border-[#a66a3a] bg-[#f3e7d5] text-[#7a5230]'
                        : 'border-[#e6dfd2] bg-[#faf7f0] text-[#6e625e] hover:border-[#e3c4a3]'
                    }`}
                  >
                    {METRIC_LABELS[k]}
                    {active && <Check className="h-3 w-3 text-[#7a5230]" strokeWidth={2.2} />}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-[#faf7f0] px-3 py-2 text-[11px] text-[#9c8e80]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#a66a3a]" strokeWidth={1.6} />
            {profileHint}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:p-6">
          <CardHead
            icon={ListOrdered}
            title="预计直播流程"
            hint="每行一个环节，AI 将按此陪练"
          />
          <textarea
            className={`${inputCls} min-h-[130px] resize-y leading-6`}
            placeholder={'开场问候\n主播自我介绍\n产品介绍\n核心卖点\n互动\n总结'}
            value={form.outline}
            onChange={set('outline')}
            maxLength={1000}
          />
          {outlineStages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {outlineStages.map((s, i) => (
                <span
                  key={`${s}-${i}`}
                  className="rounded-full border border-[#e3c4a3] bg-[#f3e7d5] px-2.5 py-0.5 text-xs text-[#7a5230]"
                >
                  {i + 1}. {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)] sm:p-6">
          <CardHead
            icon={FileText}
            title="直播话术 / 提纲（选填）"
            hint="AI 仅作关键词提示，培养自主表达"
          />
          <textarea
            className={`${inputCls} min-h-[120px] resize-y leading-6`}
            placeholder="写入关键话术与卖点，忘词时 AI 只会给出关键词级提示，不会展示完整话术"
            value={form.script}
            onChange={set('script')}
            maxLength={3000}
          />
        </div>
      </div>

      {/* 右：说明与开始 */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)]">
          <h3 className="flex items-center gap-2 font-serif text-[14px] font-bold tracking-[0.5px] text-[#2c2422]">
            <Check className="h-4 w-4 text-[#8ab89a]" strokeWidth={2} />
            开播前检查清单
          </h3>
          <ul className="mt-3.5 space-y-2.5 text-[13px] leading-relaxed text-[#6e625e]">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ab89a]" />
              建议单人出镜、光线充足、背景整洁
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ab89a]" />
              距离摄像头约 0.5-1 米，人脸居中
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ab89a]" />
              建议每次训练 3-10 分钟
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ab89a]" />
              使用 Chrome / Edge 浏览器效果最佳
            </li>
          </ul>
          <p className="mt-4 flex items-start gap-2 border-t border-[#f1ebdf] pt-3.5 text-xs leading-relaxed text-[#9c8e80]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8ab4d4]" strokeWidth={1.6} />
            画面与声音仅在本机与训练服务之间处理，不做任何身份判断。
          </p>
        </div>

        <div className="rounded-2xl border border-[#e6dfd2] bg-white p-5 shadow-[0_1px_3px_rgba(44,36,34,0.04)]">
          <h3 className="flex items-center gap-2 border-b border-[#f1ebdf] pb-3 font-serif text-[14px] font-bold tracking-[0.5px] text-[#2c2422]">
            <EyeIcon />
            AI 教练会观察什么
          </h3>
          <div className="mt-3.5 grid grid-cols-2 gap-2 text-[12.5px]">
            {[
              '微笑与表情',
              '镜头距离',
              '头部姿态',
              '画面位置',
              '语速与停顿',
              '口头禅',
              '互动意识',
              '流程环节',
              '内容遗漏',
              '精神状态',
            ].map((k) => (
              <span
                key={k}
                className="rounded-lg bg-[#f0ebe7] px-2.5 py-1.5 text-[#6e625e]"
              >
                {k}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#9c8e80]">
            AI 只分析与直播表现和训练有关的外在表现，不做医学、生理、人格或情绪诊断。
          </p>
        </div>

        <button
          onClick={startLive}
          className="pulse-ring group relative hidden w-full items-center justify-center gap-2 rounded-full bg-[#a66a3a] py-4 text-[15px] font-medium tracking-[0.5px] text-white transition-all hover:bg-[#8f5630] hover:shadow-[0_6px_24px_rgba(166,106,58,0.4)] lg:flex"
        >
          进入直播间准备开播
          <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5" />
        </button>
        <p className="hidden text-center text-xs text-[#9c8e80] lg:block">
          未填写的项目将按自由模拟直播处理
        </p>
      </div>

      {/* 移动端底部固定开播条 */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e6dfd2] bg-white/92 px-4 pb-3 pt-3 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={startLive}
          className="group relative flex w-full items-center justify-center gap-2 rounded-full bg-[#a66a3a] py-3.5 text-[15px] font-medium tracking-[0.5px] text-white shadow-[0_4px_16px_rgba(166,106,58,0.35)] transition-all active:bg-[#8f5630]"
        >
          进入直播间准备开播
          <ArrowRight className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-[#a66a3a]"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function SetupPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 lg:pb-8">
        <div className="mb-7">
          <h1 className="font-serif text-[22px] font-bold tracking-[1px] text-[#2c2422] sm:text-[26px]">
            直播准备
          </h1>
          <p className="mt-2 text-[13px] text-[#9c8e80]">
            选择训练任务，填写本次直播的信息与流程。填写越完整，AI 陪练越有针对性。
          </p>
        </div>
        <Suspense fallback={<div className="py-20 text-center text-[#9c8e80]">加载中…</div>}>
          <SetupForm />
        </Suspense>
      </main>
    </div>
  );
}
