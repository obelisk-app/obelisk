'use client';

import { useRef, useState } from 'react';
import RoleBadge, { type CustomRoleBadgeData } from './RoleBadge';
import ConfirmDialog from './ConfirmDialog';
import BanReasonDialog from './BanReasonDialog';
import type { Role } from '@/lib/auth-roles';
import { shortNpub } from '@/lib/mentions';
import { useClickOutside } from '@/hooks/useClickOutside';

interface MemberData {
  id: string;
  pubkey: string;
  role: Role;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  joinedAt: string;
  banned: boolean;
  joinedViaInvite?: { id: string; code: string; createdBy: string } | null;
  customRoles?: { role: CustomRoleBadgeData }[];
}

/** Available custom roles on this server (for the assignment dropdown). */
export interface ServerCustomRole {
  id: string;
  name: string;
  color: string;
}

interface MemberRowProps {
  member: MemberData;
  serverCustomRoles?: ServerCustomRole[];
  onCustomRoleToggle?: (memberId: string, roleId: string, assign: boolean) => void;
  isOwner: boolean; // is the viewer the owner?
  isInstanceOwner?: boolean; // is the viewer the instance owner? unlocks cross-server actions
  onRoleChange: (pubkey: string, role: Role) => void;
  onKick: (pubkey: string) => void;
  onBan: (pubkey: string, reason: string) => void;
  onUnban: (pubkey: string) => void;
  onManageMemberships?: (pubkey: string, displayName: string | null) => void;
}

export default function MemberRow({
  member,
  isOwner,
  isInstanceOwner = false,
  serverCustomRoles,
  onRoleChange,
  onKick,
  onBan,
  onUnban,
  onManageMemberships,
  onCustomRoleToggle,
}: MemberRowProps) {
  const [confirm, setConfirm] = useState<'kick' | 'ban' | null>(null);
  const [rolesMenuOpen, setRolesMenuOpen] = useState(false);
  const [rolesFilter, setRolesFilter] = useState('');
  const rolesMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(rolesMenuRef, () => setRolesMenuOpen(false), { enabled: rolesMenuOpen });

  const assignedRoleIds = new Set((member.customRoles ?? []).map((cr) => cr.role.id));
  const filteredRoles = (serverCustomRoles ?? []).filter((r) =>
    r.name.toLowerCase().includes(rolesFilter.toLowerCase())
  );
  const isTargetOwner = member.role === 'owner';
  const shortPubkey = shortNpub(member.pubkey);

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-lc-white truncate">
              {member.displayName || shortPubkey}
            </span>
            <RoleBadge
              role={member.role}
              customRoles={member.customRoles?.map((cr) => cr.role)}
              maxCustom={2}
              onOverflowClick={
                serverCustomRoles && serverCustomRoles.length > 0 && onCustomRoleToggle && !member.banned
                  ? () => setRolesMenuOpen(true)
                  : undefined
              }
            />
            {member.banned && (
              <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">BANNED</span>
            )}
            {member.joinedViaInvite && (
              <span
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold"
                title={`Joined via invite ${member.joinedViaInvite.code} created by ${shortNpub(member.joinedViaInvite.createdBy)}`}
              >
                via invite
              </span>
            )}
          </div>
          <div className="text-xs text-lc-muted truncate">
            {member.nip05 || shortPubkey}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Cross-server membership editor — instance owner only, always visible */}
          {isInstanceOwner && onManageMemberships && (
            <button
              onClick={() => onManageMemberships(member.pubkey, member.displayName)}
              className="text-xs px-3 py-1.5 rounded-full border border-purple-500/30 text-purple-300 hover:border-purple-400 hover:text-purple-200 transition-colors"
              data-testid="manage-memberships-btn"
              title="Edit which servers this user belongs to (instance owner)"
            >
              Servers
            </button>
          )}

          {/* Base role selector (owner only, not for owner target) */}
          {!isTargetOwner && isOwner && (
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

          {/* Custom role selector dropdown — available for every member (including owner) */}
          {serverCustomRoles && serverCustomRoles.length > 0 && onCustomRoleToggle && !member.banned && (
                <div className="relative" ref={rolesMenuRef} data-testid="custom-role-toggles">
                  <button
                    type="button"
                    onClick={() => setRolesMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-lc-border bg-lc-black text-lc-white text-xs hover:border-lc-green/50 transition-colors"
                    data-testid="roles-dropdown-btn"
                  >
                    <span className="text-lc-muted">Roles</span>
                    {assignedRoleIds.size > 0 ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-lc-green/20 text-lc-green text-[10px] font-semibold">
                        {assignedRoleIds.size}
                      </span>
                    ) : (
                      <span className="text-lc-muted/60">none</span>
                    )}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-lc-muted">
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
                  </button>

                  {rolesMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 z-40 w-64 rounded-xl border border-lc-border bg-lc-dark shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-lc-border">
                        <input
                          autoFocus
                          value={rolesFilter}
                          onChange={(e) => setRolesFilter(e.target.value)}
                          placeholder="Search roles…"
                          className="w-full px-2 py-1.5 rounded-md bg-lc-black border border-lc-border text-xs text-lc-white focus:outline-none focus:border-lc-green"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {filteredRoles.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-lc-muted italic">No roles match</p>
                        ) : (
                          filteredRoles.map((cr) => {
                            const assigned = assignedRoleIds.has(cr.id);
                            return (
                              <button
                                key={cr.id}
                                type="button"
                                onClick={() => onCustomRoleToggle(member.id, cr.id, !assigned)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-lc-border/50"
                                data-testid={`toggle-role-${cr.id}`}
                              >
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cr.color }}
                                />
                                <span className="flex-1 text-lc-white truncate">{cr.name}</span>
                                <span
                                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                                    assigned
                                      ? 'bg-lc-green border-lc-green text-lc-black'
                                      : 'border-lc-border bg-lc-black'
                                  }`}
                                  aria-hidden
                                >
                                  {assigned && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
            </div>
          )}

          {!isTargetOwner && (
            member.banned ? (
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
            )
          )}
        </div>
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
        <BanReasonDialog
          memberName={member.displayName || shortPubkey}
          onConfirm={(reason) => { onBan(member.pubkey, reason); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
