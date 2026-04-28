'use client';

import { shortNpub } from '@/lib/mentions';

interface ModAction {
  id: string;
  actorPubkey: string;
  targetPubkey: string | null;
  action: string;
  reason: string | null;
  metadata: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  ban: { label: 'Banned', color: 'text-red-400' },
  unban: { label: 'Unbanned', color: 'text-green-400' },
  kick: { label: 'Kicked', color: 'text-amber-400' },
  mute: { label: 'Muted', color: 'text-orange-400' },
  unmute: { label: 'Unmuted', color: 'text-green-400' },
  warn: { label: 'Warned', color: 'text-yellow-400' },
  delete_message: { label: 'Deleted message', color: 'text-red-300' },
  role_change: { label: 'Changed role', color: 'text-blue-400' },
  resolve_report: { label: 'Resolved report', color: 'text-lc-green' },
  dismiss_report: { label: 'Dismissed report', color: 'text-lc-muted' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ModActionCard({ action }: { action: ModAction }) {
  const info = ACTION_LABELS[action.action] || { label: action.action, color: 'text-lc-muted' };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-lc-card/50 transition-colors" data-testid="mod-action">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-medium ${info.color}`}>{info.label}</span>
          {action.targetPubkey && (
            <>
              <span className="text-lc-muted">→</span>
              <span className="text-lc-white font-mono text-xs">{shortNpub(action.targetPubkey)}</span>
            </>
          )}
        </div>
        {action.reason && (
          <p className="text-xs text-lc-muted mt-1">Reason: {action.reason}</p>
        )}
        <div className="text-xs text-lc-muted mt-1">
          by <span className="font-mono">{shortNpub(action.actorPubkey)}</span> · {timeAgo(action.createdAt)}
        </div>
      </div>
    </div>
  );
}
