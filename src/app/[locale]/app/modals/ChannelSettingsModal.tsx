'use client';

import { useId } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import TextArea from '@/components/ui/TextArea';
import Input from '@/components/ui/Input';
import ModalHeader from '@/components/ui/ModalHeader';
import ModalFooter from '@/components/ui/ModalFooter';
import { useChannelSettingsForm } from '@/hooks/chat/useChannelSettingsForm';
import ForumTagsEditor from '@/components/chat/ForumTagsEditor';
import { ChannelAppearanceInput } from '@/components/media/BlossomImageInput';
import { useTranslations } from 'next-intl';
import { ManageMemberRow } from './ManageMemberRow';
import { Field, SectionHeader, ToggleCard } from './form-primitives';
import Chip from '@/components/ui/Chip';

export function ChannelSettingsModal({ group, onClose }: { group: JsGroup; onClose: () => void }) {
  const t = useTranslations();
  const sfuUrlId = useId();
  const {
    name, about, picture, banner, access, channelKind, forumTags,
    setName, setAbout, setPicture, setBanner, setAccess, setChannelKind, setForumTags,
    savingMeta, metaError: metaErr, saveMeta,
    sfuUrl, setSfuUrl, sfuChecking, sfuVerified, verifySfu,
    members, adminSet,
    newMember, setNewMember, makeAdmin, setMakeAdmin, memberBusy, memberError: memberErr, addMember,
  } = useChannelSettingsForm(group, onClose);

  return (
    <Modal
      onClose={onClose}
      panelClassName="lc-card flex max-h-[90vh] w-full max-w-xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
        <ModalHeader title={t('shell.desktop.channel.settingsTitle', { name: group.name ?? group.id.slice(0, 8) })} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <form onSubmit={(e) => void saveMeta(e)} id="channel-meta-form" className="space-y-7 p-5">
            {/* Appearance ----------------------------------------------- */}
            <section className="space-y-4">
              <SectionHeader title={t('shell.desktop.branding.appearance')} />
              <ChannelAppearanceInput
                picture={picture}
                banner={banner}
                onPictureChange={setPicture}
                onBannerChange={setBanner}
              />
            </section>

            {/* Basics --------------------------------------------------- */}
            <section className="space-y-3">
              <Field label={t('mobile.field.name')}>
                <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('mobile.field.description')}>
                <TextArea
                  size="sm"
                  resize="both"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={2}
                  placeholder={t('mobile.channel.descriptionPlaceholder')}
                />
              </Field>
            </section>

            {/* Access --------------------------------------------------- */}
            <section className="space-y-3">
              <SectionHeader title={t('mobile.channel.access')} hint={t('shell.desktop.channel.accessHint')} />
              <div className="grid gap-2 sm:grid-cols-3">
                <ToggleCard
                  active={access === 'public'}
                  onClick={() => setAccess('public')}
                  icon="🌐"
                  title={t('mobile.channel.public')}
                  subtitle={t('shell.desktop.channel.publicHint')}
                />
                <ToggleCard
                  active={access === 'read-only'}
                  onClick={() => setAccess('read-only')}
                  icon="👁"
                  title={t('mobile.channel.readOnly')}
                  subtitle={t('shell.desktop.channel.readOnlyHint')}
                />
                <ToggleCard
                  active={access === 'private'}
                  onClick={() => setAccess('private')}
                  icon="🔒"
                  title={t('mobile.channel.private')}
                  subtitle={t('shell.desktop.channel.privateHint')}
                />
              </div>
            </section>

            {/* Channel type --------------------------------------------- */}
            <section className="space-y-3">
              <SectionHeader title={t('mobile.channel.type')} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <ToggleCard
                  active={channelKind === 'text'}
                  onClick={() => setChannelKind('text')}
                  icon="💬"
                  title={t('shell.desktop.channel.kindText')}
                  subtitle={t('shell.desktop.channel.textHint')}
                />
                <ToggleCard
                  active={channelKind === 'voice'}
                  onClick={() => setChannelKind('voice')}
                  icon="🎙️"
                  title={t('shell.desktop.channel.kindVoice')}
                  subtitle={t('shell.desktop.channel.voiceHint')}
                />
                <ToggleCard
                  active={channelKind === 'voice-sfu'}
                  onClick={() => setChannelKind('voice-sfu')}
                  icon="📡"
                  title={t('shell.desktop.channel.kindSfu')}
                  subtitle={t('shell.desktop.channel.sfuHint')}
                />
                <ToggleCard
                  active={channelKind === 'forum'}
                  onClick={() => setChannelKind('forum')}
                  icon="📋"
                  title={t('shell.desktop.channel.kindForum')}
                  subtitle={t('shell.desktop.channel.forumHint')}
                />
              </div>
              {channelKind === 'voice' && (
                <p className="text-[11px] text-lc-muted">
                  {t.rich('shell.desktop.channel.voiceHelp', {
                    tag: () => <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice&quot;]</code>,
                    url: () => <code className="text-lc-white/80">/voice/{group.id.slice(0, 8)}…</code>,
                  })}
                </p>
              )}
              {channelKind === 'voice-sfu' && (
                <>
                  <p className="text-[11px] text-lc-muted">
                    {t.rich('shell.desktop.channel.sfuHelp', {
                      tag: () => <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice-sfu&quot;]</code>,
                    })}
                  </p>
                  <div className="space-y-2 rounded-lg border border-lc-border bg-lc-black/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-lc-muted">{t('shell.desktop.sfu.operator')}</p>
                    <p className="text-[11px] text-lc-muted">
                      {t.rich('shell.desktop.sfu.help', {
                        info: () => <code className="text-lc-white/80">/info</code>,
                      })}
                    </p>
                    <div>
                      <label htmlFor={sfuUrlId} className="text-[11px] text-lc-muted">{t('shell.desktop.sfu.url')}</label>
                      <div className="flex gap-2">
                        <Input
                          id={sfuUrlId}
                          size="sm"
                          fontSize="xs"
                          value={sfuUrl}
                          onChange={(e) => setSfuUrl(e.target.value)}
                          spellCheck={false}
                          className="min-w-0 flex-1 font-mono"
                          placeholder="https://sfu.obelisk.ar"
                        />
                        <Button
                          variant="pillSecondary"
                          size="xs"
                          onClick={() => { void verifySfu().catch(() => undefined); }}
                          disabled={sfuChecking}
                          className="shrink-0"
                        >
                          {sfuChecking ? t('shell.desktop.sfu.checking') : t('shell.desktop.sfu.verify')}
                        </Button>
                      </div>
                    </div>
                    {sfuVerified && (
                      <div className="rounded-md border border-lc-green/30 bg-lc-green/5 p-2 text-[11px] text-lc-muted">
                        <span className="text-lc-green">{t('shell.desktop.sfu.verified')}</span>
                        {sfuVerified.region ? ` · ${sfuVerified.region}` : ''}
                        {sfuVerified.cap ? ` · ${t('shell.desktop.sfu.capacity', { count: sfuVerified.cap })}` : ''}
                        <div className="mt-1 break-all font-mono text-lc-white/70">{sfuVerified.pubkey}</div>
                      </div>
                    )}
                    <p className="text-[10px] text-lc-muted">{t('shell.desktop.sfu.verifyHelp')}</p>
                  </div>
                </>
              )}
              {channelKind === 'forum' && (
                <p className="text-[11px] text-lc-muted">
                  {t.rich('shell.desktop.channel.forumHelp', {
                    tag: () => <code className="text-lc-white/80">[&quot;t&quot;,&quot;forum&quot;]</code>,
                  })}
                </p>
              )}
            </section>

            {channelKind === 'forum' && (
              <section className="space-y-3" data-testid="forum-tags-editor">
                <SectionHeader
                  title={t('shell.desktop.channel.forumTags')}
                  hint={t('shell.desktop.channel.forumTagsHint')}
                />
                <p className="text-[11px] text-lc-muted">{t('shell.desktop.channel.forumTagsHelp')}</p>
                <ForumTagsEditor value={forumTags} onChange={setForumTags} />
              </section>
            )}

            {metaErr && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{metaErr}</div>
            )}
          </form>

          <div className="border-t border-lc-border" />

          <section className="space-y-3 p-5">
            <div className="flex min-w-0 items-center gap-3">
              <SectionHeader title={t('shell.desktop.channel.members')} hint="NIP-29 kind 9000 / 9001" /* i18n-exempt: protocol term, the NIP-29 event kinds */ />
              <span className="shrink-0 rounded-full bg-lc-card px-2 py-0.5 text-[11px] font-semibold text-lc-muted">
                {members.length}
              </span>
            </div>
            <form onSubmit={(e) => void addMember(e)} className="flex flex-wrap items-center gap-2">
              <Input
                size="sm"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder={t('shell.desktop.members.addPlaceholder')}
                spellCheck={false}
                aria-label={t('shell.desktop.members.addLabel')}
                className="flex-1 min-w-[12rem]"
              />
              {/* A bare checkbox reads as a form field; as a toggle chip it
                  reads as the role the new member will get. */}
              <Chip
                size="touch"
                state={makeAdmin ? 'selected' : 'idle'}
                onClick={() => setMakeAdmin(!makeAdmin)}
                data-testid="add-member-admin-toggle"
                className="shrink-0 whitespace-nowrap font-medium"
              >
                {makeAdmin ? `👑 ${t('shell.desktop.members.asAdmin')}` : t('shell.desktop.members.asAdmin')}
              </Chip>
              <Button type="submit" variant="pill" size="sm" disabled={memberBusy || !newMember.trim()} className="shrink-0">
                {memberBusy ? t('shell.desktop.members.adding') : t('shell.desktop.members.add')}
              </Button>
            </form>
            {memberErr && <div className="text-sm text-red-400">{memberErr}</div>}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {members.map((pk) => (
                <ManageMemberRow key={pk} groupId={group.id} pubkey={pk} isAdmin={adminSet.has(pk)} />
              ))}
              {members.length === 0 && (
                <div className="rounded-lg border border-dashed border-lc-border px-3 py-4 text-center text-xs text-lc-muted">
                  {access === 'public'
                    ? t('shell.desktop.members.emptyPublic')
                    : t('shell.desktop.members.emptyPrivate')}
                </div>
              )}
            </div>
          </section>
        </div>
        <ModalFooter
          meta={t('shell.desktop.channel.saveHelp')}
          cancel={{ onClick: onClose }}
          actions={[{
            label: savingMeta ? t('shell.desktop.channel.saving') : t('shell.desktop.channel.saveChanges'),
            form: 'channel-meta-form',
            disabled: savingMeta,
          }]}
        />
    </Modal>
  );
}
