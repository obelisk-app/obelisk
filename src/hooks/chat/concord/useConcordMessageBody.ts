import { useChannelProtocol } from '@/hooks/chat/channel/useChannelProtocol';

export function useConcordMessageBody(id: string, content: string) {
  const protocol = useChannelProtocol();
  const attachments = protocol?.attachments(id) ?? [];
  const urls = new Set(attachments.map(attachment => attachment.url));
  // The SDK includes ciphertext URLs in message text for interoperability.
  // Render each as its authenticated media attachment, not an extra binary link.
  const text = content.split(/(\s+)/).filter(token => !urls.has(token)).join('').trim();
  return { attachments, text, pending: protocol?.pending?.(id) };
}
