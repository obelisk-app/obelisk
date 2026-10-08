'use client';

import Button from '@/components/ui/buttons/Button';
import { useId } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import type { MessageKey } from '@/i18n/keys';
import { useChannelSettingsForm } from '@/hooks/chat/channel/useChannelSettingsForm';
import ForumTagsEditor from '@/components/chat/forum/ForumTagsEditor';
import ChannelAppearanceInput from '@/components/media/upload/ChannelAppearanceInput';
import { useTranslations } from 'next-intl';
import { ManageMemberRowMobile } from './ManageMemberRowMobile';
import Sheet from '@/components/ui/overlays/Sheet';
import Input from '@/components/ui/forms/Input';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import TextArea from '@/components/ui/forms/TextArea';
import Checkbox from '@/components/ui/forms/Checkbox';
import SheetActions from '@/components/ui/overlays/SheetActions';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import { accessPillStyle, kindPillStyle } from '@/utils/shell/mobile/pill-styles';
import { GearIcon } from '@/assets/icons';
import Label from '@/components/ui/forms/Label';
import Text from '@/components/ui/layout/Text';

// Bottom-sheet for per-channel admin settings (kind 9002 metadata edits +
// kind 9000/9001/9003 member management). Mirrors the desktop
// ChannelSettingsModal but trimmed to fit a phone - SFU pin + advanced fields
// stay desktop-only for now; admins can still toggle the channel kind to
// voice-sfu which falls through to the env-var defaults.

/** What a person reads for each channel kind; the kind ids are wire values. */
const KIND_LABEL = {
  text: 'mobile.channel.kind.text',
  voice: 'mobile.channel.kind.voice',
  'voice-sfu': 'mobile.channel.kind.voiceSfu',
  forum: 'mobile.channel.kind.forum',
} as const satisfies Record<JsGroup['kind'], MessageKey>;

