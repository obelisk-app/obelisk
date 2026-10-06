'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useChannelActions } from '@/hooks/chat/useChannelActions';
import { useMutedLabel } from '@/hooks/chat/useMutedLabel';
import Sheet from '@/components/ui/Sheet';
import { MUTE_OPTIONS, NOTIFY_OPTIONS, type ChannelMenuTarget } from '@/utils/chat/channel-menu-options';

/** The phone's long-press version of the channel menu, as a sheet with drill-in views. */
export function ChannelActionSheet({ target, onClose }: { target: ChannelMenuTarget; onClose: () => void }) {
  const t = useTranslations();
  const a = useChannelActions(target);
  const mutedLabel = useMutedLabel(a.muted ? a.pref.mutedUntil : undefined);
  const [view, setView] = useState<'main' | 'mute' | 'notify'>('main');
  const act = (fn: () => void) => () => { fn(); onClose(); };

  const row = (label: string, onClick: () => void, opts: { hint?: string | null; testId: string; disabled?: boolean; chevron?: boolean; checked?: boolean } ) => (
    <button
      key={opts.testId}
      type="button"
      className="settings-row action"
      style={{ width: '100%', opacity: opts.disabled ? 0.45 : 1 }}
      disabled={opts.disabled}
      onClick={onClick}
      data-testid={opts.testId}
      role={opts.checked === undefined ? undefined : 'menuitemradio'}
      aria-checked={opts.checked}
    >
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <span style={{ display: 'block' }}>{label}</span>
        {opts.hint && <span className="settings-row-meta muted" style={{ display: 'block', marginTop: 3 }}>{opts.hint}</span>}
      </span>
      {opts.chevron && <span className="settings-row-meta muted" aria-hidden="true">›</span>}
      {opts.checked !== undefined && <span className={`toggle ${opts.checked ? 'on' : ''}`} aria-hidden="true" />}
    </button>
  );

  return (
    <Sheet onClose={onClose} screen="channel-menu" label={target.name} testId="channel-action-sheet" maxHeight="88%">
      <div style={{ padding: '4px 4px 12px', fontSize: 16, fontWeight: 700, color: 'var(--app-text)' }}>
        {view === 'main' ? `# ${target.name}` : (
          <button type="button" onClick={() => setView('main')} style={{ background: 'none', border: 0, color: 'var(--app-text)', font: 'inherit', padding: 0 }}>
            ‹ {view === 'mute' ? t('chat.channelMenu.mute.label') : t('chat.channelMenu.notify.label')}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {view === 'main' && <>
          {row(t('chat.channelMenu.markRead'), act(a.markRead), { testId: 'channel-menu-mark-read', disabled: !target.hasUnread })}
          {row(a.following ? t('chat.channelMenu.unfollow') : t('chat.channelMenu.follow'), act(a.toggleFollow), {
            testId: 'channel-menu-follow',
            hint: a.following ? t('chat.channelMenu.unfollowHint') : null,
          })}
          {a.muted
            ? row(t('chat.channelMenu.unmute'), act(a.unmute), { testId: 'channel-menu-unmute', hint: mutedLabel })
            : row(t('chat.channelMenu.mute.label'), () => setView('mute'), { testId: 'channel-menu-mute', chevron: true })}
          {row(t('chat.channelMenu.notify.label'), () => setView('notify'), { testId: 'channel-menu-notify', chevron: true, hint: t(`chat.channelMenu.notify.${a.level}`) })}
          {row(t('chat.channelMenu.copyLink'), act(() => void a.copyLink()), { testId: 'channel-menu-copy-link' })}
        </>}
        {view === 'mute' && MUTE_OPTIONS.map((o) => row(t(o.key), act(() => a.mute(o.ms)), { testId: `channel-menu-mute-${o.ms}` }))}
        {view === 'notify' && NOTIFY_OPTIONS.map((o) => row(t(o.key), act(() => a.setLevel(o.level)), {
          testId: `channel-menu-notify-${o.level}`,
          checked: a.level === o.level,
        }))}
      </div>
    </Sheet>
  );
}
