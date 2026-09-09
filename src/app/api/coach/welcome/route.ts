/**
 * 开场欢迎语接口（SSE 流式）
 * 直播开始时前端 POST 一次，后端按教练人格 + 学员画像 + 成长档案
 * 流式生成 40-80 字的开场欢迎语（新学员自我介绍 / 老学员欢迎回来）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, HeaderUtils } from 'coze-coding-dev-sdk';
import {
  buildWelcomeSystemPrompt,
  buildWelcomeUserPrompt,
  type WelcomePromptInput,
} from '@/lib/server/coach-prompts';

export const maxDuration = 30;

/** 流式失败时的兜底欢迎语（真实调用失败后的降级，不伪造成功） */
const FALLBACK_WELCOME =
  '欢迎来到模拟直播间，我是你的 AI 教练。深呼吸，放松肩膀，看着镜头——今天这一场，我们一起把它练扎实。';

export async function POST(request: NextRequest) {
  let payload: WelcomePromptInput;
  try {
    payload = (await request.json()) as WelcomePromptInput;
  } catch {
    return NextResponse.json({ ok: false, error: '请求体解析失败' }, { status: 400 });
  }

  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new LLMClient(undefined, customHeaders);

    const messages = [
      { role: 'system' as const, content: buildWelcomeSystemPrompt(payload.coachStyle) },
      { role: 'user' as const, content: buildWelcomeUserPrompt(payload) },
    ];

    const stream = await client.stream(messages, {
      model: 'doubao-seed-2-0-mini-260215',
      temperature: 0.85,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        let produced = false;
        try {
          for await (const chunk of stream) {
            const text =
              typeof chunk?.content === 'string' ? chunk.content : String(chunk?.content ?? '');
            if (text) {
              produced = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
            }
          }
          if (!produced) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: FALLBACK_WELCOME })}\n\n`));
          }
        } catch (err) {
          console.error('[welcome] 流式生成中断:', err);
          if (!produced) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: FALLBACK_WELCOME })}\n\n`));
          }
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[welcome] 欢迎语生成失败:', err);
    return NextResponse.json({ ok: false, error: '欢迎语生成失败' }, { status: 500 });
  }
}
