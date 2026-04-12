'use client';

import { useEffect, useState, useCallback } from 'react';
import ConfirmDialog from './ConfirmDialog';
import EmojiPicker from '@/components/chat/EmojiPicker';
import ChannelEmoji from '@/components/chat/ChannelEmoji';

interface AdminChannel {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  type: string;
  position: number;
  categoryId: string | null;
  writePermission: string | null;
  writeRoleIds: string[];
}

interface AdminCustomRole {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  priority: number;
}

type WritePermissionValue = 'everyone' | 'mod' | 'admin' | 'roles';

interface AdminCategory {
  id: string;
  name: string;
  position: number;
  channels: AdminChannel[];
}

interface ChannelManagerProps {
  serverId: string;
  isOwner: boolean;
}

export default function ChannelManager({ serverId, isOwner }: ChannelManagerProps) {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [uncategorized, setUncategorized] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // New channel form
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', type: 'text', categoryId: '', emoji: '' });
  const [savingChannel, setSavingChannel] = useState(false);

  // New category form
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Edit states
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editChannelData, setEditChannelData] = useState<{
    name: string;
    emoji: string;
    description: string;
    type: string;
    writePermission: WritePermissionValue;
    writeRoleIds: string[];
  }>({ name: '', emoji: '', description: '', type: 'text', writePermission: 'everyone', writeRoleIds: [] });
  const [customRoles, setCustomRoles] = useState<AdminCustomRole[]>([]);
  const [serverEmojis, setServerEmojis] = useState<Record<string, string>>({});
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'channel' | 'category'; id: string; name: string } | null>(null);

  // Drag state
  const [draggedChannel, setDraggedChannel] = useState<{ id: string; sourceCategoryId: string | null } | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // key like "ch:<id>" | "cat-zone:<id>" | "uncat-zone" | "cat-header:<id>"

  const UNCAT_KEY = '__uncat__';

  const persistChannelReorder = async (updates: { id: string; position: number; categoryId?: string | null }[]) => {
    if (updates.length === 0) return;
    await fetch('/api/admin/channels/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: updates }),
    });
  };

  const persistCategoryReorder = async (updates: { id: string; position: number }[]) => {
    if (updates.length === 0) return;
    await fetch('/api/admin/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: updates }),
    });
  };

  const moveChannel = async (
    channelId: string,
    sourceCatId: string | null,
    destCatId: string | null,
    destIndex: number
  ) => {
    // Build source + dest lists
    const getList = (cid: string | null): AdminChannel[] =>
      cid === null ? [...uncategorized] : [...(categories.find((c) => c.id === cid)?.channels ?? [])];

    const source = getList(sourceCatId);
    const movedIdx = source.findIndex((c) => c.id === channelId);
    if (movedIdx === -1) return;
    const [moved] = source.splice(movedIdx, 1);

    let dest: AdminChannel[];
    if (sourceCatId === destCatId) {
      dest = source;
    } else {
      dest = getList(destCatId);
    }
    const clampedIdx = Math.max(0, Math.min(destIndex, dest.length));
    dest.splice(clampedIdx, 0, { ...moved, categoryId: destCatId });

    // Optimistic update
    if (sourceCatId === null && destCatId === null) {
      setUncategorized(dest);
    } else if (sourceCatId === null) {
      setUncategorized(source);
      setCategories((prev) => prev.map((c) => (c.id === destCatId ? { ...c, channels: dest } : c)));
    } else if (destCatId === null) {
      setUncategorized(dest);
      setCategories((prev) => prev.map((c) => (c.id === sourceCatId ? { ...c, channels: source } : c)));
    } else if (sourceCatId === destCatId) {
      setCategories((prev) => prev.map((c) => (c.id === destCatId ? { ...c, channels: dest } : c)));
    } else {
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id === sourceCatId) return { ...c, channels: source };
          if (c.id === destCatId) return { ...c, channels: dest };
          return c;
        })
      );
    }

    // Persist: send positions for affected list(s); include categoryId for moved
    const updates: { id: string; position: number; categoryId?: string | null }[] = [];
    dest.forEach((c, i) => {
      updates.push({
        id: c.id,
        position: i,
        ...(c.id === channelId ? { categoryId: destCatId } : {}),
      });
    });
    if (sourceCatId !== destCatId) {
      source.forEach((c, i) => updates.push({ id: c.id, position: i }));
    }
    await persistChannelReorder(updates);
    await fetchData();
  };

  const moveCategory = async (categoryId: string, destIndex: number) => {
    const list = [...categories];
    const idx = list.findIndex((c) => c.id === categoryId);
    if (idx === -1) return;
    const [moved] = list.splice(idx, 1);
    const clampedIdx = Math.max(0, Math.min(destIndex, list.length));
    list.splice(clampedIdx, 0, moved);
    setCategories(list);
    await persistCategoryReorder(list.map((c, i) => ({ id: c.id, position: i })));
    await fetchData();
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [res, rolesRes, emojiRes] = await Promise.all([
      fetch(`/api/admin/categories?serverId=${encodeURIComponent(serverId)}`),
      fetch(`/api/admin/roles?serverId=${encodeURIComponent(serverId)}`),
      fetch(`/api/admin/emojis?serverId=${encodeURIComponent(serverId)}`),
    ]);
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories);
      setUncategorized(data.uncategorizedChannels);
    }
    if (rolesRes.ok) {
      const roles = await rolesRes.json();
      setCustomRoles(roles);
    }
    if (emojiRes.ok) {
      const { emojis } = await emojiRes.json();
      const map: Record<string, string> = {};
      for (const e of emojis as { name: string; url: string }[]) map[e.name] = e.url;
      setServerEmojis(map);
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateChannel = async () => {
    if (!newChannel.name.trim()) return;
    setSavingChannel(true);
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId,
        name: newChannel.name,
        type: newChannel.type,
        categoryId: newChannel.categoryId || null,
      }),
    });
    if (res.ok) {
      // Update emoji if provided
      if (newChannel.emoji.trim()) {
        const ch = await res.json();
        await fetch(`/api/admin/channels/${ch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: newChannel.emoji }),
        });
      }
      setNewChannel({ name: '', type: 'text', categoryId: '', emoji: '' });
      setShowNewChannel(false);
      await fetchData();
    }
    setSavingChannel(false);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    const res = await fetch(`/api/admin/categories?serverId=${encodeURIComponent(serverId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName }),
    });
    if (res.ok) {
      setNewCategoryName('');
      setShowNewCategory(false);
      await fetchData();
    }
    setSavingCategory(false);
  };

  const handleEditChannel = async (id: string) => {
    const res = await fetch(`/api/admin/channels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editChannelData.name,
        emoji: editChannelData.emoji || null,
        description: editChannelData.description,
        type: editChannelData.type,
        writePermission: editChannelData.writePermission,
        writeRoleIds: editChannelData.writePermission === 'roles' ? editChannelData.writeRoleIds : [],
      }),
    });
    if (res.ok) {
      setEditingChannel(null);
      await fetchData();
    }
  };

  const handleEditCategory = async (id: string) => {
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editCategoryName }),
    });
    if (res.ok) {
      setEditingCategory(null);
      await fetchData();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const url = deleteTarget.type === 'channel'
      ? `/api/admin/channels/${deleteTarget.id}`
      : `/api/admin/categories/${deleteTarget.id}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      setDeleteTarget(null);
      await fetchData();
    }
  };

  const startEditChannel = (ch: AdminChannel) => {
    setEditingChannel(ch.id);
    setEditChannelData({
      name: ch.name,
      emoji: ch.emoji || '',
      description: ch.description || '',
      type: ch.type,
      writePermission: (ch.writePermission as WritePermissionValue) || 'everyone',
      writeRoleIds: ch.writeRoleIds ?? [],
    });
  };

  const startEditCategory = (cat: AdminCategory) => {
    setEditingCategory(cat.id);
    setEditCategoryName(cat.name);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 lc-skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  const renderChannelRow = (ch: AdminChannel, index: number, parentCatId: string | null) => (
    <div
      key={ch.id}
      draggable={editingChannel !== ch.id}
      onDragStart={(e) => {
        setDraggedChannel({ id: ch.id, sourceCategoryId: parentCatId });
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setDraggedChannel(null);
        setDropTarget(null);
      }}
      onDragOver={(e) => {
        if (!draggedChannel) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(`ch:${ch.id}`);
      }}
      onDragLeave={() => {
        if (dropTarget === `ch:${ch.id}`) setDropTarget(null);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedChannel || draggedChannel.id === ch.id) {
          setDropTarget(null);
          return;
        }
        await moveChannel(draggedChannel.id, draggedChannel.sourceCategoryId, parentCatId, index);
        setDraggedChannel(null);
        setDropTarget(null);
      }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-lc-card/50 group cursor-move ${
        dropTarget === `ch:${ch.id}` ? 'ring-1 ring-lc-green' : ''
      } ${draggedChannel?.id === ch.id ? 'opacity-40' : ''}`}
      data-testid="channel-row"
    >
      <span className="text-lc-muted/60 select-none shrink-0" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
      {editingChannel === ch.id ? (
        <div className="flex-1 flex flex-col gap-4 p-4 rounded-xl border border-lc-border bg-lc-dark/80">
          {/* Header row: name/emoji/type */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-end">
            <div className="relative">
              <label className="text-[11px] font-medium text-lc-muted block mb-1">Emoji</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEmojiPickerOpen((v) => !v)}
                  className="w-14 h-9 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm flex items-center justify-center hover:border-lc-green focus:border-lc-green focus:outline-none"
                  title="Pick emoji"
                  data-testid="edit-channel-emoji-btn"
                >
                  {editChannelData.emoji ? (
                    <ChannelEmoji value={editChannelData.emoji} imgClassName="w-5 h-5 object-contain" className="text-base" />
                  ) : (
                    <span className="text-lc-muted">＋</span>
                  )}
                </button>
                {editChannelData.emoji && (
                  <button
                    type="button"
                    onClick={() => setEditChannelData({ ...editChannelData, emoji: '' })}
                    className="text-lc-muted hover:text-red-400 text-xs px-1"
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>
              {emojiPickerOpen && (
                <EmojiPicker
                  className="absolute top-full left-0 mt-2 z-50"
                  serverEmojis={serverEmojis}
                  onSelect={(val) => {
                    const match = /^:([a-z0-9_-]+):$/i.exec(val);
                    if (match && serverEmojis[match[1]]) {
                      setEditChannelData((prev) => ({ ...prev, emoji: serverEmojis[match[1]] }));
                    } else {
                      setEditChannelData((prev) => ({ ...prev, emoji: val }));
                    }
                    setEmojiPickerOpen(false);
                  }}
                  onClose={() => setEmojiPickerOpen(false)}
                />
              )}
            </div>
            <div>
              <label className="text-[11px] font-medium text-lc-muted block mb-1">Name</label>
              <input
                value={editChannelData.name}
                onChange={(e) => setEditChannelData({ ...editChannelData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                data-testid="edit-channel-name"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-lc-muted block mb-1">Type</label>
              <select
                value={editChannelData.type}
                onChange={(e) => setEditChannelData({ ...editChannelData, type: e.target.value })}
                className="px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              >
                <option value="text">Text</option>
                <option value="voice">Voice</option>
                <option value="forum">Forum</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-medium text-lc-muted block mb-1">
              Description <span className="text-lc-muted/60">(channel topic)</span>
            </label>
            <textarea
              value={editChannelData.description}
              onChange={(e) => setEditChannelData({ ...editChannelData, description: e.target.value })}
              maxLength={1024}
              rows={3}
              placeholder="What is this channel about?"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm resize-y focus:border-lc-green focus:outline-none"
              data-testid="edit-channel-description"
            />
          </div>

          {/* Who can post */}
          <div>
            <label className="text-[11px] font-medium text-lc-muted block mb-1">Who can post</label>
            <select
              value={editChannelData.writePermission}
              onChange={(e) =>
                setEditChannelData({
                  ...editChannelData,
                  writePermission: e.target.value as WritePermissionValue,
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="edit-channel-write-permission"
            >
              <option value="everyone">Everyone</option>
              <option value="mod">Mods &amp; admins only</option>
              <option value="admin">Admins only</option>
              <option value="roles">Specific roles…</option>
            </select>

            {editChannelData.writePermission === 'roles' && (
              <div
                className="mt-2 p-3 rounded-lg border border-lc-border bg-lc-black/60"
                data-testid="edit-channel-role-picker"
              >
                <div className="text-[11px] text-lc-muted mb-2">
                  Members who hold <strong>any</strong> of these roles can post. Admins &amp; owners always can.
                </div>
                {customRoles.length === 0 ? (
                  <div className="text-xs text-lc-muted italic">
                    No custom roles yet — create one in the Roles section first.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {customRoles.map((r) => {
                      const checked = editChannelData.writeRoleIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border transition-colors ${
                            checked
                              ? 'bg-lc-green/15 border-lc-green text-lc-white'
                              : 'bg-lc-black border-lc-border text-lc-muted hover:text-lc-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => {
                              setEditChannelData((prev) => ({
                                ...prev,
                                writeRoleIds: checked
                                  ? prev.writeRoleIds.filter((id) => id !== r.id)
                                  : [...prev.writeRoleIds, r.id],
                              }));
                            }}
                          />
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: r.color }}
                          />
                          {r.icon && <span>{r.icon}</span>}
                          <span>{r.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setEditingChannel(null)} className="lc-pill-secondary px-4 py-1.5 text-xs text-lc-white">
              Cancel
            </button>
            <button onClick={() => handleEditChannel(ch.id)} className="lc-pill-primary px-4 py-1.5 text-xs font-medium">
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="text-sm text-lc-muted">
            {ch.type === 'forum' ? '💬' : ch.type === 'voice' ? '🎙' : '#'}
          </span>
          {ch.emoji && <ChannelEmoji value={ch.emoji} />}
          <span className="text-sm text-lc-white flex-1">{ch.name}</span>
          <span className="text-xs text-lc-muted">{ch.type}</span>
          <div className="hidden group-hover:flex items-center gap-1">
            <button onClick={() => startEditChannel(ch)} className="text-xs text-lc-muted hover:text-lc-white px-2 py-1">
              Edit
            </button>
            <button
              onClick={() => setDeleteTarget({ type: 'channel', id: ch.id, name: ch.name })}
              className="text-xs text-lc-muted hover:text-red-500 px-2 py-1"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowNewChannel(!showNewChannel)}
          className="lc-pill-primary px-4 py-2 text-sm font-medium"
          data-testid="new-channel-btn"
        >
          New Channel
        </button>
        <button
          onClick={() => setShowNewCategory(!showNewCategory)}
          className="lc-pill-secondary px-4 py-2 text-sm font-medium text-lc-white"
          data-testid="new-category-btn"
        >
          New Category
        </button>
      </div>

      {/* New Channel Form */}
      {showNewChannel && (
        <div className="p-4 rounded-xl border border-lc-border bg-lc-dark space-y-3" data-testid="new-channel-form">
          <div className="flex gap-2">
            <input
              value={newChannel.emoji}
              onChange={(e) => setNewChannel({ ...newChannel, emoji: e.target.value })}
              placeholder="Emoji"
              className="w-16 px-2 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm text-center"
            />
            <input
              value={newChannel.name}
              onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
              placeholder="Channel name"
              className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="new-channel-name"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={newChannel.type}
              onChange={(e) => setNewChannel({ ...newChannel, type: e.target.value })}
              className="px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="forum">Forum</option>
            </select>
            <select
              value={newChannel.categoryId}
              onChange={(e) => setNewChannel({ ...newChannel, categoryId: e.target.value })}
              className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateChannel}
              disabled={savingChannel || !newChannel.name.trim()}
              className="lc-pill-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {savingChannel ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowNewChannel(false)}
              className="text-sm text-lc-muted hover:text-lc-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New Category Form */}
      {showNewCategory && (
        <div className="p-4 rounded-xl border border-lc-border bg-lc-dark flex gap-2 items-center" data-testid="new-category-form">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
            data-testid="new-category-name"
          />
          <button
            onClick={handleCreateCategory}
            disabled={savingCategory || !newCategoryName.trim()}
            className="lc-pill-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingCategory ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => setShowNewCategory(false)}
            className="text-sm text-lc-muted hover:text-lc-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Uncategorized channels */}
      {uncategorized.length > 0 && (
        <div
          onDragOver={(e) => {
            if (!draggedChannel) return;
            e.preventDefault();
          }}
          onDrop={async (e) => {
            if (!draggedChannel) return;
            e.preventDefault();
            await moveChannel(draggedChannel.id, draggedChannel.sourceCategoryId, null, uncategorized.length);
            setDraggedChannel(null);
            setDropTarget(null);
          }}
        >
          <h3 className="text-xs font-semibold text-lc-muted uppercase tracking-wider mb-2">
            Uncategorized
          </h3>
          {uncategorized.map((ch, i) => renderChannelRow(ch, i, null))}
        </div>
      )}

      {/* Categories with channels */}
      {categories.map((cat, catIndex) => (
        <div
          key={cat.id}
          onDragOver={(e) => {
            if (draggedChannel) {
              e.preventDefault();
            }
          }}
          onDrop={async (e) => {
            if (!draggedChannel) return;
            e.preventDefault();
            await moveChannel(draggedChannel.id, draggedChannel.sourceCategoryId, cat.id, cat.channels.length);
            setDraggedChannel(null);
            setDropTarget(null);
          }}
        >
          <div
            draggable={editingCategory !== cat.id}
            onDragStart={(e) => {
              if (draggedChannel) return;
              setDraggedCategory(cat.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedCategory(null);
              setDropTarget(null);
            }}
            onDragOver={(e) => {
              if (!draggedCategory || draggedCategory === cat.id) return;
              e.preventDefault();
              setDropTarget(`cat-header:${cat.id}`);
            }}
            onDragLeave={() => {
              if (dropTarget === `cat-header:${cat.id}`) setDropTarget(null);
            }}
            onDrop={async (e) => {
              if (!draggedCategory || draggedCategory === cat.id) return;
              e.preventDefault();
              e.stopPropagation();
              await moveCategory(draggedCategory, catIndex);
              setDraggedCategory(null);
              setDropTarget(null);
            }}
            className={`flex items-center gap-2 mb-2 group cursor-move rounded-lg px-1 py-1 ${
              dropTarget === `cat-header:${cat.id}` ? 'ring-1 ring-lc-green' : ''
            } ${draggedCategory === cat.id ? 'opacity-40' : ''}`}
          >
            {editingCategory === cat.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  className="flex-1 px-2 py-1 rounded bg-lc-black border border-lc-border text-lc-white text-sm"
                  data-testid="edit-category-name"
                />
                <button onClick={() => handleEditCategory(cat.id)} className="text-xs text-lc-green hover:underline">Save</button>
                <button onClick={() => setEditingCategory(null)} className="text-xs text-lc-muted hover:underline">Cancel</button>
              </div>
            ) : (
              <>
                <span className="text-lc-muted/60 select-none shrink-0" aria-hidden="true" title="Drag to reorder category">⋮⋮</span>
                <h3 className="text-xs font-semibold text-lc-muted uppercase tracking-wider flex-1">
                  {cat.name}
                </h3>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={() => startEditCategory(cat)} className="text-xs text-lc-muted hover:text-lc-white px-2 py-1">
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })}
                    className="text-xs text-lc-muted hover:text-red-500 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
          {cat.channels.length > 0 ? (
            cat.channels.map((ch, i) => renderChannelRow(ch, i, cat.id))
          ) : (
            <p className="text-xs text-lc-muted pl-3 py-2 italic">
              {draggedChannel ? 'Drop here to add to this category' : 'No channels in this category'}
            </p>
          )}
        </div>
      ))}

      {categories.length === 0 && uncategorized.length === 0 && (
        <p className="text-sm text-lc-muted py-8 text-center">No channels yet. Create one to get started.</p>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.type === 'channel' ? 'Channel' : 'Category'}`}
          message={
            deleteTarget.type === 'channel'
              ? `Delete #${deleteTarget.name}? All messages in this channel will be lost.`
              : `Delete category "${deleteTarget.name}"? Channels in it will become uncategorized.`
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
