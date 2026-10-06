'use client';

import { useMyPubkey } from '@/services/nostr-bridge';
import NostrProfile from '@/components/chat/NostrProfile';
import { useTranslation } from '@/i18n/context';
import { type ScreenName } from '@/utils/shell/mobile/url-state';

export function SettingsProfileScreen({ go }: { go: (s: ScreenName) => void }) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();

  return (
    <div className="screen active" data-screen="settings-profile">
      <div className="app-header">
        <h2>{t("settings.you")}</h2>
      </div>
      {/*
        The Perfil/Preferencias pair was a two-item tab bar sitting above a
        screen that is obviously your profile. Preferences is now the gear
        beside the avatar - one target, where a phone expects it.
      */}
      <div className="min-h-0 flex-1">
        {myPubkey && (
          <NostrProfile
            mobile
            pubkey={myPubkey}
            onClose={() => {}}
            settingsMode
            onEditProfile={() => go("profile-edit")}
            onOpenSettings={() => go("settings-prefs")}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 16b - settings · profile · edit
