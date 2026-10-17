import Link from 'next/link';

/** 直播实训 · 线性 logo 图标（监视器 + 电波） */
function LogoMark() {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6.5 w-6.5 text-[#a66a3a]"
      aria-hidden
    >
      <rect x="3" y="5" width="22" height="15" rx="3" />
      <path d="M9 24h10" />
      <path d="M10 10.5v4" />
      <path d="M14 9v7" />
      <path d="M18 10.5v4" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e6dfd2] bg-white/88 backdrop-blur-[14px]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3.5 sm:h-[60px] sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-serif text-[17px] font-bold tracking-[1.5px] text-[#2c2422] sm:text-[18px]">
            Live<span className="text-[#a66a3a]">Coach</span>
          </span>
          <span className="ml-1 hidden border-l border-[#e6dfd2] pl-2.5 text-[11px] tracking-[2px] text-[#9c8e80] sm:inline">
            AI 直播陪练舱
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/history"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e6dfd2] bg-white px-3.5 py-2 text-[12.5px] leading-none text-[#6e625e] transition-all hover:border-[#9c8e80] hover:text-[#2c2422] sm:px-4 sm:py-[7px]"
          >
            训练记录
          </Link>
          <Link
            href="/setup"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#a66a3a] px-3.5 py-2 text-[12.5px] font-medium leading-none tracking-[0.3px] text-white transition-all hover:bg-[#8f5630] hover:shadow-[0_2px_12px_rgba(166,106,58,0.35)] sm:px-4 sm:py-[7px]"
          >
            开始训练
          </Link>
        </nav>
      </div>
    </header>
  );
}
