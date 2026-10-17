/**
 * 保存训练记录接口（快速落库，不调用 LLM）
 * POST /api/session/save
 * 前端直播结束时提交整场数据 → 服务端本地计算指标与统计 → 写入 Supabase → 返回记录 id。
 * AI 复盘由前端在复盘页触发 POST /api/session/[id]/review 生成。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type {
  LearnerProfile,
  MetricKey,
  MetricSample,
  Reminder,
  LiveStage,
  SpeechSegmentRecord,
  VisionCheckRecord,
  LearnerProfileSnapshot,
  CoachStyle,
  MetricKey as MK,
} from '@/lib/types';
import { METRIC_KEYS } from '@/lib/types';

export const maxDuration = 30;

const COACH_STYLES: readonly CoachStyle[] = ['professional', 'encouraging', 'strict', 'sassy'];

/** 学员画像快照（随记录落库，复盘页与 AI 复盘生成使用） */
interface LearnerProfileInput {
  coachStyle?: string;
  learner?: Partial<LearnerProfile> | null;
  focusMetrics?: string[];
}

function normalizeLearnerProfile(raw: LearnerProfileInput | undefined): LearnerProfileSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const style = COACH_STYLES.includes(raw.coachStyle as CoachStyle)
    ? (raw.coachStyle as CoachStyle)
    : 'professional';
  const learner = raw.learner ?? {};
  const focus = Array.isArray(raw.focusMetrics)
    ? raw.focusMetrics.filter((k): k is MK => METRIC_KEYS.includes(k as MK)).slice(0, 2)
    : [];
  return {
    coachStyle: style,
    learner: {
      name: typeof learner.name === 'string' ? learner.name.slice(0, 20) : '',
      background: typeof learner.background === 'string' ? learner.background.slice(0, 30) : '',
      experience:
        learner.experience === 0 || learner.experience === 1 || learner.experience === 2
          ? learner.experience
          : 0,
      goal: typeof learner.goal === 'string' ? learner.goal.slice(0, 30) : '',
      selfNote: typeof learner.selfNote === 'string' ? learner.selfNote.slice(0, 80) : '',
    },
    focusMetrics: focus,
  };
}

interface SavePayload {
  studentName?: string;
  taskType?: string;
  topic?: string;
  product?: string;
  persona?: string;
  audience?: string;
  outline?: string;
  script?: string;
  durationSec?: number;
  metrics?: Partial<Record<MetricKey, number>>;
  /** 前端引擎整场时间加权综合分（口径与实时仪表盘一致，优先于服务端简单平均） */
  overall?: number;
  metricSamples?: MetricSample[];
  reminders?: Reminder[];
  stageTimeline?: LiveStage[];
  speechSegments?: SpeechSegmentRecord[];
  visionChecks?: VisionCheckRecord[];
  learnerProfile?: LearnerProfileInput;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SavePayload;

    const durationSec = Math.max(0, Math.round(body.durationSec ?? 0));
    if (durationSec < 5) {
      return NextResponse.json(
        { ok: false, error: '直播时长过短，不计入训练记录' },
        { status: 400 }
      );
    }

    // ── 基础指标：前端引擎的终值 ──
    const metrics = METRIC_KEYS.reduce(
      (acc, k) => {
        const v = body.metrics?.[k];
        acc[k] = typeof v === 'number' ? Math.min(100, Math.max(0, Math.round(v))) : 75;
        return acc;
      },
      {} as Record<MetricKey, number>
    );

    const reminders = (body.reminders ?? [])
      .filter((r) => r && typeof r.message === 'string' && r.message)
      .map((r) => ({ ...r, type: r.type ?? 'content' }));
    const reminderStats = reminders.reduce<Record<string, number>>((acc, r) => {
      const key = r.type ?? 'content';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    // 优先采用前端引擎的整场时间加权综合分（结束前突击无法拉高总分），
    // 缺失或非法时退回简单平均兜底
    const overallScore =
      typeof body.overall === 'number' && body.overall >= 0 && body.overall <= 100
        ? Math.round(body.overall)
        : Math.round(METRIC_KEYS.reduce((a, k) => a + metrics[k], 0) / METRIC_KEYS.length);

    // ── 写入 Supabase ──
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('training_sessions')
      .insert({
        student_name: body.studentName?.slice(0, 30) || null,
        task_type: body.taskType?.slice(0, 30) || 'free',
        topic: body.topic?.slice(0, 200) || null,
        product: body.product?.slice(0, 500) || null,
        persona: body.persona?.slice(0, 200) || null,
        audience: body.audience?.slice(0, 200) || null,
        outline: body.outline?.slice(0, 4000) || null,
        script: body.script?.slice(0, 8000) || null,
        duration_sec: durationSec,
        overall_score: overallScore,
        metrics,
        summary: null,
        reminders: reminders.slice(0, 300),
        reminder_stats: reminderStats,
        stage_timeline: (body.stageTimeline ?? []).slice(0, 30),
        speech_segments: (body.speechSegments ?? []).slice(0, 200),
        vision_checks: (body.visionChecks ?? []).slice(0, 400),
        metric_samples: (body.metricSamples ?? [])
          .filter((s) => typeof s?.atSec === 'number' && typeof s?.overall === 'number')
          .slice(0, 400),
        learner_profile: normalizeLearnerProfile(body.learnerProfile),
        status: 'completed',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[session/save] 数据库写入失败:', error);
      return NextResponse.json(
        { ok: false, error: '训练记录保存失败，请重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('[session/save] 保存失败:', err);
    return NextResponse.json(
      { ok: false, error: '保存服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
