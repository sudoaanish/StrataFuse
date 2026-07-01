import type { TransferItem, CompletedTransferItem } from '../../lib/types';
import { formatBytes, formatSpeed, formatName } from '../../lib/format';
import { Download, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  transfers: TransferItem[];
  completedTransfers?: CompletedTransferItem[];
}

export function TransferTable({ transfers, completedTransfers = [] }: Props) {
  const visibleActive = transfers.slice(0, 5);
  const visibleCompleted = completedTransfers.slice(-8).reverse();

  const hasTransfers = visibleActive.length > 0 || visibleCompleted.length > 0;

  return (
    <div className="glass-card flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white/70">Transfers</h3>
        <span className="text-xs text-white/30">
          {transfers.length} active · {completedTransfers.length} completed
        </span>
      </div>

      {!hasTransfers ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white/20 gap-3">
          <Download className="w-8 h-8 animate-pulse-glow" />
          <p className="text-sm">No active or recent transfers</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-6">
          {/* Active Transfers Section */}
          {visibleActive.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-cyan-400/80 uppercase tracking-wider mb-2">Active Files</h4>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-white/30 uppercase tracking-wider border-b border-white/[0.03]">
                    <th className="text-left py-1.5 font-medium">File</th>
                    <th className="text-right py-1.5 font-medium w-20">Size</th>
                    <th className="text-right py-1.5 font-medium w-24">Speed</th>
                    <th className="py-1.5 font-medium w-36">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActive.map((t, i) => (
                    <tr key={`active-${t.name}-${i}`} className="border-t border-white/[0.03]">
                      <td className="py-2 pr-3">
                        <span className="text-sm text-white/80 block truncate max-w-[220px]" title={t.name}>
                          {formatName(t.name, 30)}
                        </span>
                      </td>
                      <td className="py-2 text-right text-xs text-white/40">{formatBytes(t.size)}</td>
                      <td className="py-2 text-right text-xs text-cyan-400/80">{formatSpeed(t.speed)}</td>
                      <td className="py-2 pl-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full progress-bar-fill"
                              style={{ width: `${Math.min(t.percentage ?? 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/40 w-9 text-right">{Math.round(t.percentage ?? 0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Completed Transfers Section */}
          {visibleCompleted.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-2">Recent Completed / Uploaded / Downloaded</h4>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-white/30 uppercase tracking-wider border-b border-white/[0.03]">
                    <th className="text-left py-1.5 font-medium">File</th>
                    <th className="text-right py-1.5 font-medium w-24">Size</th>
                    <th className="text-right py-1.5 font-medium w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCompleted.map((t, i) => {
                    const isError = !!t.error;
                    return (
                      <tr key={`completed-${t.name}-${i}`} className="border-t border-white/[0.03] animate-fade-in">
                        <td className="py-2 pr-3">
                          <span className="text-sm text-white/70 block truncate max-w-[280px]" title={t.name}>
                            {formatName(t.name, 40)}
                          </span>
                        </td>
                        <td className="py-2 text-right text-xs text-white/40">{formatBytes(t.size)}</td>
                        <td className="py-2 text-right">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isError ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10'
                          }`}>
                            {isError ? (
                              <>
                                <XCircle className="w-2.5 h-2.5" />
                                ERROR
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-2.5 h-2.5" />
                                DONE
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
