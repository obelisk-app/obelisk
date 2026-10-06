/**
 * Which topology a call runs on. Decided up-front at join from the
 * channel kind (`expectSfu`), never from the beacon roster, and flipped
 * live by `setExpectSfu` when the channel is reclassified mid-call so
 * nobody has to leave and rejoin. Holds the one flag; the sessions do
 * the work.
 */
import { pickSfu } from './sfu-control';
import { VoiceError } from './errors';
import type { MeshSession } from './mesh-session';
import type { SfuSession } from './sfu-session';
import type { RoomState } from './room-state';

export interface TopologySwitchDeps {
  channelId: string;
  room: RoomState;
  mesh: MeshSession;
  sfu: SfuSession;
  /** Whether the channel asks for an SFU at construction (`voice-sfu`). */
  expectSfu: boolean;
  isJoined(): boolean;
}

export class TopologySwitch {
  /**
   * Mirrors `VoiceClientOptions.expectSfu`. Default `false`: mesh-only
   * unless the caller explicitly opts in via channel kind. Production
   * callers (VoiceRoom) pass `expectSfu: channelKind === 'voice-sfu'`, so
   * the default only affects ad-hoc / test constructions.
   */
  expectSfu: boolean;

  constructor(private readonly deps: TopologySwitchDeps) {
    this.expectSfu = deps.expectSfu;
  }

  /**
   * The topology half of `join()`: SFU when the channel asks for one, mesh
   * otherwise. Resolves to which one was entered.
   *
   * SFU-only contract: a `voice-sfu` channel ONLY uses its pinned SFU
   * (per-channel pin, then env override, then kind 31313 advertisement, via
   * `pickSfu`). No mesh fallback: operators of a big-room channel choose an
   * SFU intentionally; silently dropping to a 4-peer mesh on a transient
   * SFU outage gives a worse experience (people fail to hear each other,
   * the fifth joiner gets evicted, audio quality drops) than surfacing the
   * outage clearly and letting the user retry. The SFU is then the source
   * of truth for the participant list, so beacons and the roster REQ are
   * skipped entirely while in SFU mode.
   */
  async enter(): Promise<'mesh' | 'sfu'> {
    const { channelId, mesh, sfu } = this.deps;
    if (this.expectSfu) {
      const picked = await pickSfu(channelId).catch((err) => {
        console.warn('[voice] pickSfu threw at join', err);
        return null;
      });
      if (!picked) {
        throw new VoiceError(
          'sfuUnreachable',
          'No SFU is currently reachable for this channel. Ask the channel admin to verify the pinned SFU is online.',
        );
      }
      await sfu.enter(picked.pubkey, picked);
      return 'sfu';
    }
    await mesh.enter();
    return 'mesh';
  }

  /**
   * Live-flip whether the call should run on an SFU.
   *
   * Going `true -> false` (voice-sfu -> voice): tear down the SFU client,
   * fire `onTopologyChange(null)`, start mesh subscriptions.
   *
   * Going `false -> true` (voice -> voice-sfu): ask `pickSfu` for the
   * channel's current SFU; if found, tear down mesh + flip to SFU. If
   * no SFU is reachable, stay in mesh and tell the UI.
   */
  setExpectSfu(expect: boolean): void {
    if (this.expectSfu === expect) return;
    this.expectSfu = expect;
    const { channelId, room, mesh, sfu, isJoined } = this.deps;
    if (!isJoined()) return;
    if (!expect && sfu.pubkey) {
      const sfuPubkey = sfu.pubkey;
      sfu.exit();
      try { room.events.onTopologyChange?.(null); } catch (err) {
        console.warn('[voice] onTopologyChange handler threw', err);
      }
      void mesh.enter().catch((err) =>
        console.warn('[voice] mesh enter after SFU exit failed', err),
      );
      console.log('[voice] topology sfu:', sfuPubkey.slice(0, 8), '-> mesh');
    } else if (expect && !sfu.pubkey) {
      void (async () => {
        const picked = await pickSfu(channelId).catch((err) => {
          console.warn('[voice] pickSfu threw on setExpectSfu', err);
          return null;
        });
        if (!isJoined()) return;
        if (!picked) {
          // Channel just reclassified to voice-sfu but the pinned SFU is
          // unreachable. Surface to the UI; do not silently keep meshing:
          // the channel admin's intent is "use the SFU", not "best effort".
          try { room.events.onError?.('sfuSwitched'); }
          catch (err) { console.warn('[voice] onError handler threw', err); }
          return;
        }
        mesh.exit();
        await sfu.enter(picked.pubkey, picked);
      })();
    }
  }
}
