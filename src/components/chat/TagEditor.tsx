'use client';

import { useMemo, useRef, useState } from 'react';
import type { ForumTag } from '@/store/chat';
import EmojiPicker from './EmojiPicker';

export interface TagDraft {
  id?: string;
  name: string;
  color: string;
}

const DEFAULT_COLOR = '#b4f953';
const MAX_NAME = 32;

interface Props {
  available: ForumTag[];
  value: TagDraft[];
  onChange: (next: TagDraft[]) => void;
  serverEmojis?: Record<string, string>;
}

// Inline tag editor for forum posts. Users can toggle existing channel tags,
// or type a brand-new tag name (emoji allowed via the picker button or the
// keyboard). Enter or comma commits the draft. The parent decides how to
// persist new tags — this component just reports the set of current tags.
export default function TagEditor({ available, value, onChange, serverEmojis }: Props) {
  const [draft, setDraft] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedNames = useMemo(
    () => new Set(value.map((t) => t.name.toLowerCase())),
    [value],
  );
  const suggestions = available.filter((t) => !selectedNames.has(t.name.toLowerCase()));

  const addTag = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
    if (!name) return;
    if (selectedNames.has(name.toLowerCase())) return;
    const match = available.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const next: TagDraft = match
      ? { id: match.id, name: match.name, color: match.color }
      : { name, color: DEFAULT_COLOR };
    onChange([...value, next]);
    setDraft('');
  };

  const removeAt = (idx: number) => {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg bg-lc-black border border-lc-border px-2 py-1.5 focus-within:border-lc-green"
        data-testid="tag-editor"
      >
        {value.map((tag, idx) => (
          <span
            key={`${tag.id ?? 'new'}-${tag.name}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: tag.color + '20',
              color: tag.color,
              border: `1px solid ${tag.color}40`,
            }}
            data-testid="tag-editor-chip"
          >
            {tag.name}
            <button
              type="button"
              onClick={() => removeAt(idx)}
              aria-label={`Remove ${tag.name}`}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_NAME))}
          onKeyDown={onKeyDown}
          onBlur={() => { if (draft.trim()) addTag(draft); }}
          placeholder={value.length === 0 ? 'Add tags (Enter to confirm)…' : ''}
          className="flex-1 min-w-[8ch] bg-transparent text-sm text-lc-white placeholder:text-lc-muted focus:outline-none py-0.5"
          data-testid="tag-editor-input"
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="text-lc-muted hover:text-lc-white text-sm px-1"
            aria-label="Insert emoji"
            data-testid="tag-editor-emoji-btn"
          >
            😊
          </button>
          {showPicker && (
            <EmojiPicker
              className="absolute right-0 top-full mt-1 z-50"
              serverEmojis={serverEmojis}
              onSelect={(emoji) => {
                setShowPicker(false);
                // emoji-mart returns unicode for standard emojis and `:name:`
                // for server-custom ones. Only unicode makes sense inside a
                // tag label, so we strip shortcodes silently.
                if (emoji.startsWith(':') && emoji.endsWith(':')) return;
                setDraft((d) => (d + emoji).slice(0, MAX_NAME));
                inputRef.current?.focus();
              }}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="tag-editor-suggestions">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag.name)}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium opacity-60 hover:opacity-100 transition-opacity"
              style={{
                backgroundColor: tag.color + '15',
                color: tag.color,
                border: `1px solid ${tag.color}30`,
              }}
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function splitDrafts(drafts: TagDraft[]): { tagIds: string[]; tagNames: string[] } {
  const tagIds: string[] = [];
  const tagNames: string[] = [];
  for (const d of drafts) {
    if (d.id) tagIds.push(d.id);
    else tagNames.push(d.name);
  }
  return { tagIds, tagNames };
}
