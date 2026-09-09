/**
 * AI 复盘生成接口（异步模式）
 * POST /api/session/[id]/review
 * - 若复盘已存在：返回 { ok, ready: true }
 * - 否则立即返回 { ok, started: true }，并用 after() 在响应完成后生成复盘落库
 * 前端通过轮询 GET /api/session/[id] 检查 summary 是否就绪。
 * 生成失败时会写入 { failed: true, message } 占位，前端据此显示重试按钮。
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { LLMClient, HeaderUtils } from 'coze-coding-dev-sdk';
import {
  buildReviewSystemPrompt,
  buildReviewUserPrompt,
  parseJsonSafe,
  normalizeReminderType,
} from '@/lib/server/coach-prompts';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type {
  LearnerProfile,
  MetricKey,
  ReviewReport,
  VisionCheckRecord,
  LearnerProfileSnapshot,
  CoachStyle,
  GrowthProfile,
} from '@/lib/types';
import { METRIC_KEYS } from '@/lib/types';

export const maxDuration = 300;

/** jsonb 存储的视觉抽查记录 → VisionCheckRecord（逐字段窄化，防脏数据） */
function normalizeVisionChecks(
  raw: Array<Record<string, unknown>> | null,
  max: number
): VisionCheckRecord[] {
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return (raw ?? []).slice(0, max).map((v) => ({
    atSec: typeof v.atSec === 'number' ? v.atSec : 0,
    level: pick(v.level, ['ok', 'warn', 'alert'] as const, 'ok'),
    smile: pick(v.smile, ['good', 'neutral', 'poor'] as const, 'neutral'),
    distance: pick(v.distance, ['ok', 'too_close', 'too_far'] as const, 'ok'),
    headTilt: pick(v.headTilt, ['ok', 'slight', 'obvious'] as const, 'ok'),
    lookingAtCamera: pick(v.lookingAtCamera, ['yes', 'sometimes', 'no'] as const, 'yes'),
    energy: pick(v.energy, ['high', 'normal', 'low'] as const, 'normal'),
  }));
}

/** 防重复生成锁（进程级，热更后重置可接受） */
const generating = new Set<string>();

interface LLMReviewOutput extends Omit<ReviewReport, 'radar'> {
  radar?: Partial<Record<MetricKey, number>>;
}

interface SessionRow {
  summary: unknown;
  task_type: string | null;
  topic: string | null;
  outline: string | null;
  duration_sec: number;
  metrics: Record<string, number> | null;
  reminders: Array<{ type?: string; message?: string; atSec?: number }> | null;
  reminder_stats: Record<string, number> | null;
  stage_timeline: Array<{ index: number; name: string; enteredAtSec: number; completed: boolean }> | null;
  speech_segments: Array<{ atSec: number; text: string; speechRate: string; interaction: string }> | null;
  vision_checks: Array<Record<string, unknown>> | null;
  learner_profile: LearnerProfileSnapshot | null;
}

