'use client';

import { useId } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import TextArea from '@/components/ui/TextArea';
import Input from '@/components/ui/Input';
import ModalHeader from '@/components/ui/ModalHeader';
import { useChannelSettingsForm } from '@/hooks/chat/useChannelSettingsForm';
import ForumTagsEditor from '@/components/chat/ForumTagsEditor';
import { ChannelAppearanceInput } from '@/components/media/BlossomImageInput';
import { useTranslation } from '@/i18n/context';
import { rich } from '@/i18n/rich';
import { ManageMemberRow } from './ManageMemberRow';
import { Field, SectionHeader, ToggleCard } from './form-primitives';
import Chip from '@/components/ui/Chip';

export function ChannelSettingsModal({ group, onClose }: { group: JsGroup; onClose: () => void }) {
  const { t } = useTranslation();
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
        <ModalHeader title={`Channel settings · #${group.name ?? group.id.slice(0, 8)}`} onClose={onClose} />
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={(e) => void saveMeta(e)} id="channel-meta-form" className="space-y-7 p-5">
            {/* Appearance ----------------------------------------------- */}
            <section className="space-y-4">
              <SectionHeader title={t('desktop.branding.appearance')} />
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
              <SectionHeader title={t('mobile.channel.access')} hint={t('desktop.channel.accessHint')} />
              <div className="grid gap-2 sm:grid-cols-3">
                <ToggleCard
                  active={access === 'public'}
                  onClick={() => setAccess('public')}
                  icon="🌐"
                  title={t('mobile.channel.public')}
                  subtitle={t('desktop.channel.publicHint')}
                />
                <ToggleCard
                  active={access === 'read-only'}
                  onClick={() => setAccess('read-only')}
                  icon="👁"
                  title={t('mobile.channel.readOnly')}
                  subtitle={t('desktop.channel.readOnlyHint')}
                />
                <ToggleCard
                  active={access === 'private'}
                  onClick={() => setAccess('private')}
                  icon="🔒"
                  title={t('mobile.channel.private')}
                  subtitle={t('desktop.channel.privateHint')}
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
                  title={t('desktop.channel.kindText')}
                  subtitle={t('desktop.channel.textHint')}
                />
                <ToggleCard
                  active={channelKind === 'voice'}
                  onClick={() => setChannelKind('voice')}
                  icon="🎙️"
                  title={t('desktop.channel.kindVoice')}
                  subtitle={t('desktop.channel.voiceHint')}
                />
                <ToggleCard
                  active={channelKind === 'voice-sfu'}
                  onClick={() => setChannelKind('voice-sfu')}
                  icon="📡"
                  title={t('desktop.channel.kindSfu')}
                  subtitle={t('desktop.channel.sfuHint')}
                />
                <ToggleCard
                  active={channelKind === 'forum'}
                  onClick={() => setChannelKind('forum')}
                  icon="📋"
                  title={t('desktop.channel.kindForum')}
                  subtitle={t('desktop.channel.forumHint')}
                />
              </div>
              {channelKind === 'voice' && (
                <p className="text-[11px] text-lc-muted">
                  {rich(t('desktop.channel.voiceHelp'), {
                    tag: <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice&quot;]</code>,
                    url: <code className="text-lc-white/80">/voice/{group.id.slice(0, 8)}…</code>,
                  })}
                </p>
              )}
              {channelKind === 'voice-sfu' && (
                <>
                  <p className="text-[11px] text-lc-muted">
                    {rich(t('desktop.channel.sfuHelp'), {
                      tag: <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice-sfu&quot;]</code>,
                    })}
                  </p>
                  <div className="space-y-2 rounded-lg border border-lc-border bg-lc-black/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-lc-muted">{t('desktop.sfu.operator')}</p>
                    <p className="text-[11px] text-lc-muted">
                      {rich(t('desktop.sfu.help'), {
                        info: <code className="text-lc-white/80">/info</code>,
                      })}
                    </p>
                    <div>
                      <label htmlFor={sfuUrlId} className="text-[11px] text-lc-muted">{t('desktop.sfu.url')}</label>
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
                          {sfuChecking ? 'Checking…' : 'Verify'}
                        </Button>
                      </div>
                    </div>
                    {sfuVerified && (
                      <div className="rounded-md border border-lc-green/30 bg-lc-green/5 p-2 text-[11px] text-lc-muted">
                        <span className="text-lc-green">{t('desktop.sfu.verified')}</span>
                        {sfuVerified.region ? ` · ${sfuVerified.region}` : ''}
                        {sfuVerified.cap ? ` · up to ${sfuVerified.cap} participants` : ''}
                        <div className="mt-1 break-all font-mono text-lc-white/70">{sfuVerified.pubkey}</div>
                      </div>
                    )}
                    <p className="text-[10px] text-lc-muted">{t('desktop.sfu.verifyHelp')}</p>
                  </div>
                </>
              )}
              {channelKind === 'forum' && (
                <p className="text-[11px] text-lc-muted">
                  {rich(t('desktop.channel.forumHelp'), {
                    tag: <code className="text-lc-white/80">[&quot;t&quot;,&quot;forum&quot;]</code>,
                  })}
                </p>
              )}
            </section>

            {channelKind === 'forum' && (
              <section className="space-y-3" data-testid="forum-tags-editor">
                <SectionHeader
                  title={t('desktop.channel.forumTags')}
                  hint="Curated; emitted as forum-tag NIP-29 metadata"
                />
                <p className="text-[11px] text-lc-muted">
                  Pick a small set of categories so members can browse publications by topic.
                  Authors pick from this list: they can&apos;t invent new tags. Each tag gets
                  its own colour automatically; set one explicitly if you want a specific
                  hue. Emoji is optional but helps the chip row scan at a glance.
                </p>
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
              <SectionHeader title={t('desktop.channel.members')} hint="NIP-29 kind 9000 / 9001" />
              <span className="shrink-0 rounded-full bg-lc-card px-2 py-0.5 text-[11px] font-semibold text-lc-muted">
                {members.length}
              </span>
            </div>
            <form onSubmit={(e) => void addMember(e)} className="flex flex-wrap items-center gap-2">
              <Input
                size="sm"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder={t('desktop.members.addPlaceholder')}
                spellCheck={false}
                aria-label={t('desktop.members.addLabel')}
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
                {makeAdmin ? '👑 As admin' : 'As admin'}
              </Chip>
              <Button type="submit" variant="pill" size="sm" disabled={memberBusy || !newMember.trim()} className="shrink-0">
                {memberBusy ? 'Adding…' : 'Add'}
              </Button>
            </form>
            {memberErr && <div className="text-sm text-red-400">{memberErr}</div>}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {members.map((pk) => (
                <ManageMemberRow key={pk} groupId={group.id} pubkey={pk} isAdmin={adminSet.has(pk)} />
              ))}
              {members.length === 0 && (
                <div className="rounded-lg border border-dashed border-lc-border px-3 py-4 text-center text-xs text-lc-muted">
                  No members yet. {access === 'public'
                    ? 'Not required: relay whitelist controls access.'
                    : 'Add at least one to grant access.'}
                </div>
              )}
            </div>
          </section>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-lc-border bg-lc-dark px-5 py-3">
          <div className="text-[11px] text-lc-muted">{t('desktop.channel.saveHelp')}</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="md" onClick={onClose} className="rounded-lg font-medium">
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="channel-meta-form" disabled={savingMeta}>
              {savingMeta ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </footer>
    </Modal>
  );
}
