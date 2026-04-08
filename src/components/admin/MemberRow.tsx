'use client';

import { useState } from 'react';
import RoleBadge from './RoleBadge';
import ConfirmDialog from './ConfirmDialog';
import type { Role } from '@/lib/auth-roles';

interface MemberData {
  id: string;
  pubkey: string;
  role: Role;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  joinedAt: string;
  banned: boolean;
}

interface MemberRowProps {
  member: MemberData;
  isOwner: boolean; // is the viewer the owner?
  onRoleChange: (pubkey: string, role: Role) => void;
  onKick: (pubkey: string) => void;
  onBan: (pubkey: string) => void;
  onUnban: (pubkey: string) => void;
}

export default function MemberRow({ member, isOwner, onRoleChange, onKick, onBan, onUnban }: MemberRowProps) {
  const [confirm, setConfirm] = useState<'kick' | 'ban' | null>(null);
  const isTargetOwner = member.role === 'owner';
  const shortPubkey = member.pubkey.slice(0, 8) + '...' + member.pubkey.slice(-4);

  return (
    <>
      <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-lc-card/50 transition-colors" data-testid="member-row">
        {/* Avatar */}
        {member.picture ? (
          <img src={member.picture} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-sm font-semibold shrink-0">
            {(member.displayName || 'A')[0].toUpperCase()}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-lc-white truncate">
              {member.displayName || shortPubkey}
            </span>
            <RoleBadge role={member.role} />
            {member.banned && (
              <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">BANNED</span>
            )}
          </div>
          <div className="text-xs text-lc-muted truncate">
            {member.nip05 || shortPubkey}
          </div>
        </div>

        {/* Actions */}
        {!isTargetOwner && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Role selector (owner only) */}
            {isOwner && (
              <select
                value={member.role}
                onChange={(e) => onRoleChange(member.pubkey, e.target.value as Role)}
                className="text-xs bg-lc-dark border border-lc-border rounded-lg px-2 py-1.5 text-lc-white"
                data-testid="role-select"
              >
                <option value="admin">Admin</option>
                <option value="mod">Mod</option>
                <option value="member">Member</option>
              </select>
            )}

            {member.banned ? (
              <button
                onClick={() => onUnban(member.pubkey)}
                className="text-xs px-3 py-1.5 rounded-full border border-lc-green text-lc-green hover:bg-lc-green/10 transition-colors"
              >
                Unban
              </button>
            ) : (
              <>
                <button
                  onClick={() => setConfirm('kick')}
                  className="text-xs px-3 py-1.5 rounded-full border border-lc-border text-lc-muted hover:border-amber-500 hover:text-amber-500 transition-colors"
                >
                  Kick
                </button>
                <button
                  onClick={() => setConfirm('ban')}
                  className="text-xs px-3 py-1.5 rounded-full border border-lc-border text-lc-muted hover:border-red-500 hover:text-red-500 transition-colors"
                >
                  Ban
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {confirm === 'kick' && (
        <ConfirmDialog
          title="Kick Member"
          message={`Remove ${member.displayName || shortPubkey} from the server? They can rejoin.`}
          confirmLabel="Kick"
          onConfirm={() => { onKick(member.pubkey); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'ban' && (
        <ConfirmDialog
          title="Ban Member"
          message={`Ban ${member.displayName || shortPubkey}? They will be removed and cannot rejoin.`}
          confirmLabel="Ban"
          onConfirm={() => { onBan(member.pubkey); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
