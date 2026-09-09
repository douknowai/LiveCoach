/**
 * 训练记录列表接口
 * GET /api/session/list?limit=20
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Math.min(100, Math.max(1, Math.round(limitParam) || 50));

    const db = getSupabaseClient();
    const { data, error } = await db
      .from('training_sessions')
      .select(
        'id, student_name, task_type, topic, duration_sec, overall_score, metrics, reminders, reminder_stats, status, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[session/list] 查询失败:', error);
      return NextResponse.json(
        { ok: false, error: '训练记录查询失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, sessions: data ?? [] });
  } catch (err) {
    console.error('[session/list] 异常:', err);
    return NextResponse.json(
      { ok: false, error: '服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
