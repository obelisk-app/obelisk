import type { MediaAttachment } from '@applesauce/concord/helpers';

/** Commands for the shared chat surface. An encrypted channel never falls back to relay commands. */
export interface ChannelProtocol {
  scope: string;
  retry?(id: string): void;
  dismiss?(id: string): void;
  pending?(id: string): { phase: 'encrypting' | 'uploading' | 'sending' | 'failed'; files: File[]; previews: string[] } | undefined;
  createChannel(name: string): Promise<string>;
  send(content: string, reply: { id: string; pubkey: string } | null, tags: string[][]): Promise<unknown>;
  upload(file: File): Promise<string>;
  react(id: string, emoji: string, reactionId?: string | null): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  canDelete(id: string): boolean;
  attachments(id: string): readonly MediaAttachment[];
  download(attachment: MediaAttachment): Promise<unknown>;
}
