/** `https://…/app?relay=<host>&c=<id>`, the deep-link shape the app parses. */
export function channelLink(relay: string, channelId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar';
  const host = relay.replace(/^wss?:\/\//, '');
  return `${origin}/app?relay=${encodeURIComponent(host)}&c=${encodeURIComponent(channelId)}`;
}
