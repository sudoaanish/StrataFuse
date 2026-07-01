import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LogQueryResponse } from '../../lib/types';
import { Terminal, Trash2 } from 'lucide-react';

interface Props {
  logs: LogQueryResponse | null;
}

export function LogViewer({ logs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs?.entries.length]);

  const handleClear = async () => {
    try { await invoke('clear_log_buffer'); } catch {}
  };

  const entries = logs?.entries ?? [];

  return (
    <div className="glass-card flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white/70">Logs</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30">{logs?.totalLines ?? 0} total lines</span>
          <button
            onClick={handleClear}
            className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
            title="Clear log buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 bg-black/20">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20">
            <p>Waiting for log output...</p>
          </div>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="flex gap-2 hover:bg-white/[0.02] px-1 rounded">
              <span className="text-white/20 shrink-0 w-20">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 w-12 ${entry.stream === 'stderr' ? 'text-amber-400/60' : 'text-cyan-400/40'}`}>
                [{entry.stream === 'stderr' ? 'err' : 'out'}]
              </span>
              <span className="text-white/60 break-all">{entry.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
