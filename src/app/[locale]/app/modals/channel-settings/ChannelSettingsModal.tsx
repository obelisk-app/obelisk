'use client';

import Row from '@/components/ui/layout/Row';
import { useId } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import Modal from '@/components/ui/overlays/Modal';
import Button from '@/components/ui/buttons/Button';
import TextArea from '@/components/ui/forms/TextArea';
import Input from '@/components/ui/forms/Input';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import { useChannelSettingsForm } from '@/hooks/chat/channel/useChannelSettingsForm';
import ForumTagsEditor from '@/components/chat/forum/ForumTagsEditor';
import ChannelAppearanceInput from '@/components/media/upload/ChannelAppearanceInput';
import { useTranslations } from 'next-intl';
import { ManageMemberRow } from './ManageMemberRow';
import { Field } from '../common/Field';
import { SectionHeader } from '../common/SectionHeader';
import { ToggleCard } from '../common/ToggleCard';
import Chip from '@/components/ui/data/Chip';
import Text from '@/components/ui/layout/Text';
import Label from '@/components/ui/forms/Label';

export function ChannelSettingsModal({ group, onClose }: { group: JsGroup; onClose: () => void }) {
  const t = useTranslations();
  const sfuUrlId = useId();
  const { meta, member, sfu, members, adminSet } = useChannelSettingsForm(group, onClose);
  const { access, kind: channelKind } = meta.values;

  return (
    <Modal
      onClose={onClose}
      surface="card" panelClassName="flex max-h-[90vh] w-full max-w-xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
      <ModalHeader title={t('shell.desktop.channel.settingsTitle', { name: group.name ?? group.id.slice(0, 8) })} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Form form={meta} layout="sections" error={meta.error} errorVariant="box">
          {/* Appearance ----------------------------------------------- */}
          <section className="space-y-4">
            <SectionHeader title={t('shell.desktop.branding.appearance')} />
            <ChannelAppearanceInput
              picture={meta.values.picture}
              banner={meta.values.banner}
              onPictureChange={(value) => meta.set('picture', value)}
              onBannerChange={(value) => meta.set('banner', value)}
            />
          </section>

          {/* Basics --------------------------------------------------- */}
          <section className="space-y-3">
            <Field label={t('mobile.field.name')}>
              <Input size="sm" {...meta.field('name')} />
            </Field>
            <Field label={t('mobile.field.description')}>
              <TextArea
                size="sm"
                resize="both"
                {...meta.field('about')}
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
                onClick={() => meta.set('access', 'public')}
                icon="🌐"
                title={t('mobile.channel.public')}
                subtitle={t('shell.desktop.channel.publicHint')}
              />
              <ToggleCard
                active={access === 'read-only'}
                onClick={() => meta.set('access', 'read-only')}
                icon="👁"
                title={t('mobile.channel.readOnly')}
                subtitle={t('shell.desktop.channel.readOnlyHint')}
              />
              <ToggleCard
                active={access === 'private'}
                onClick={() => meta.set('access', 'private')}
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
                onClick={() => meta.set('kind', 'text')}
                icon="💬"
                title={t('shell.desktop.channel.kindText')}
                subtitle={t('shell.desktop.channel.textHint')}
              />
              <ToggleCard
                active={channelKind === 'voice'}
                onClick={() => meta.set('kind', 'voice')}
                icon="🎙️"
                title={t('shell.desktop.channel.kindVoice')}
                subtitle={t('shell.desktop.channel.voiceHint')}
              />
              <ToggleCard
                active={channelKind === 'voice-sfu'}
                onClick={() => meta.set('kind', 'voice-sfu')}
                icon="📡"
                title={t('shell.desktop.channel.kindSfu')}
                subtitle={t('shell.desktop.channel.sfuHint')}
              />
              <ToggleCard
                active={channelKind === 'forum'}
                onClick={() => meta.set('kind', 'forum')}
                icon="📋"
                title={t('shell.desktop.channel.kindForum')}
                subtitle={t('shell.desktop.channel.forumHint')}
              />
            </div>
            {channelKind === 'voice' && (
              <Text as="p" size="11" tone="muted">
                {t.rich('shell.desktop.channel.voiceHelp', {
                  tag: () => <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice&quot;]</code>,
                  url: () => <code className="text-lc-white/80">/voice/{group.id.slice(0, 8)}…</code>,
                })}
              </Text>
            )}
            {channelKind === 'voice-sfu' && (
              <>
                <Text as="p" size="11" tone="muted">
                  {t.rich('shell.desktop.channel.sfuHelp', {
                    tag: () => <code className="text-lc-white/80">[&quot;t&quot;,&quot;voice-sfu&quot;]</code>,
                  })}
                </Text>
                <div className="space-y-2 rounded-lg border border-lc-border bg-lc-black/40 p-3">
                  <Text as="p" variant="label" size="11" tone="muted">{t('shell.desktop.sfu.operator')}</Text>
                  <Text as="p" size="11" tone="muted">
                    {t.rich('shell.desktop.sfu.help', {
                      info: () => <code className="text-lc-white/80">/info</code>,
                    })}
                  </Text>
                  <div>
                    <Label variant="field" htmlFor={sfuUrlId}>{t('shell.desktop.sfu.url')}</Label>
                    <Row gap="2" align="stretch">
                      <Input
                        id={sfuUrlId}
                        size="sm"
                        fontSize="xs"
                        value={sfu.url}
                        onChange={(e) => sfu.setUrl(e.target.value)}
                        spellCheck={false}
                        className="min-w-0 flex-1 font-mono"
                        placeholder="https://sfu.obelisk.ar"
                      />
                      <Button
                        variant="pillSecondary"
                        size="xs"
                        onClick={() => { void sfu.verify().catch(() => undefined); }}
                        disabled={sfu.checking}
                        className="shrink-0"
                      >
                        {sfu.checking ? t('shell.desktop.sfu.checking') : t('shell.desktop.sfu.verify')}
                      </Button>
                    </Row>
                  </div>
                  {sfu.verified && (
                    <Text as="div" size="11" tone="muted" className="rounded-md border border-lc-green/30 bg-lc-green/5 p-2">
                      <span className="text-lc-green">{t('shell.desktop.sfu.verified')}</span>
                      {sfu.verified.region ? ` · ${sfu.verified.region}` : ''}
                      {sfu.verified.cap ? ` · ${t('shell.desktop.sfu.capacity', { count: sfu.verified.cap })}` : ''}
                      <div className="mt-1 break-all font-mono text-lc-white/70">{sfu.verified.pubkey}</div>
                    </Text>
                  )}
                  <Text as="p" size="10" tone="muted">{t('shell.desktop.sfu.verifyHelp')}</Text>
                </div>
              </>
            )}
            {channelKind === 'forum' && (
              <Text as="p" size="11" tone="muted">
                {t.rich('shell.desktop.channel.forumHelp', {
                  tag: () => <code className="text-lc-white/80">[&quot;t&quot;,&quot;forum&quot;]</code>,
                })}
              </Text>
            )}
          </section>

          {channelKind === 'forum' && (
            <section className="space-y-3" data-testid="forum-tags-editor">
              <SectionHeader
                title={t('shell.desktop.channel.forumTags')}
                hint={t('shell.desktop.channel.forumTagsHint')}
              />
              <Text as="p" size="11" tone="muted">{t('shell.desktop.channel.forumTagsHelp')}</Text>
              <ForumTagsEditor value={meta.values.forumTags} onChange={(value) => meta.set('forumTags', value)} />
            </section>
          )}

        </Form>

        <div className="border-t border-lc-border" />

        <section className="space-y-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <SectionHeader title={t('shell.desktop.channel.members')} hint="NIP-29 kind 9000 / 9001" /* i18n-exempt: protocol term, the NIP-29 event kinds */ />
            <Text size="11" tone="muted" weight="semibold" className="shrink-0 rounded-full bg-lc-card px-2 py-0.5">
              {members.length}
            </Text>
          </div>
          <Form form={member} layout="row">
            <Input
              size="sm"
              {...member.field('key')}
              placeholder={t('shell.desktop.members.addPlaceholder')}
              spellCheck={false}
              aria-label={t('shell.desktop.members.addLabel')}
              className="flex-1 min-w-[12rem]"
            />
            {/* A bare checkbox reads as a form field; as a toggle chip it
                  reads as the role the new member will get. */}
            <Chip
              size="touch"
              state={member.values.admin ? 'selected' : 'idle'}
              onClick={() => member.set('admin', !member.values.admin)}
              data-testid="add-member-admin-toggle"
              className="shrink-0 whitespace-nowrap font-medium"
            >
              {member.values.admin ? `👑 ${t('shell.desktop.members.asAdmin')}` : t('shell.desktop.members.asAdmin')}
            </Chip>
            <Button type="submit" variant="pill" size="sm" disabled={!member.canSubmit} className="shrink-0">
              {member.submitting ? t('shell.desktop.members.adding') : t('shell.desktop.members.add')}
            </Button>
          </Form>
          <FormError>{member.error}</FormError>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {members.map((pk) => (
              <ManageMemberRow key={pk} groupId={group.id} pubkey={pk} isAdmin={adminSet.has(pk)} />
            ))}
            {members.length === 0 && (
              <Text as="div" variant="caption" className="rounded-lg border border-dashed border-lc-border px-3 py-4 text-center">
                {access === 'public'
                  ? t('shell.desktop.members.emptyPublic')
                  : t('shell.desktop.members.emptyPrivate')}
              </Text>
            )}
          </div>
        </section>
      </div>
      <ModalFooter
        meta={t('shell.desktop.channel.saveHelp')}
        cancel={{ onClick: onClose }}
        actions={[{
          label: meta.submitting ? t('shell.desktop.channel.saving') : t('shell.desktop.channel.saveChanges'),
          form: meta.id,
          disabled: meta.submitting,
        }]}
      />
    </Modal>
  );
}
