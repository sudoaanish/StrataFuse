import { useToast, type ToastSeverity } from '../../contexts/ToastContext';
import { X, AlertTriangle, AlertCircle, CheckCircle, Info } from 'lucide-react';

const SEVERITY_STYLES: Record<ToastSeverity, { icon: typeof AlertCircle; color: string; bg: string; border: string }> = {
  error:   { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  success: { icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  info:    { icon: Info,          color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const style = SEVERITY_STYLES[toast.severity];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-3.5 rounded-xl backdrop-blur-xl border shadow-lg animate-slide-in ${style.bg} ${style.border}`}
          >
            <Icon className={`w-4.5 h-4.5 flex-shrink-0 mt-0.5 ${style.color}`} />
            <p className="text-sm text-white/80 leading-relaxed flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-0.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
