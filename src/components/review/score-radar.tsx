'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { METRIC_KEYS, METRIC_LABELS } from '@/lib/types';
import type { MetricKey } from '@/lib/types';

type MetricMap = Record<MetricKey, number>;

/** 训练表现雷达图（暖白柔和风） */
export function ScoreRadar({
  metrics,
  compare,
}: {
  metrics: MetricMap;
  compare?: MetricMap | null;
}) {
  const data = METRIC_KEYS.map((k) => ({
    subject: METRIC_LABELS[k],
    value: metrics[k] ?? 0,
    prev: compare?.[k] ?? null,
  }));

  return (
    <div className="h-[240px] w-full sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(44,36,34,0.10)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#6e625e', fontSize: 12 }} />
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={{ fill: '#c0b4a4', fontSize: 9 }}
            axisLine={false}
          />
          {compare && (
            <Radar
              name="上次"
              dataKey="prev"
              stroke="#c0b4a4"
              fill="#c0b4a4"
              fillOpacity={0.18}
              strokeDasharray="4 4"
            />
          )}
          <Radar
            name="本次"
            dataKey="value"
            stroke="#a66a3a"
            fill="#a66a3a"
            fillOpacity={0.28}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e6dfd2',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: '0 8px 24px rgba(44,36,34,0.10)',
            }}
            labelStyle={{ color: '#2c2422', fontWeight: 700 }}
            itemStyle={{ color: '#6e625e' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
