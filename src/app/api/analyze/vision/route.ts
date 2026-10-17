/**
 * 视觉帧分析接口
 * 前端每 ~6 秒截取一帧摄像头画面（JPEG dataUri），POST 到此接口。
 * 后端调用多模态 LLM 做视觉观察 + 提醒决策 + 流程判断，返回结构化 JSON。
 */

import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, HeaderUtils } from 'coze-coding-dev-sdk';
import {
  buildVisionSystemPrompt,
  buildVisionUserPrompt,
  parseJsonSafe,
  normalizeReminderType,
} from '@/lib/server/coach-prompts';
import { decodeDataUriImage, MIN_IMAGE_DIMENSION } from '@/lib/server/image-meta';
import type {
  AnalyzeContext,
  VisionAnalysisResponse,
  VisionResult,
} from '@/lib/types';

export const maxDuration = 60;

interface LLMVisionOutput {
  vision?: Partial<VisionResult> & {
    scores?: Partial<VisionResult['scores']>;
  };
  reminders?: Array<{ type?: string; message?: string; priority?: number }>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      image?: string;
      ctx?: AnalyzeContext;
      isFirstCheck?: boolean;
    };

    if (!body.image || !body.ctx) {
      return NextResponse.json(
        { ok: false, error: '缺少 image 或 ctx 参数' },
        { status: 400 }
      );
    }
    // 校验 dataUri 是图片
    if (!body.image.startsWith('data:image/')) {
      return NextResponse.json(
        { ok: false, error: 'image 必须是图片 dataUri' },
        { status: 400 }
      );
    }

    // 校验图片最小尺寸（上游多模态模型要求 >= 14px），解析失败时放行、由上游兜底报错
    const dims = decodeDataUriImage(body.image);
    if (dims && (dims.width < MIN_IMAGE_DIMENSION || dims.height < MIN_IMAGE_DIMENSION)) {
      return NextResponse.json(
        {
          ok: false,
          error: `图片过小（${dims.width}x${dims.height}），需至少 ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION} 像素`,
        },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new LLMClient(undefined, customHeaders);

    const messages = [
      { role: 'system' as const, content: buildVisionSystemPrompt(body.ctx.coachStyle) },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: buildVisionUserPrompt({
              ctx: body.ctx,
              isFirstCheck: Boolean(body.isFirstCheck),
            }),
          },
          { type: 'image_url' as const, image_url: { url: body.image, detail: 'low' as const } },
        ],
      },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-mini-260215',
      temperature: 0.3,
    });
    const parsed = parseJsonSafe<LLMVisionOutput>(response.content);

    if (!parsed || !parsed.vision) {
      return NextResponse.json(
        { ok: false, error: 'AI 分析结果解析失败' },
        { status: 502 }
      );
    }

    const v = parsed.vision;
    const oneOf = <T extends string>(val: unknown, opts: readonly T[], def: T): T =>
      opts.includes(val as T) ? (val as T) : def;
    const num = (val: unknown, def: number): number =>
      typeof val === 'number' && val >= 0 && val <= 100 ? Math.round(val) : def;

    const vision: VisionResult = {
      smile: oneOf(v.smile, ['good', 'neutral', 'poor'] as const, 'neutral'),
      expression: oneOf(v.expression, ['natural', 'stiff', 'flat'] as const, 'natural'),
      distance: oneOf(v.distance, ['ok', 'too_close', 'too_far'] as const, 'ok'),
      headTilt: oneOf(v.headTilt, ['ok', 'slight', 'obvious'] as const, 'ok'),
      headDown: Boolean(v.headDown),
      lookingAtCamera: oneOf(v.lookingAtCamera, ['yes', 'sometimes', 'no'] as const, 'yes'),
      bodyPosture: oneOf(v.bodyPosture, ['upright', 'slouching', 'leaning'] as const, 'upright'),
      framePosition: oneOf(v.framePosition, ['center', 'off_center'] as const, 'center'),
      movement: oneOf(v.movement, ['stable', 'swaying'] as const, 'stable'),
      energy: oneOf(v.energy, ['high', 'normal', 'low'] as const, 'normal'),
      scores: {
        cameraPresence: num(v.scores?.cameraPresence, 75),
        expression: num(v.scores?.expression, 75),
        posture: num(v.scores?.posture, 75),
      },
      level: oneOf(v.level, ['ok', 'warn', 'alert'] as const, 'ok'),
    };

    const reminders = (parsed.reminders ?? [])
      .map((r) => {
        const type = typeof r.type === 'string' ? normalizeReminderType(r.type) : null;
        const message = typeof r.message === 'string' ? r.message.trim().slice(0, 40) : '';
        if (!type || !message) return null;
        return { type, message, priority: r.priority === 1 ? 1 : r.priority === 3 ? 3 : 2 };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 2);

    // 视觉链路不判定直播环节：仅凭画面与元信息无法证明环节，判定会退化为
    // 复述 ctx.currentStage（matchedIndex 恒为当前环节）造成流程自锁；
    // 环节推进由语音链路（有 ASR 转写内容信号）唯一驱动。
    const res: VisionAnalysisResponse = { ok: true, vision, reminders };
    return NextResponse.json(res);
  } catch (err) {
    console.error('[vision] 分析失败:', err);
    return NextResponse.json(
      { ok: false, error: '视觉分析服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
