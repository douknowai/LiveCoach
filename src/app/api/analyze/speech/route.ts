/**
 * 语音片段分析接口
 * 前端每 ~20 秒发送一段 WAV 音频（base64），POST 到此接口。
 * 后端先 ASR 转写，再调用 LLM 分析语速/口头禅/互动/流程，返回结构化 JSON。
 */

import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import {
  buildSpeechSystemPrompt,
  buildSpeechUserPrompt,
  parseJsonSafe,
  normalizeReminderType,
} from '@/lib/server/coach-prompts';
import type {
  AnalyzeContext,
  SpeechAnalysisResponse,
  SpeechResult,
  StageJudgement,
} from '@/lib/types';

export const maxDuration = 60;

interface LLMOutput {
  speech?: {
    transcript?: string;
    speechRate?: string;
    fillerWords?: Array<{ word?: string; count?: number } | string>;
    interaction?: string;
    onTopic?: boolean;
    energy?: string;
    scores?: Partial<SpeechResult['scores']>;
    level?: string;
  };
  reminders?: Array<{ type?: string; message?: string; priority?: number }>;
  stage?: Partial<StageJudgement>;
}

function oneOf<T extends string>(val: unknown, opts: readonly T[], def: T): T {
  return opts.includes(val as T) ? (val as T) : def;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      audio?: string;
      durationMs?: number;
      ctx?: AnalyzeContext;
    };

    if (!body.audio || !body.ctx) {
      return NextResponse.json(
        { ok: false, error: '缺少 audio 或 ctx 参数' },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();

    // Step1: ASR 语音转写（音频为前端编码的 WAV base64；兼容 dataUri 前缀，ASR 仅接受纯 base64）
    const pureBase64 = body.audio.includes(',') ? body.audio.slice(body.audio.indexOf(',') + 1) : body.audio;
    const asrClient = new ASRClient(config, customHeaders);
    let transcript = '';
    let audioDurationMs = typeof body.durationMs === 'number' ? body.durationMs : 0;
    try {
      const asrResult = await asrClient.recognize({
        uid: 'livecoach',
        base64Data: pureBase64,
      });
      transcript = (asrResult.text ?? '').trim();
      if (asrResult.duration) audioDurationMs = asrResult.duration;
    } catch (asrErr) {
      console.error('[speech] ASR 转写失败:', asrErr);
      // ASR 失败时降级：仍返回 ok，但 speech 内容标注转写失败
      const res: SpeechAnalysisResponse = {
        ok: true,
        speech: {
          transcript: '',
          speechRate: 'normal',
          fillerWords: [],
          interaction: 'some',
          onTopic: true,
          energy: 'normal',
          scores: { language: 75, interaction: 70, content: 75 },
          level: 'ok',
        },
        error: '语音转写暂不可用，本轮已跳过',
      };
      return NextResponse.json(res);
    }

    // Step2: LLM 分析转写内容
    const client = new LLMClient(undefined, customHeaders);
    const messages = [
      { role: 'system' as const, content: buildSpeechSystemPrompt(body.ctx.coachStyle) },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: buildSpeechUserPrompt({
              ctx: body.ctx,
              transcript,
              audioDurationMs,
            }),
          },
        ],
      },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-mini-260215',
      temperature: 0.3,
    });
    const parsed = parseJsonSafe<LLMOutput>(response.content);

    if (!parsed || !parsed.speech) {
      // LLM 分析失败时降级返回原始转写
      const res: SpeechAnalysisResponse = {
        ok: true,
        speech: {
          transcript,
          speechRate: 'normal',
          fillerWords: [],
          interaction: 'some',
          onTopic: true,
          energy: 'normal',
          scores: { language: 75, interaction: 70, content: 75 },
          level: 'ok',
        },
        error: '语音表达分析暂不可用，已保留转写文本',
      };
      return NextResponse.json(res);
    }

    const s = parsed.speech;
    const num = (val: unknown, def: number): number =>
      typeof val === 'number' && val >= 0 && val <= 100 ? Math.round(val) : def;

    const fillerWords = (s.fillerWords ?? [])
      .map((f): string => {
        if (typeof f === 'string') return f;
        return typeof f.word === 'string' ? f.word : '';
      })
      .filter((w) => w.length > 0)
      .slice(0, 6);

    const speech: SpeechResult = {
      transcript: typeof s.transcript === 'string' ? s.transcript : transcript,
      speechRate: oneOf(s.speechRate, ['slow', 'normal', 'fast'] as const, 'normal'),
      fillerWords,
      interaction: oneOf(s.interaction, ['none', 'some', 'good'] as const, 'some'),
      onTopic: s.onTopic !== false,
      energy: oneOf(s.energy, ['low', 'normal', 'high'] as const, 'normal'),
      scores: {
        language: num(s.scores?.language, 75),
        interaction: num(s.scores?.interaction, 70),
        content: num(s.scores?.content, 75),
      },
      level: oneOf(s.level, ['ok', 'warn', 'alert'] as const, 'ok'),
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

    const stage: StageJudgement | undefined = parsed.stage
      ? {
          current:
            typeof parsed.stage.current === 'string'
              ? parsed.stage.current.slice(0, 30)
              : '',
          matchedIndex:
            typeof parsed.stage.matchedIndex === 'number' ? parsed.stage.matchedIndex : -1,
          offTopic: Boolean(parsed.stage.offTopic),
        }
      : undefined;

    const res: SpeechAnalysisResponse = { ok: true, speech, reminders, stage };
    return NextResponse.json(res);
  } catch (err) {
    console.error('[speech] 分析失败:', err);
    return NextResponse.json(
      { ok: false, error: '语音分析服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
