// src/lib/server/room-keys.ts
// Centralized Socket.io room name formatters. Prevents typos like
// `channel:${id}` vs `channels:${id}` from silently splitting fan-out.

export const roomFor = {
  channel: (id: string) => `channel:${id}`,
  server: (id: string) => `server:${id}`,
  dm: (pubkey: string) => `dm:${pubkey}`,
  post: (postId: string) => `post:${postId}`,
};
