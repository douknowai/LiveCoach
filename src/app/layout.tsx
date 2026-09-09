import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LiveCoach · AI 直播陪练舱',
    template: '%s | LiveCoach AI 直播陪练',
  },
  description:
    '面向职业教育与高校实训的 AI 辅助模拟直播演练与实时主播陪练系统。打开摄像头即可开始模拟直播，AI 教练实时观察镜头表现、表情、语速与直播流程，即时提醒，结束后生成复盘报告与成长记录。',
  keywords: [
    'AI 直播陪练',
    '模拟直播',
    '直播实训',
    '直播电商教学',
    '主播训练',
    'AI 教练',
  ],
  generator: 'LiveCoach',
};

export const viewport: Viewport = {
  themeColor: '#f8f4f1',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
