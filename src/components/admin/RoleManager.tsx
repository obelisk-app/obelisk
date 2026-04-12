'use client';

import { useCallback, useEffect, useState } from 'react';

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
      <form onSubmit={handleCreate} className="lc-card p-4 space-y-4">
        <h3 className="text-sm font-medium text-lc-muted uppercase tracking-wide">Create Role</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
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
          <div className="w-20">
            <label className="block text-xs text-lc-muted mb-1">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-9 bg-lc-black border border-lc-border rounded-lg cursor-pointer"
              data-testid="role-color-input"
            />
          </div>
          <div className="w-20">
            <label className="block text-xs text-lc-muted mb-1">Icon</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🌟"
              className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white placeholder-lc-muted/50 focus:outline-none focus:border-lc-green"
              data-testid="role-icon-input"
            />
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
          <button
            type="submit"
            disabled={saving}
            className="lc-pill-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
            data-testid="create-role-btn"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>

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
              className="lc-card p-4 flex items-center gap-4"
              data-testid={`role-row-${role.id}`}
            >
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
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-10 h-8 bg-lc-black border border-lc-border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    placeholder="🌟"
                    className="w-16 bg-lc-black border border-lc-border rounded-lg px-2 py-1.5 text-sm text-lc-white focus:outline-none focus:border-lc-green"
                  />
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
                    {role.icon && <span className="text-lg">{role.icon}</span>}
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
