'use client';

import {
  Package,
  ShoppingCart,
  Wheat,
  MapPinned,
  BookOpen,
  Mic,
  Tag,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

const TASK_ICONS: Record<string, LucideIcon> = {
  product_intro: Package,
  live_commerce: ShoppingCart,
  agri: Wheat,
  tourism: MapPinned,
  knowledge: BookOpen,
  hosting: Mic,
  brand: Tag,
  free: Sparkles,
};

/** 任务类型线性图标（统一 Lucide，描边风格） */
export function TaskIcon({
  taskId,
  className = 'h-5 w-5',
}: {
  taskId: string;
  className?: string;
}) {
  const Icon = TASK_ICONS[taskId] ?? Sparkles;
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}
