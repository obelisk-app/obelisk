/** Session-only metadata for unopened messages. Never contains ciphertext or plaintext. */
export interface DmEncryptedMessage {
  id: string;
  counterparty: string | null;
  outgoing: boolean;
  createdAt?: number;
  status: 'locked' | 'decrypting' | 'failed';
  encryption: 'nip04' | 'nip44' | 'pq' | 'unknown';
}
