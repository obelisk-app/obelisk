/**
 * Publish + refresh the SFU's kind 31313 advertisement.
 *
 * This is what users (and other clients) discover when they search for
 * available SFUs. Publishing is idempotent — kind 31313 is parameterized
 * replaceable on `d="obelisk-sfu"`, so re-publishing simply overwrites.
 *
 * We re-publish when:
 *   - the process boots
 *   - the allow-list reloads (SIGHUP)
 *   - every REFRESH_INTERVAL_MS as a heartbeat (in case the relay forgot)
 */
import type { Config } from './config.js';
import { KIND_SFU_ADVERTISEMENT } from './nip-kinds.js';
import { createLogger } from './log.js';
import type { RelayPool } from './relay.js';

const log = createLogger('advertise');

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class Advertiser {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: Config,
    private readonly relay: RelayPool,
  ) {}

  async start(): Promise<void> {
    // Kind 0 first so any subscriber that fetches the advertisement (kind
    // 31313) and then resolves the operator's profile gets a real avatar
    // + display name instead of a bare hex pubkey. Best-effort — failure
    // here doesn't stop the SFU from serving.
    await this.publishProfile().catch((err) =>
      log.warn('profile publish failed', { err: (err as Error).message }),
    );
    await this.publishOnce();
    this.timer = setInterval(() => {
      void this.publishOnce().catch((err) =>
        log.warn('refresh failed', { err: (err as Error).message }),
      );
    }, REFRESH_INTERVAL_MS);
    // Don't keep the event loop alive solely for the heartbeat.
    this.timer.unref?.();
  }

  /**
   * Publish a kind 0 metadata event so the SFU shows up in clients with
   * a real name + avatar. Same shape as `src/scripts/price-bot.mjs`.
   * Refreshed on SIGHUP via {@link Advertiser.republish}.
   */
  async publishProfile(): Promise<void> {
    const name = 'Obelisk SFU';
    const about = 'Mediasoup-backed selective forwarding unit for Obelisk voice/video rooms. '
      + `Capacity ${this.cfg.maxParticipantsPerRoom}/room, ${this.cfg.maxRooms} concurrent rooms. `
      + (this.cfg.publicUrl ? `Reachable at ${this.cfg.publicUrl}.` : '');
    const profile = {
      name,
      display_name: name,
      about,
      // Public-domain "satellite dish" icon — a recognisable "this account
      // is infrastructure, not a person" cue in the dex's profile popover.
      picture: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/OOjs_UI_icon_play.svg/240px-OOjs_UI_icon_play.svg.png',
      bot: true,
    };
    await this.relay.publish({
      kind: 0,
      content: JSON.stringify(profile),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    });
    log.info('profile published', { pubkey: this.relay.pubkey.slice(0, 12) + '…', name });
  }

  /**
   * Force a re-publish — call this after any operator-driven config change
   * that should be reflected publicly (allow-list edit, capacity bump).
   */
  async republish(): Promise<void> {
    await this.publishOnce();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async publishOnce(): Promise<void> {
    const tags: string[][] = [
      ['d', 'obelisk-sfu'],
      ['t', 'obelisk-sfu-advertisement'],
      ['cap', String(this.cfg.maxParticipantsPerRoom)],
      ['max_rooms', String(this.cfg.maxRooms)],
      ['version', '1'],
    ];

    if (this.cfg.publicUrl) tags.push(['url', this.cfg.publicUrl]);
    for (const r of this.cfg.relays) tags.push(['relay', r]);
    // Trusted-author relays — clients should send their kind 25052
    // `start` events here. The relay's write-whitelist authorizes
    // them automatically; no per-user allow-list maintenance.
    for (const r of this.cfg.trustedAuthorRelays) tags.push(['trusted_relay', r]);

    // Codecs the SFU forwards. v0 ships audio (opus) reliably; video is
    // best-effort. Order is preference for clients that pick.
    tags.push(['codec', 'opus']);
    tags.push(['codec', 'vp9']);
    tags.push(['codec', 'h264']);

    for (const pk of this.cfg.allowedPubkeys) tags.push(['allow', pk]);

    const operator = this.cfg.operatorPubkey ?? this.relay.pubkey;
    tags.push(['operator', operator]);

    if (this.cfg.region) tags.push(['region', this.cfg.region]);

    await this.relay.publish({
      kind: KIND_SFU_ADVERTISEMENT,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });
    log.info('advertisement published', {
      pubkey: this.relay.pubkey.slice(0, 12) + '…',
      allowed: this.cfg.allowedPubkeys.size,
      cap: this.cfg.maxParticipantsPerRoom,
      url: this.cfg.publicUrl ?? '(unset)',
    });
  }
}
