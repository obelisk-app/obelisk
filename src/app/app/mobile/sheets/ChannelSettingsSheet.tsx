'use client';

import { useId } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import { useChannelSettingsForm } from '@/hooks/chat/useChannelSettingsForm';
import ForumTagsEditor from '@/components/chat/ForumTagsEditor';
import { ChannelAppearanceInput } from '@/components/media/BlossomImageInput';
import { useTranslation } from '@/i18n/context';
import { CHANNEL_KIND_LABEL } from '../labels';
import { ManageMemberRowMobile } from './ManageMemberRowMobile';
import Sheet from '@/components/ui/Sheet';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import Checkbox from '@/components/ui/Checkbox';
import SheetActions from './SheetActions';

// Bottom-sheet for per-channel admin settings (kind 9002 metadata edits +
// kind 9000/9001/9003 member management). Mirrors the desktop
// ChannelSettingsModal but trimmed to fit a phone - SFU pin + advanced fields
// stay desktop-only for now; admins can still toggle the channel kind to
// voice-sfu which falls through to the env-var defaults.
export function ChannelSettingsSheet({
  group,
  close,
}: {
  group: JsGroup;
  close: () => void;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const aboutId = useId();
  const sfuUrlId = useId();
  const newMemberId = useId();
  const {
    name, about, picture, banner, access, channelKind, forumTags,
    setName, setAbout, setPicture, setBanner, setAccess, setChannelKind, setForumTags,
    savingMeta, metaError: metaErr, saveMeta,
    sfuUrl, setSfuUrl, sfuChecking, sfuVerified, verifySfu,
    adminSet, allPubkeys,
    newMember, setNewMember, makeAdmin, setMakeAdmin, memberBusy, memberError: memberErr, addMember,
  } = useChannelSettingsForm(group, close);

  const togglePillStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-line)'}`,
    background: active ? 'rgba(180, 249, 83, 0.08)' : 'var(--app-surface)',
    color: active ? 'var(--accent)' : 'var(--app-text-dim)',
    fontWeight: 600,
    fontSize: 12,
    textAlign: 'center',
    cursor: 'pointer',
  });

  return (
    <Sheet onClose={close} screen="channel-settings" label={`Channel settings · #${group.name ?? group.id.slice(0, 8)}`} maxHeight="94%">
      <div className="zap-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        Channel settings · #{group.name ?? group.id.slice(0, 8)}
      </div>

      {/* Appearance */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ChannelAppearanceInput
          picture={picture}
          banner={banner}
          onPictureChange={setPicture}
          onBannerChange={setBanner}
        />
      </section>

      {/* Basics */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={nameId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('mobile.field.name')}</label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="mobile-channel-settings-name"
          />
        </div>
        <label htmlFor={aboutId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('mobile.field.description')}</label>
        <div className="setup-input-wrap">
          <TextArea
            variant="mobile"
            id={aboutId}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={2}
            placeholder={t('mobile.channel.descriptionPlaceholder')}
          />
        </div>
      </section>


      {/* Access */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('mobile.channel.access')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" data-testid="mobile-channel-access-public" style={togglePillStyle(access === 'public')} onClick={() => setAccess('public')}>
            <div style={{ fontSize: 16 }}>🌐</div>
            <div>{t('mobile.channel.public')}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{t('mobile.channel.publicHint')}</div>
          </button>
          <button type="button" data-testid="mobile-channel-access-read-only" style={togglePillStyle(access === 'read-only')} onClick={() => setAccess('read-only')}>
            <div style={{ fontSize: 16 }}>👁</div>
            <div>{t('mobile.channel.readOnly')}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{t('mobile.channel.readOnlyHint')}</div>
          </button>
          <button type="button" data-testid="mobile-channel-access-private" style={togglePillStyle(access === 'private')} onClick={() => setAccess('private')}>
            <div style={{ fontSize: 16 }}>🔒</div>
            <div>{t('mobile.channel.private')}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{t('mobile.channel.privateHint')}</div>
          </button>
        </div>
      </section>

      {/* Channel kind */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('mobile.channel.type')}</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['text', 'voice', 'voice-sfu', 'forum'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setChannelKind(k)}
              style={{
                flex: '1 1 calc(50% - 6px)',
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${channelKind === k ? 'var(--accent)' : 'var(--app-line)'}`,
                background: channelKind === k ? 'rgba(180, 249, 83, 0.08)' : 'var(--app-surface)',
                color: channelKind === k ? 'var(--accent)' : 'var(--app-text-dim)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {CHANNEL_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {channelKind === 'voice-sfu' && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--app-line)', borderRadius: 12, background: 'var(--app-surface)' }}
            data-testid="mobile-sfu-section"
          >
            <label htmlFor={sfuUrlId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('desktop.sfu.url')}</label>
            <p style={{ fontSize: 11, color: 'var(--app-text-dim)', margin: 0 }}>{t('desktop.sfu.verifyHelp')}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="setup-input-wrap" style={{ flex: 1, minWidth: 0 }}>
                <Input
                  variant="mobile"
                  id={sfuUrlId}
                  value={sfuUrl}
                  onChange={(e) => setSfuUrl(e.target.value)}
                  spellCheck={false}
                  placeholder="https://sfu.obelisk.ar"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                  data-testid="mobile-sfu-url"
                />
              </div>
              <button
                type="button"
                onClick={() => { void verifySfu().catch(() => undefined); }}
                disabled={sfuChecking}
                className="btn-cancel"
                style={{ width: 'auto', padding: '0 14px', flexShrink: 0 }}
                data-testid="mobile-sfu-verify"
              >
                {sfuChecking ? 'Checking…' : 'Verify'}
              </button>
            </div>
            {sfuVerified && (
              <div style={{ fontSize: 11, color: 'var(--app-text-dim)' }} data-testid="mobile-sfu-verified">
                <span style={{ color: 'var(--accent)' }}>{t('desktop.sfu.verified')}</span>
                {sfuVerified.region ? ` · ${sfuVerified.region}` : ''}
                {sfuVerified.cap ? ` · up to ${sfuVerified.cap} participants` : ''}
                <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{sfuVerified.pubkey}</div>
              </div>
            )}
          </div>
        )}
      </section>

      {channelKind === 'forum' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="mobile-forum-tags-editor">
          <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('desktop.channel.forumTags')}</label>
          <ForumTagsEditor value={forumTags} onChange={setForumTags} />
        </section>
      )}

      {metaErr && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{metaErr}</div>}
      <button
        type="button"
        onClick={() => void saveMeta()}
        disabled={savingMeta}
        className="btn-primary"
        data-testid="mobile-channel-settings-save"
      >
        {savingMeta ? 'Saving…' : 'Save channel'}
      </button>

      {/* Members */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={newMemberId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {t('mobile.members.addHelp')}
        </label>
        <form onSubmit={(e) => void addMember(e)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="setup-input-wrap">
            <Input
              variant="mobile"
              id={newMemberId}
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              placeholder={t('mobile.members.addPlaceholder')}
              spellCheck={false}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--app-text-dim)' }}>
            <Checkbox
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
              aria-label={t('mobile.members.promote')}
            />
            {t('mobile.members.promote')}
          </label>
          {memberErr && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{memberErr}</div>}
          <button
            type="submit"
            disabled={memberBusy || !newMember.trim()}
            className="btn-primary"
            style={{ width: 'auto', alignSelf: 'flex-start', padding: '0 18px', boxShadow: 'none' }}
          >
            {memberBusy ? 'Adding…' : 'Add'}
          </button>
        </form>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Members · {allPubkeys.length}
        </label>
        {allPubkeys.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--app-text-mute)', padding: '6px 4px' }}>
            {t('mobile.members.emptyHelp')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '40vh', overflowY: 'auto' }}>
            {allPubkeys.map((pk) => (
              <ManageMemberRowMobile
                key={pk}
                groupId={group.id}
                pubkey={pk}
                isAdmin={adminSet.has(pk)}
              />
            ))}
          </div>
        )}
      </section>

      <SheetActions onCancel={close} dismiss="close" />
    </Sheet>
  );
}
