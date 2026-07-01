import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

interface Props {
  icon: ComponentType<LucideProps>;
  label: string;
  value: string;
  subValue?: string;
  accentColor?: string;
}

export function StatCard({ icon: Icon, label, value, subValue, accentColor = 'text-violet-400' }: Props) {
  return (
    <div className="glass-card p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-white/[0.04] ${accentColor}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-semibold text-white mt-0.5 truncate">{value}</p>
        {subValue && <p className="text-xs text-white/40 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}
