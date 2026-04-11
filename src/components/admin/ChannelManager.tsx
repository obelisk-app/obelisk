'use client';

import { useEffect, useState, useCallback } from 'react';
import ConfirmDialog from './ConfirmDialog';

interface AdminChannel {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
  position: number;
  categoryId: string | null;
  writePermission: string | null;
}

type WritePermissionValue = 'everyone' | 'mod' | 'admin';

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
    type: string;
    writePermission: WritePermissionValue;
  }>({ name: '', emoji: '', type: 'text', writePermission: 'everyone' });
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'channel' | 'category'; id: string; name: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/categories?serverId=${encodeURIComponent(serverId)}`);
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories);
      setUncategorized(data.uncategorizedChannels);
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
        type: editChannelData.type,
        writePermission: editChannelData.writePermission,
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
      type: ch.type,
      writePermission: (ch.writePermission as WritePermissionValue) || 'everyone',
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

  const renderChannelRow = (ch: AdminChannel) => (
    <div key={ch.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-lc-card/50 group" data-testid="channel-row">
      {editingChannel === ch.id ? (
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              value={editChannelData.emoji}
              onChange={(e) => setEditChannelData({ ...editChannelData, emoji: e.target.value })}
              placeholder="Emoji"
              className="w-12 px-1 py-1 rounded bg-lc-black border border-lc-border text-lc-white text-sm text-center"
            />
            <input
              value={editChannelData.name}
              onChange={(e) => setEditChannelData({ ...editChannelData, name: e.target.value })}
              className="flex-1 px-2 py-1 rounded bg-lc-black border border-lc-border text-lc-white text-sm"
              data-testid="edit-channel-name"
            />
            <select
              value={editChannelData.type}
              onChange={(e) => setEditChannelData({ ...editChannelData, type: e.target.value })}
              className="text-xs bg-lc-black border border-lc-border rounded px-2 py-1 text-lc-white"
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="forum">Forum</option>
            </select>
            <button onClick={() => handleEditChannel(ch.id)} className="text-xs text-lc-green hover:underline">Save</button>
            <button onClick={() => setEditingChannel(null)} className="text-xs text-lc-muted hover:underline">Cancel</button>
          </div>
          <div className="flex items-center gap-2 pl-14">
            <label className="text-xs text-lc-muted">Who can post:</label>
            <select
              value={editChannelData.writePermission}
              onChange={(e) =>
                setEditChannelData({
                  ...editChannelData,
                  writePermission: e.target.value as WritePermissionValue,
                })
              }
              className="text-xs bg-lc-black border border-lc-border rounded px-2 py-1 text-lc-white"
              data-testid="edit-channel-write-permission"
            >
              <option value="everyone">Everyone</option>
              <option value="mod">Mods &amp; admins only</option>
              <option value="admin">Admins only</option>
            </select>
          </div>
        </div>
      ) : (
        <>
          <span className="text-sm text-lc-muted">
            {ch.type === 'forum' ? '💬' : ch.type === 'voice' ? '🎙' : '#'}
          </span>
          {ch.emoji && <span className="text-sm">{ch.emoji}</span>}
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
        <div>
          <h3 className="text-xs font-semibold text-lc-muted uppercase tracking-wider mb-2">
            Uncategorized
          </h3>
          {uncategorized.map(renderChannelRow)}
        </div>
      )}

      {/* Categories with channels */}
      {categories.map((cat) => (
        <div key={cat.id}>
          <div className="flex items-center gap-2 mb-2 group">
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
            cat.channels.map(renderChannelRow)
          ) : (
            <p className="text-xs text-lc-muted pl-3 py-2">No channels in this category</p>
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
