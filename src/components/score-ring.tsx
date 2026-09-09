'use client';

/** 参考稿 score-ring：SVG 圆环评分（直播实时 + 复盘页共用） */
export function ScoreRing({ value, size = 120 }: { value: number; size?: number }) {
  const stroke = 7;
  const r = (size - stroke * 2) / 2;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - Math.max(0, Math.min(100, value)) / 100);
  const color =
    value >= 85 ? '#8ab89a' : value >= 70 ? '#c4838a' : value >= 55 ? '#d4a574' : '#c4bab3';
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0eae6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.34, 1.3, 0.64, 1), stroke 0.5s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold tabular-nums"
          style={{ color, fontSize: size * 0.24, lineHeight: 1.1 }}
        >
          {Math.round(value)}
        </span>
        <span className="text-[10px] text-[#a69791]">综合评分</span>
      </div>
    </div>
  );
}
