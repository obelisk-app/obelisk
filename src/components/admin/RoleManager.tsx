'use client';

import { useCallback, useEffect, useState } from 'react';
import EmojiPicker from '@/components/chat/EmojiPicker';
import ChannelEmoji from '@/components/chat/ChannelEmoji';
import ColorPicker from './ColorPicker';

interface CustomRoleData {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  priority: number;
  _count: { members: number };
}

interface RoleManagerProps {
  serverId: string;
}

export default function RoleManager({ serverId }: RoleManagerProps) {
  const [roles, setRoles] = useState<CustomRoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [color, setColor] = useState('#99aab5');
  const [icon, setIcon] = useState('');
  const [priority, setPriority] = useState(0);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOverId, setDropOverId] = useState<string | null>(null);

  // Server emojis (for icon picker)
  const [serverEmojis, setServerEmojis] = useState<Record<string, string>>({});
  const [createPickerOpen, setCreatePickerOpen] = useState(false);
  const [editPickerOpen, setEditPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/emojis?serverId=${encodeURIComponent(serverId)}`)
      .then((r) => (r.ok ? r.json() : { emojis: [] }))
      .then(({ emojis }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const e of (emojis ?? []) as { name: string; url: string }[]) map[e.name] = e.url;
        setServerEmojis(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverId]);

  const resolveEmojiValue = (val: string) => {
    const match = /^:([a-z0-9_-]+):$/i.exec(val);
    if (match && serverEmojis[match[1]]) return serverEmojis[match[1]];
    return val;
  };
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#99aab5');
  const [editIcon, setEditIcon] = useState('');
  const [editPriority, setEditPriority] = useState(0);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/roles?serverId=${encodeURIComponent(serverId)}`);
      if (res.ok) {
        setRoles(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/roles?serverId=${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          color,
          icon: icon.trim() || undefined,
          priority,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create role');
        return;
      }
      setName('');
      setColor('#99aab5');
      setIcon('');
      setPriority(0);
      await fetchRoles();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId: string) => {
    const res = await fetch(`/api/admin/roles/${roleId}`, { method: 'DELETE' });
    if (res.ok) {
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
    }
  };

  const startEdit = (role: CustomRoleData) => {
    setEditingId(role.id);
    setEditName(role.name);
    setEditColor(role.color);
    setEditIcon(role.icon || '');
    setEditPriority(role.priority);
  };

  const cancelEdit = () => setEditingId(null);

  const handleUpdate = async (roleId: string) => {
    setError(null);
    const res = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim(),
        color: editColor,
        icon: editIcon.trim() || null,
        priority: editPriority,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to update role');
      return;
    }
    setEditingId(null);
    await fetchRoles();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-lc-white">Custom Roles</h2>

      {/* Create form */}
      <form onSubmit={handleCreate} className="lc-card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-lc-muted uppercase tracking-wide">Create Role</h3>
          {/* Live pill preview */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: color, color: isLightColor(color) ? '#000' : '#fff' }}
          >
            {icon && <ChannelEmoji value={icon} className="text-sm" imgClassName="w-3.5 h-3.5 object-contain" />}
            <span>{name.trim() || 'Role name'}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-4 items-start">
          <div>
            <label className="block text-xs text-lc-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder="VIP"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white placeholder-lc-muted/50 focus:outline-none focus:border-lc-green"
              data-testid="role-name-input"
            />
          </div>
          <div>
            <label className="block text-xs text-lc-muted mb-1">Color</label>
            <ColorPicker value={color} onChange={setColor} data-testid="role-color-input" />
          </div>
          <div className="w-20 relative">
            <label className="block text-xs text-lc-muted mb-1">Icon</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCreatePickerOpen((v) => !v)}
                className="w-14 h-9 bg-lc-black border border-lc-border rounded-lg flex items-center justify-center hover:border-lc-green focus:border-lc-green focus:outline-none"
                data-testid="role-icon-input"
              >
                {icon ? (
                  <ChannelEmoji value={icon} imgClassName="w-5 h-5 object-contain" className="text-base" />
                ) : (
                  <span className="text-lc-muted">🌟</span>
                )}
              </button>
              {icon && (
                <button
                  type="button"
                  onClick={() => setIcon('')}
                  className="text-lc-muted hover:text-red-400 text-xs px-1"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {createPickerOpen && (
              <EmojiPicker
                className="absolute top-full left-0 mt-2 z-50"
                serverEmojis={serverEmojis}
                onSelect={(val) => {
                  setIcon(resolveEmojiValue(val));
                  setCreatePickerOpen(false);
                }}
                onClose={() => setCreatePickerOpen(false)}
              />
            )}
          </div>
          <div className="w-24">
            <label className="block text-xs text-lc-muted mb-1">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white focus:outline-none focus:border-lc-green"
              data-testid="role-priority-input"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {error && <p className="text-red-400 text-xs mr-auto">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="lc-pill-primary px-5 py-2 text-sm font-medium disabled:opacity-50"
            data-testid="create-role-btn"
          >
            {saving ? 'Creating...' : 'Create role'}
          </button>
        </div>
      </form>

      {/* Preview — shows how roles group members in the chat sidebar */}
      {!loading && roles.length > 0 && (
        <div className="lc-card p-4" data-testid="role-preview">
          <h3 className="text-sm font-medium text-lc-muted uppercase tracking-wide mb-3">
            Preview · how members see it
          </h3>
          <div className="bg-lc-black border border-lc-border rounded-lg p-3 space-y-3 max-w-sm">
            {roles.map((r) => (
              <div key={r.id}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-lc-muted mb-1 flex items-center gap-1.5">
                  {r.icon && <ChannelEmoji value={r.icon} className="text-sm" imgClassName="w-4 h-4 object-contain" />}
                  <span>{r.name}</span>
                  <span className="ml-auto text-lc-muted/60">— 1</span>
                </div>
                <div className="flex items-center gap-2 px-1 py-1 rounded hover:bg-lc-border/30">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ backgroundColor: r.color }}
                  >
                    M
                  </div>
                  <span className="text-sm font-medium" style={{ color: r.color }}>
                    MockUser
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-lc-muted mt-2">
            Members appear once under their highest-priority role. Drag rows below to reorder.
          </p>
        </div>
      )}

      {/* Role list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="lc-skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <p className="text-lc-muted text-sm">No custom roles yet. Create one above.</p>
      ) : (
        <div className="space-y-2" data-testid="role-list">
          {roles.map((role) => (
            <div
              key={role.id}
              draggable={editingId !== role.id}
              onDragStart={(e) => {
                setDragId(role.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => { setDragId(null); setDropOverId(null); }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropOverId(role.id);
              }}
              onDragLeave={() => { if (dropOverId === role.id) setDropOverId(null); }}
              onDrop={async (e) => {
                e.preventDefault();
                if (!dragId || dragId === role.id) { setDropOverId(null); return; }
                const list = [...roles];
                const fromIdx = list.findIndex((r) => r.id === dragId);
                const toIdx = list.findIndex((r) => r.id === role.id);
                if (fromIdx === -1 || toIdx === -1) return;
                const [moved] = list.splice(fromIdx, 1);
                list.splice(toIdx, 0, moved);
                // Reassign priorities: topmost = highest priority (list.length - index)
                const updated = list.map((r, i) => ({ ...r, priority: list.length - i }));
                setRoles(updated);
                setDragId(null);
                setDropOverId(null);
                await fetch('/api/admin/roles/reorder', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roles: updated.map((r) => ({ id: r.id, priority: r.priority })) }),
                });
                await fetchRoles();
              }}
              className={`lc-card p-4 flex items-center gap-4 ${editingId !== role.id ? 'cursor-move' : ''} ${
                dropOverId === role.id ? 'ring-1 ring-lc-green' : ''
              } ${dragId === role.id ? 'opacity-40' : ''}`}
              data-testid={`role-row-${role.id}`}
            >
              {editingId !== role.id && (
                <span className="text-lc-muted/60 select-none shrink-0" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
              )}
              {editingId === role.id ? (
                /* Edit mode */
                <div className="flex-1 flex flex-wrap gap-3 items-end">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={32}
                    className="flex-1 min-w-[120px] bg-lc-black border border-lc-border rounded-lg px-3 py-1.5 text-sm text-lc-white focus:outline-none focus:border-lc-green"
                    data-testid="edit-role-name"
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} align="right" />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setEditPickerOpen((v) => !v)}
                      className="w-12 h-8 bg-lc-black border border-lc-border rounded-lg flex items-center justify-center hover:border-lc-green focus:border-lc-green focus:outline-none"
                    >
                      {editIcon ? (
                        <ChannelEmoji value={editIcon} imgClassName="w-4 h-4 object-contain" className="text-sm" />
                      ) : (
                        <span className="text-lc-muted text-sm">🌟</span>
                      )}
                    </button>
                    {editPickerOpen && (
                      <EmojiPicker
                        serverEmojis={serverEmojis}
                        onSelect={(val) => {
                          setEditIcon(resolveEmojiValue(val));
                          setEditPickerOpen(false);
                        }}
                        onClose={() => setEditPickerOpen(false)}
                      />
                    )}
                  </div>
                  <input
                    type="number"
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                    className="w-20 bg-lc-black border border-lc-border rounded-lg px-2 py-1.5 text-sm text-lc-white focus:outline-none focus:border-lc-green"
                  />
                  <button
                    onClick={() => handleUpdate(role.id)}
                    className="lc-pill-primary px-3 py-1 text-xs font-medium"
                    data-testid="save-role-btn"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="lc-pill-secondary px-3 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                /* Display mode */
                <>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {role.icon && <ChannelEmoji value={role.icon} className="text-lg" imgClassName="w-5 h-5 object-contain" />}
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: role.color, color: isLightColor(role.color) ? '#000' : '#fff' }}
                      data-testid="role-badge"
                    >
                      {role.name}
                    </span>
                    <span className="text-xs text-lc-muted ml-2">
                      Priority: {role.priority}
                    </span>
                    <span className="text-xs text-lc-muted">
                      {role._count.members} member{role._count.members !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => startEdit(role)}
                    className="lc-pill-secondary px-3 py-1 text-xs"
                    data-testid="edit-role-btn"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(role.id)}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-1"
                    data-testid="delete-role-btn"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Returns true if a hex color is "light" (for choosing text contrast). */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance threshold
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
