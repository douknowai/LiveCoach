/**
 * 训练记录详情/删除接口
 * GET /api/session/[id]  - 完整记录（含复盘/雷达/提醒/转写）
 * DELETE /api/session/[id] - 删除记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: '无效的记录 ID' }, { status: 400 });
    }

    const db = getSupabaseClient();
    const { data, error } = await db
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: '训练记录不存在' },
        { status: 404 }
      );
    }

    // 上一场记录（用于复盘页对比：雷达图虚线 + 场次序号）
    const { data: prevRows } = await db
      .from('training_sessions')
      .select('id, duration_sec, overall_score, metrics, created_at')
      .lt('created_at', (data as { created_at: string }).created_at)
      .order('created_at', { ascending: false })
      .limit(1);
    const prev = prevRows && prevRows.length > 0 ? prevRows[0] : null;

    return NextResponse.json({ ok: true, record: data, prev });
  } catch (err) {
    console.error('[session/detail] 异常:', err);
    return NextResponse.json(
      { ok: false, error: '服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: '无效的记录 ID' }, { status: 400 });
    }

    const db = getSupabaseClient();
    const { error } = await db.from('training_sessions').delete().eq('id', id);

    if (error) {
      console.error('[session/delete] 删除失败:', error);
      return NextResponse.json(
        { ok: false, error: '删除失败，请重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[session/delete] 异常:', err);
    return NextResponse.json(
      { ok: false, error: '服务异常，请稍后重试' },
      { status: 500 }
    );
  }
}
