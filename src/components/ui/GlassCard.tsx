import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className = '', hover = false, onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl
        shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]
        ${hover
          ? 'hover:bg-white/[0.06] hover:border-white/[0.1] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer'
          : ''
        }
        ${className}
      `}
    >
      {children}
    </div>
  );
}
