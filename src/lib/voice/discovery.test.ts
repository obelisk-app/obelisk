import { describe, it, expect } from 'vitest';
import { DiscoveryEngine } from './discovery';

describe('DiscoveryEngine', () => {
  it('union of relay + control sources', () => {
    const d = new DiscoveryEngine();
    d.setRelayDiscovered(['a', 'b']);
    d.addControlDiscovered('c', 'b');
    d.addControlDiscovered('d', 'b');
    expect(new Set(d.effectivePeers())).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('attribution distinguishes sources', () => {
    const d = new DiscoveryEngine();
    d.setRelayDiscovered(['a']);
    d.addControlDiscovered('a', 'b');
    d.addControlDiscovered('c', 'b');
    expect(d.attribution('a')).toEqual({ relay: true, viaControl: ['b'] });
    expect(d.attribution('c')).toEqual({ relay: false, viaControl: ['b'] });
  });

  it('removeControlDiscovered keeps peer if another claimant remains', () => {
    const d = new DiscoveryEngine();
    d.addControlDiscovered('x', 'a');
    d.addControlDiscovered('x', 'b');
    expect(d.attribution('x').viaControl.sort()).toEqual(['a', 'b']);
    d.removeControlDiscovered('x', 'a');
    expect(d.attribution('x').viaControl).toEqual(['b']);
    expect(d.effectivePeers()).toContain('x');
    d.removeControlDiscovered('x', 'b');
    expect(d.effectivePeers()).not.toContain('x');
  });

  it('rejects self-claims (peer claiming itself adds no information)', () => {
    const d = new DiscoveryEngine();
    expect(d.addControlDiscovered('a', 'a')).toBe(false);
    expect(d.effectivePeers()).toEqual([]);
  });

  it('addControlDiscovered returns false on duplicate', () => {
    const d = new DiscoveryEngine();
    expect(d.addControlDiscovered('x', 'a')).toBe(true);
    expect(d.addControlDiscovered('x', 'a')).toBe(false);
  });

  it('dropClaimsFromPeer removes all entries claimed via that peer', () => {
    const d = new DiscoveryEngine();
    d.addControlDiscovered('x', 'a');
    d.addControlDiscovered('y', 'a');
    d.addControlDiscovered('x', 'b'); // x has 2 claimants
    const dropped = d.dropClaimsFromPeer('a');
    expect(dropped).toEqual(['y']); // y had only 'a' so it's dropped; x had 'b' too so it survives
    expect(d.effectivePeers()).toContain('x');
    expect(d.effectivePeers()).not.toContain('y');
  });

  it('setRelayDiscovered replaces, not merges', () => {
    const d = new DiscoveryEngine();
    d.setRelayDiscovered(['a', 'b']);
    d.setRelayDiscovered(['c']);
    expect(d.effectivePeers()).toEqual(['c']);
  });

  it('control survives a relay refresh', () => {
    const d = new DiscoveryEngine();
    d.setRelayDiscovered(['a']);
    d.addControlDiscovered('z', 'a');
    d.setRelayDiscovered(['b']); // a no longer present in relay
    expect(new Set(d.effectivePeers())).toEqual(new Set(['b', 'z']));
  });

  it('source() differentiates relay-only / control-only / both', () => {
    const d = new DiscoveryEngine();
    d.setRelayDiscovered(['relay-only', 'both']);
    d.addControlDiscovered('control-only', 'x');
    d.addControlDiscovered('both', 'x');
    expect(d.source('relay-only')).toEqual({ relay: true, control: false });
    expect(d.source('control-only')).toEqual({ relay: false, control: true });
    expect(d.source('both')).toEqual({ relay: true, control: true });
    expect(d.source('unknown')).toEqual({ relay: false, control: false });
  });

  it('reset clears all sources', () => {
    const d = new DiscoveryEngine();
    d.setRelayDiscovered(['a']);
    d.addControlDiscovered('b', 'c');
    d.reset();
    expect(d.effectivePeers()).toEqual([]);
    expect(d.size()).toBe(0);
  });
});