export function ChannelSettingsSheet({
  group,
  close,
}: {
  group: JsGroup;
  close: () => void;
}) {
  const t = useTranslations();
  const nameId = useId();
  const aboutId = useId();
  const sfuUrlId = useId();
  const newMemberId = useId();
  const { meta, member, sfu, adminSet, allPubkeys } = useChannelSettingsForm(group, close);
  const { access, kind: channelKind } = meta.values;

  return (
    <Sheet onClose={close} screen="channel-settings" label={t('mobile.channel.settingsTitle', { name: group.name ?? group.id.slice(0, 8) })} maxHeight="94%">
      <SheetHeader
        icon={<GearIcon size={null} />}
        title={t('mobile.channel.settingsTitle', { name: group.name ?? group.id.slice(0, 8) })}
      />

      {/* Appearance */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ChannelAppearanceInput
          picture={meta.values.picture}
          banner={meta.values.banner}
          onPictureChange={(value) => meta.set('picture', value)}
          onBannerChange={(value) => meta.set('banner', value)}
        />
      </section>

      {/* Basics */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet" htmlFor={nameId}>{t('mobile.field.name')}</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={nameId}
            {...meta.field('name')}
            data-testid="mobile-channel-settings-name"
          />
        </div>
        <Label variant="sheet" htmlFor={aboutId}>{t('mobile.field.description')}</Label>
        <div className="setup-input-wrap">
          <TextArea
            variant="mobile"
            id={aboutId}
            {...meta.field('about')}
            rows={2}
            placeholder={t('mobile.channel.descriptionPlaceholder')}
          />
        </div>
      </section>


      {/* Access */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet">{t('mobile.channel.access')}</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="bare" type="button" data-testid="mobile-channel-access-public" style={accessPillStyle(access === 'public')} onClick={() => meta.set('access', 'public')}>
            <div style={{ fontSize: 16 }}>🌐</div>
            <div>{t('mobile.channel.public')}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{t('mobile.channel.publicHint')}</div>
          </Button>
          <Button variant="bare" type="button" data-testid="mobile-channel-access-read-only" style={accessPillStyle(access === 'read-only')} onClick={() => meta.set('access', 'read-only')}>
            <div style={{ fontSize: 16 }}>👁</div>
            <div>{t('mobile.channel.readOnly')}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{t('mobile.channel.readOnlyHint')}</div>
          </Button>
          <Button variant="bare" type="button" data-testid="mobile-channel-access-private" style={accessPillStyle(access === 'private')} onClick={() => meta.set('access', 'private')}>
            <div style={{ fontSize: 16 }}>🔒</div>
            <div>{t('mobile.channel.private')}</div>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{t('mobile.channel.privateHint')}</div>
          </Button>
        </div>
      </section>

      {/* Channel kind */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet">{t('mobile.channel.type')}</Label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['text', 'voice', 'voice-sfu', 'forum'] as const).map((k) => (
            <Button
              variant="bare"
              key={k}
              type="button"
              onClick={() => meta.set('kind', k)}
              style={kindPillStyle(channelKind === k)}
            >
              {t(KIND_LABEL[k])}
            </Button>
          ))}
        </div>
        {channelKind === 'voice-sfu' && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--app-line)', borderRadius: 12, background: 'var(--app-surface)' }}
            data-testid="mobile-sfu-section"
          >
            <Label variant="sheet" htmlFor={sfuUrlId}>{t('shell.desktop.sfu.url')}</Label>
            <Text as="p" style={{ fontSize: 11, color: 'var(--app-text-dim)', margin: 0 }}>{t('shell.desktop.sfu.verifyHelp')}</Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="setup-input-wrap" style={{ flex: 1, minWidth: 0 }}>
                <Input
                  variant="mobile"
                  id={sfuUrlId}
                  value={sfu.url}
                  onChange={(e) => sfu.setUrl(e.target.value)}
                  spellCheck={false}
                  placeholder="https://sfu.obelisk.ar"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                  data-testid="mobile-sfu-url"
                />
              </div>
              <Button
                variant="mobileSecondary"
                type="button"
                onClick={() => { void sfu.verify().catch(() => undefined); }}
                disabled={sfu.checking}

                style={{ width: 'auto', padding: '0 14px', flexShrink: 0 }}
                data-testid="mobile-sfu-verify"
              >
                {sfu.checking ? t('mobile.sfu.checking') : t('mobile.sfu.verify')}
              </Button>
            </div>
            {sfu.verified && (
              <div style={{ fontSize: 11, color: 'var(--app-text-dim)' }} data-testid="mobile-sfu-verified">
                <span style={{ color: 'var(--accent)' }}>{t('shell.desktop.sfu.verified')}</span>
                {sfu.verified.region ? ` · ${sfu.verified.region}` : ''}
                {sfu.verified.cap ? ` · ${t('mobile.sfu.cap', { cap: sfu.verified.cap })}` : ''}
                <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{sfu.verified.pubkey}</div>
              </div>
            )}
          </div>
        )}
      </section>

      {channelKind === 'forum' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="mobile-forum-tags-editor">
          <Label variant="sheet">{t('shell.desktop.channel.forumTags')}</Label>
          <ForumTagsEditor value={meta.values.forumTags} onChange={(value) => meta.set('forumTags', value)} />
        </section>
      )}

      <FormError variant="sheet">{meta.error}</FormError>
      <Button
        variant="mobilePrimary"
        type="button"
        onClick={() => void meta.submit()}
        disabled={meta.submitting}

        data-testid="mobile-channel-settings-save"
      >
        {meta.submitting ? t('common.saving') : t('mobile.channel.save')}
      </Button>

      {/* Members */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet" htmlFor={newMemberId}>
          {t('mobile.members.addHelp')}
        </Label>
        <Form form={member} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="setup-input-wrap">
            <Input
              variant="mobile"
              id={newMemberId}
              {...member.field('key')}
              placeholder={t('mobile.members.addPlaceholder')}
              spellCheck={false}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            />
          </div>
          <Label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--app-text-dim)' }}>
            <Checkbox
              checked={member.values.admin}
              onChange={(e) => member.set('admin', e.target.checked)}
              aria-label={t('mobile.members.promote')}
            />
            {t('mobile.members.promote')}
          </Label>
          <FormError variant="sheet">{member.error}</FormError>
          <Button
            variant="mobilePrimary"
            type="submit"
            disabled={!member.canSubmit}

            style={{ width: 'auto', alignSelf: 'flex-start', padding: '0 18px', boxShadow: 'none' }}
          >
            {member.submitting ? t('mobile.members.adding') : t('mobile.members.add')}
          </Button>
        </Form>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Label variant="sheet">
          {t('mobile.members.count', { count: allPubkeys.length })}
        </Label>
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
