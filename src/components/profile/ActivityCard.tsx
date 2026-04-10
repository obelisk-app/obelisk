interface ActivityCardProps {
  serverName: string;
  joinedAt: string;
  lastActivityAt: string | null;
}

export default function ActivityCard({
  serverName,
  joinedAt,
  lastActivityAt,
}: ActivityCardProps) {
  return (
    <div className="lc-card p-4" data-testid="activity-card">
      <h4 className="text-sm font-semibold text-lc-white mb-2">{serverName}</h4>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-lc-muted">Joined</p>
          <p className="text-lc-white">{new Date(joinedAt).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-lc-muted">Last activity</p>
          <p className="text-lc-white">
            {lastActivityAt ? new Date(lastActivityAt).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
