'use client';

import type { FaceState } from '@/lib/types';

/**
 * FaceStatusChips：监视器状态栏中的「端侧视觉引擎」实时状态
 * 展示三路端侧信号：姿态（低头/歪头）、注视（眼神）、表情（微笑）
 * 引擎失败时不渲染（自动回退纯 LLM 链路，避免干扰用户）
 */

interface Chip {
  key: string;
  text: string;
  color: string;
  /** 是否处于异常态（用浅暖底强调） */
  warn?: boolean;
}

function buildChips(s: FaceState): Chip[] {
  const chips: Chip[] = [];

  // 姿态（pitchOffset 为无量纲几何比例，不展示伪单位）
  if (s.pitchOffset > 0.075) {
    chips.push({ key: 'posture', text: '低头倾向', color: '#d4a574', warn: true });
  } else if (Math.abs(s.rollDeg) > 13) {
    chips.push({ key: 'posture', text: `歪头 ${Math.abs(Math.round(s.rollDeg))}°`, color: '#d4a574', warn: true });
  } else {
    chips.push({ key: 'posture', text: '姿态端正', color: '#8ab89a' });
  }

  // 注视
  if (!s.faceFound) {
    chips.push({ key: 'gaze', text: '离开画面', color: '#b56a3a', warn: true });
  } else if (s.gazeOnCamera < 0.4) {
    chips.push({ key: 'gaze', text: '视线偏离', color: '#d4a574', warn: true });
  } else {
    chips.push({ key: 'gaze', text: '注视镜头', color: '#8ab89a' });
  }

  // 表情
  if (s.smile > 0.45) {
    chips.push({ key: 'smile', text: '微笑中', color: '#a66a3a' });
  } else if (s.smile >= 0.15) {
    chips.push({ key: 'smile', text: '表情自然', color: '#9c8e80' });
  } else {
    chips.push({ key: 'smile', text: '表情平淡', color: '#9c8e80' });
  }

  return chips;
}

export function FaceStatusChips({ faceState }: { faceState: FaceState }) {
  // 引擎不可用：静默隐藏（LLM 视觉链路照常工作）
  if (faceState.engine === 'failed' || faceState.engine === 'off') return null;

  if (faceState.engine === 'loading') {
    return (
      <span className="hidden items-center gap-1.5 text-[#9c8e80] lg:flex">
        <span className="spinner h-2.5 w-2.5 rounded-full border-[1.5px] border-[#a66a3a] border-t-transparent" />
        <span className="text-[11px]">端侧视觉启动中</span>
      </span>
    );
  }

  if (!faceState.calibrated) {
    return (
      <span className="hidden items-center gap-1.5 text-[#9c8e80] lg:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-[#d4a574] pulse-dot" />
        <span className="text-[11px]">姿态基线校准中</span>
      </span>
    );
  }

  return (
    <span className="hidden items-center gap-1.5 lg:flex">
      {buildChips(faceState).map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
          style={{
            color: c.color,
            background: c.warn ? `${c.color}14` : 'rgba(138,184,154,0.08)',
          }}
        >
          <span className="h-1 w-1 rounded-full" style={{ background: c.color }} />
          {c.text}
        </span>
      ))}
    </span>
  );
}