/** 生成复盘并落库；返回是否成功 */
async function generateReview(
  id: string,
  row: SessionRow,
  forwardHeaders: Record<string, string>,
  growth: GrowthProfile | null
): Promise<boolean> {
  const db = getSupabaseClient();
  try {
    const metrics = METRIC_KEYS.reduce(
      (acc, k) => {
        const v = row.metrics?.[k];
        acc[k] = typeof v === 'number' ? Math.min(100, Math.max(0, Math.round(v))) : 75;
        return acc;
      },
      {} as Record<MetricKey, number>
    );
    const reminderStats = row.reminder_stats ?? {};

    const client = new LLMClient(undefined, forwardHeaders);
    const coachStyle = (row.learner_profile?.coachStyle ?? 'professional') as CoachStyle;
    const response = await client.invoke(
      [
        { role: 'system' as const, content: buildReviewSystemPrompt(coachStyle) },
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: buildReviewUserPrompt({
                topic: row.topic ?? '',
                taskType: row.task_type ?? '',
                outline: row.outline ?? '',
                durationSec: row.duration_sec ?? 0,
                metrics,
                reminderStats,
                learner: row.learner_profile?.learner ?? null,
                focusMetrics: (row.learner_profile?.focusMetrics ?? []) as MetricKey[],
                growth,
                stageTimeline: (row.stage_timeline ?? []).slice(0, 20),
                visionChecks: normalizeVisionChecks(row.vision_checks, 120),
                speechSegments: (row.speech_segments ?? []).slice(0, 40),
                reminders: (row.reminders ?? [])
                  .slice(0, 80)
                  .filter((r) => typeof r?.message === 'string')
                  .map((r) => ({
                    type: r.type ?? 'content',
                    message: r.message ?? '',
                    atSec: typeof r.atSec === 'number' ? r.atSec : 0,
                  })),
              }),
            },
          ],
        },
      ],
      { model: 'doubao-seed-2-0-lite-260215', temperature: 0.5 }
    );

    const parsed = parseJsonSafe<LLMReviewOutput>(response.content);
    if (!parsed) {
      throw new Error('复盘结果解析失败');
    }

    const radar = METRIC_KEYS.reduce(
      (acc, k) => {
        const v = parsed.radar?.[k];
        acc[k] = typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v) : metrics[k];
        return acc;
      },
      {} as Record<MetricKey, number>
    );

    const summary: ReviewReport = {
      overall:
        typeof parsed.overall === 'string'
          ? parsed.overall
          : '本场直播已完成，请查看详细数据。',
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.filter((s) => typeof s === 'string').slice(0, 5)
        : [],
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.filter((s) => typeof s === 'string').slice(0, 5)
        : [],
      topIssues: Array.isArray(parsed.topIssues)
        ? parsed.topIssues
            .filter((t) => t && typeof t.type === 'string')
            .map((t) => ({
              type: normalizeReminderType(t.type) ?? 'content',
              count: typeof t.count === 'number' ? t.count : 1,
              advice: typeof t.advice === 'string' ? t.advice : '',
            }))
            .slice(0, 6)
        : [],
      stageReview: typeof parsed.stageReview === 'string' ? parsed.stageReview : '',
      expressionReview:
        typeof parsed.expressionReview === 'string' ? parsed.expressionReview : '',
      cameraReview: typeof parsed.cameraReview === 'string' ? parsed.cameraReview : '',
      interactionReview:
        typeof parsed.interactionReview === 'string' ? parsed.interactionReview : '',
      nextAdvice: Array.isArray(parsed.nextAdvice)
        ? parsed.nextAdvice.filter((s) => typeof s === 'string').slice(0, 6)
        : [],
      radar,
    };

    // 用 AI 调整后的 radar 校准总分
    const adjustedScore = Math.round(
      METRIC_KEYS.reduce((a, k) => a + radar[k], 0) / METRIC_KEYS.length
    );
    const { error: updateErr } = await db
      .from('training_sessions')
      .update({ summary, overall_score: adjustedScore })
      .eq('id', id);
    if (updateErr) console.error('[session/review] 复盘写回失败:', updateErr);
    return !updateErr;
  } catch (err) {
    console.error('[session/review] 复盘生成失败:', err);
    // 写入失败占位，前端据此提供重试入口
    await db
      .from('training_sessions')
      .update({
        summary: { failed: true, message: '复盘生成失败，请点击重试' },
      })
      .eq('id', id);
    return false;
  } finally {
    generating.delete(id);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: '缺少记录 id' }, { status: 400 });
    }

    const db = getSupabaseClient();
    const { data: row, error: fetchErr } = await db
      .from('training_sessions')
      .select(
        'summary, task_type, topic, outline, duration_sec, metrics, reminders, reminder_stats, stage_timeline, speech_segments, vision_checks, learner_profile'
      )
      .eq('id', id)
      .single<SessionRow>();

    if (fetchErr || !row) {
      console.error('[session/review] 记录读取失败:', fetchErr);
      return NextResponse.json({ ok: false, error: '训练记录不存在' }, { status: 404 });
    }

    // 已有有效复盘（非失败占位）则直接告知就绪
    if (row.summary && !(row.summary as { failed?: boolean }).failed) {
      return NextResponse.json({ ok: true, ready: true });
    }

    const forwardHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const syncMode = request.nextUrl.searchParams.get('mode') === 'sync';

    // 前端随请求上报本地成长档案（localStorage），供复盘做跨场次对比
    let growth: GrowthProfile | null = null;
    try {
      const body = (await request.json().catch(() => null)) as { growth?: unknown } | null;
      if (body && body.growth && typeof body.growth === 'object') {
        const g = body.growth as Partial<GrowthProfile>;
        growth = {
          sessions: typeof g.sessions === 'number' ? g.sessions : 0,
          weakMetrics: Array.isArray(g.weakMetrics) ? g.weakMetrics : [],
          improvedMetrics: Array.isArray(g.improvedMetrics) ? g.improvedMetrics : [],
          lastOveralls: Array.isArray(g.lastOveralls) ? g.lastOveralls : [],
          note: typeof g.note === 'string' ? g.note.slice(0, 200) : '',
          updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : '',
        };
      }
    } catch {
      growth = null;
    }

    // 同步模式：必须等待真实生成结果，绕过 after() 锁直接串行生成
    if (syncMode) {
      const okResult = await generateReview(id, row, forwardHeaders, growth);
      return NextResponse.json({ ok: true, ready: okResult });
    }

    if (generating.has(id)) {
      return NextResponse.json({ ok: true, started: true });
    }
    generating.add(id);

    after(() => {
      void generateReview(id, row, forwardHeaders, growth);
    });

    return NextResponse.json({ ok: true, started: true });
  } catch (err) {
    console.error('[session/review] 触发复盘失败:', err);
    return NextResponse.json(
      { ok: false, error: '复盘触发服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
